/**
 * Tests for stpa-validation.ts - validateToolAgainstConstraints
 *
 * Covers: happy path, constraint matching (category keywords + description
 * patterns), sanitization/prevention/rate-limit checks, warnings, edge cases.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateToolAgainstConstraints } from './stpa-validation.js';
import type { ToolDefinition, SafetyConstraint } from './stpa-types.js';
import { ValidationResultSchema } from './stpa-schemas.js';
import { HazardSeverity, ConstraintEnforcement, ConstraintPriority } from './stpa-types.js';

/* eslint-disable @typescript-eslint/no-deprecated -- `ValidationResult.passed`
   is deprecated for CONSUMERS (#4592) but is still part of the contract: it is
   retained unchanged so persisted records stay comparable. These are the
   regression tests that pin that unchanged behaviour, so they must read it. */

// -- Factories ----------------------------------------------------------------

function makeTool(
  name: string,
  description: string,
  properties: Record<string, { type: string; pattern?: string; enum?: unknown[] }> = {}
): ToolDefinition {
  return {
    name,
    description,
    inputSchema: { type: 'object', properties, required: Object.keys(properties) },
  };
}

function makeConstraint(
  id: string,
  description: string,
  enforcement: ConstraintEnforcement,
  priority: ConstraintPriority = ConstraintPriority.NORMAL
): SafetyConstraint {
  return {
    id,
    description,
    mitigates: [`UCA-${id}`],
    enforcement,
    priority,
    validationFunction: `validate_${id.toLowerCase()}`,
  };
}

// -- Timer management ---------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-15T12:00:00-05:00'));
});
afterEach(() => {
  vi.useRealTimers();
});

// -- Happy Path ---------------------------------------------------------------

describe('validateToolAgainstConstraints - happy path', () => {
  it('returns valid=false with no constraints (nothing was evaluated)', () => {
    const result = validateToolAgainstConstraints(
      makeTool('my_tool', 'Does something', { data: { type: 'string' } }),
      []
    );
    // Previously pinned the vacuous pass (`valid: true` over an empty
    // constraint loop). Zero constraints means the tool was not measured (#4585).
    expect(result.valid).toBe(false);
    expect(result.toolName).toBe('my_tool');
    expect(result.violations).toHaveLength(0);
    expect(result.passed).toHaveLength(0);
  });

  it('is not valid when the only constraint does not apply to the tool', () => {
    const result = validateToolAgainstConstraints(
      makeTool('calculator', 'Math', { x: { type: 'number' } }),
      [makeConstraint('SC-1', 'Prevent random stuff', ConstraintEnforcement.PREVENT)]
    );
    // This asserted `valid: true` before #4592, and an intermediate revision
    // annotated it as deliberate on the grounds that `valid` only required a
    // constraint to be *supplied*. That is the vacuous pass with an extra step:
    // the constraint never applied, so `evaluated` is empty and nothing about
    // this tool was checked. `passed` still contains SC-1 — which is exactly
    // why `passed` is not a coverage signal.
    expect(result.valid).toBe(false);
    expect(result.evaluated).toEqual([]);
    expect(result.notApplicable).toContain('SC-1');
    expect(result.passed).toContain('SC-1');
  });

  it('returns validatedAt as a Date reflecting fake time', () => {
    const result = validateToolAgainstConstraints(
      makeTool('t', 'd', { a: { type: 'number' } }),
      []
    );
    expect(result.validatedAt).toBeInstanceOf(Date);
    expect(result.validatedAt.getFullYear()).toBe(2026);
  });
});

// -- Category-Keyword Constraint Matching -------------------------------------

describe('constraint matching - category keywords', () => {
  it('matches SHELL_EXECUTE + "injection"', () => {
    const result = validateToolAgainstConstraints(
      makeTool('bash', 'Shell', { command: { type: 'string' } }),
      [makeConstraint('SC-INJ', 'Sanitize to prevent injection', ConstraintEnforcement.SANITIZE)]
    );
    expect(result.violations.length + result.passed.length).toBeGreaterThan(0);
  });

  it('matches FILE_WRITE + "data loss"', () => {
    const result = validateToolAgainstConstraints(
      makeTool('write_file', 'Write to fs', { path: { type: 'string' } }),
      [makeConstraint('SC-DL', 'Prevent data loss', ConstraintEnforcement.SANITIZE)]
    );
    expect(result.violations.some((v) => v.constraintId === 'SC-DL')).toBe(true);
  });

  it('matches NETWORK_REQUEST + "disclosure"', () => {
    const result = validateToolAgainstConstraints(
      makeTool('fetch', 'HTTP', { url: { type: 'string' } }),
      [makeConstraint('SC-DISC', 'Prevent disclosure', ConstraintEnforcement.SANITIZE)]
    );
    expect(result.violations.some((v) => v.constraintId === 'SC-DISC')).toBe(true);
  });

  it('does not match when keyword absent from constraint', () => {
    const result = validateToolAgainstConstraints(
      makeTool('bash', 'Shell', { command: { type: 'string' } }),
      [makeConstraint('SC-X', 'Constraint about timeouts', ConstraintEnforcement.SANITIZE)]
    );
    // Repointed in #4592. This pinned `passed`, which cannot tell "checked and
    // clean" from "never checked" — and non-applicability is what it was
    // really asserting. `passed` still contains SC-X (unchanged behaviour);
    // `notApplicable` is the field that says why.
    expect(result.notApplicable).toContain('SC-X');
    expect(result.evaluated).not.toContain('SC-X');
    expect(result.passed).toContain('SC-X');
  });
});

// -- Description-Pattern Constraint Matching ----------------------------------

describe('constraint matching - description patterns', () => {
  it('matches "path" in constraint + "file" in tool desc', () => {
    const result = validateToolAgainstConstraints(
      makeTool('my_tool', 'Reads a file', { path: { type: 'string' } }),
      [makeConstraint('SC-P', 'Validate path inputs', ConstraintEnforcement.SANITIZE)]
    );
    expect(result.violations.some((v) => v.constraintId === 'SC-P')).toBe(true);
  });

  it('matches "command" in constraint + "execut" in tool desc', () => {
    const result = validateToolAgainstConstraints(
      makeTool('runner', 'Executes tasks', { command: { type: 'string' } }),
      [makeConstraint('SC-C', 'Validate command inputs', ConstraintEnforcement.SANITIZE)]
    );
    expect(result.violations.some((v) => v.constraintId === 'SC-C')).toBe(true);
  });

  it('does not match when neither term matches', () => {
    const result = validateToolAgainstConstraints(
      makeTool('calculator', 'Adds numbers', { a: { type: 'number' } }),
      [makeConstraint('SC-Y', 'Check path bounds', ConstraintEnforcement.SANITIZE)]
    );
    // Repointed in #4592: was `expect(result.passed).toContain('SC-Y')`, which
    // read a non-match as a pass. `notApplicable` is the honest bucket.
    expect(result.notApplicable).toContain('SC-Y');
    expect(result.evaluated).not.toContain('SC-Y');
  });
});

// -- Sanitization Violations --------------------------------------------------

describe('sanitization violations', () => {
  it('flags "path" string param without pattern', () => {
    const result = validateToolAgainstConstraints(
      makeTool('bash', 'Shell', { path: { type: 'string' } }),
      [makeConstraint('S1', 'Sanitize to prevent injection', ConstraintEnforcement.SANITIZE)]
    );
    const v = result.violations.find((x) => x.details.includes('path'));
    expect(v).toBeDefined();
    expect(v?.severity).toBe(HazardSeverity.HIGH);
  });

  it('flags "url" string param without pattern', () => {
    const result = validateToolAgainstConstraints(
      makeTool('fetch', 'Fetcher', { url: { type: 'string' } }),
      [makeConstraint('S2', 'Sanitize to prevent disclosure', ConstraintEnforcement.SANITIZE)]
    );
    expect(result.violations.some((v) => v.details.includes('url'))).toBe(true);
  });

  it('flags "query" string param without pattern', () => {
    const result = validateToolAgainstConstraints(
      makeTool('exec', 'Executes queries', { query: { type: 'string' } }),
      [makeConstraint('S3', 'Sanitize to prevent injection', ConstraintEnforcement.SANITIZE)]
    );
    expect(result.violations.some((v) => v.details.includes('query'))).toBe(true);
  });

  it('does not flag param with a pattern', () => {
    const result = validateToolAgainstConstraints(
      makeTool('bash', 'Shell', { path: { type: 'string', pattern: '^[a-z]+$' } }),
      [makeConstraint('S4', 'Sanitize to prevent injection', ConstraintEnforcement.SANITIZE)]
    );
    expect(result.violations.every((v) => !v.details.includes("'path'"))).toBe(true);
  });

  it('treats empty string pattern as missing', () => {
    const result = validateToolAgainstConstraints(
      makeTool('bash', 'Shell', { command: { type: 'string', pattern: '' } }),
      [makeConstraint('S5', 'Sanitize to prevent injection', ConstraintEnforcement.SANITIZE)]
    );
    expect(result.violations.some((v) => v.details.includes('command'))).toBe(true);
  });

  it('does not flag non-string typed params', () => {
    const result = validateToolAgainstConstraints(
      makeTool('bash', 'Shell', { command: { type: 'number' } }),
      [makeConstraint('S6', 'Sanitize to prevent injection', ConstraintEnforcement.SANITIZE)]
    );
    expect(result.violations).toHaveLength(0);
  });

  it('does not flag non-sensitive param names', () => {
    const result = validateToolAgainstConstraints(
      makeTool('bash', 'Shell', { label: { type: 'string' }, note: { type: 'string' } }),
      [makeConstraint('S7', 'Sanitize to prevent injection', ConstraintEnforcement.SANITIZE)]
    );
    expect(result.violations).toHaveLength(0);
  });

  it('includes remediation mentioning pattern', () => {
    const result = validateToolAgainstConstraints(
      makeTool('bash', 'Shell', { path: { type: 'string' } }),
      [makeConstraint('S8', 'Sanitize to prevent injection', ConstraintEnforcement.SANITIZE)]
    );
    expect(result.violations[0]?.remediation).toContain('pattern');
  });
});

// -- Prevention Violations ----------------------------------------------------

describe('prevention violations', () => {
  it('flags shell tool with command prop but no enum', () => {
    const result = validateToolAgainstConstraints(
      makeTool('bash', 'Shell', { command: { type: 'string' } }),
      [makeConstraint('P1', 'Prevent injection', ConstraintEnforcement.PREVENT)]
    );
    expect(result.violations.some((v) => v.severity === (HazardSeverity.CRITICAL as string))).toBe(
      true
    );
    expect(result.violations.some((v) => v.details.includes('arbitrary commands'))).toBe(true);
  });

  it('does not flag shell tool with command enum', () => {
    const result = validateToolAgainstConstraints(
      makeTool('bash', 'Shell', { command: { type: 'string', enum: ['ls', 'pwd'] } }),
      [makeConstraint('P2', 'Prevent injection', ConstraintEnforcement.PREVENT)]
    );
    expect(result.violations.every((v) => !v.details.includes('arbitrary commands'))).toBe(true);
  });

  it('does not flag non-shell tool', () => {
    const result = validateToolAgainstConstraints(
      makeTool('calculator', 'Math', { command: { type: 'string' } }),
      [makeConstraint('P3', 'Prevent injection', ConstraintEnforcement.PREVENT)]
    );
    expect(result.violations).toHaveLength(0);
  });

  it('does not flag shell tool without command property', () => {
    const result = validateToolAgainstConstraints(
      makeTool('bash', 'Shell', { script: { type: 'string' } }),
      [makeConstraint('P4', 'Prevent injection', ConstraintEnforcement.PREVENT)]
    );
    expect(result.violations.every((v) => !v.details.includes('arbitrary commands'))).toBe(true);
  });
});

// -- Rate Limit ---------------------------------------------------------------

describe('rate limit checks', () => {
  it('never produces violations for RATE_LIMIT enforcement', () => {
    const result = validateToolAgainstConstraints(
      makeTool('fetch', 'Fetcher', { url: { type: 'string' } }),
      [makeConstraint('RL1', 'Rate limit to prevent disclosure', ConstraintEnforcement.RATE_LIMIT)]
    );
    expect(result.violations.filter((v) => v.constraintId === 'RL1')).toHaveLength(0);
  });
});

// -- Warnings -----------------------------------------------------------------

describe('warnings', () => {
  it('adds NO_INPUT_SCHEMA when properties is empty', () => {
    const r = validateToolAgainstConstraints(makeTool('empty', 'No params', {}), []);
    expect(r.warnings.some((w) => w.code === 'NO_INPUT_SCHEMA')).toBe(true);
  });

  it('adds NO_INPUT_SCHEMA when properties is undefined', () => {
    const tool: ToolDefinition = {
      name: 'bare',
      description: 'Bare',
      inputSchema: { type: 'object' },
    };
    const r = validateToolAgainstConstraints(tool, []);
    expect(r.warnings.some((w) => w.code === 'NO_INPUT_SCHEMA')).toBe(true);
  });

  it('omits NO_INPUT_SCHEMA when properties exist', () => {
    const r = validateToolAgainstConstraints(makeTool('t', 'd', { a: { type: 'string' } }), []);
    expect(r.warnings.every((w) => w.code !== 'NO_INPUT_SCHEMA')).toBe(true);
  });

  it('adds UNKNOWN_CATEGORY for unrecognizable tool names', () => {
    const r = validateToolAgainstConstraints(
      makeTool('mystery', 'X', { x: { type: 'string' } }),
      []
    );
    expect(r.warnings.some((w) => w.code === 'UNKNOWN_CATEGORY')).toBe(true);
  });

  it('omits UNKNOWN_CATEGORY for recognized tool names', () => {
    const r = validateToolAgainstConstraints(
      makeTool('bash', 'Shell', { a: { type: 'string' } }),
      []
    );
    expect(r.warnings.every((w) => w.code !== 'UNKNOWN_CATEGORY')).toBe(true);
  });

  it('can produce both warnings simultaneously', () => {
    const codes = validateToolAgainstConstraints(makeTool('mystery', 'X', {}), []).warnings.map(
      (w) => w.code
    );
    expect(codes).toContain('NO_INPUT_SCHEMA');
    expect(codes).toContain('UNKNOWN_CATEGORY');
  });
});

// -- Multiple Constraints -----------------------------------------------------

describe('multiple constraints', () => {
  it('collects violations from multiple applicable constraints', () => {
    const result = validateToolAgainstConstraints(
      makeTool('bash', 'Shell', { command: { type: 'string' } }),
      [
        makeConstraint('A', 'Prevent injection', ConstraintEnforcement.PREVENT),
        makeConstraint('B', 'Sanitize to prevent injection', ConstraintEnforcement.SANITIZE),
      ]
    );
    expect(result.violations.length).toBeGreaterThanOrEqual(2);
    expect(result.valid).toBe(false);
  });

  it('tracks passed constraints separately from violations', () => {
    const result = validateToolAgainstConstraints(
      makeTool('bash', 'Shell', { command: { type: 'string' } }),
      [
        makeConstraint('M', 'Prevent injection', ConstraintEnforcement.PREVENT),
        makeConstraint('N', 'Alert on cosmic rays', ConstraintEnforcement.ALERT),
      ]
    );
    // Repointed in #4592. This asserted `passed` contains 'N' and read as
    // "the ALERT constraint was checked and held". It never was: 'N' does not
    // apply to bash at all, so no check ran. M is the one actually measured.
    expect(result.violations.map((v) => v.constraintId)).toContain('M');
    expect(result.evaluated).toContain('M');
    expect(result.notApplicable).toContain('N');
    expect(result.evaluated).not.toContain('N');
  });
});

// -- Edge Cases ---------------------------------------------------------------

describe('edge cases', () => {
  it('handles undefined properties in inputSchema for sanitize constraint', () => {
    const tool: ToolDefinition = {
      name: 'bash',
      description: 'Shell',
      inputSchema: { type: 'object' },
    };
    const result = validateToolAgainstConstraints(tool, [
      makeConstraint('E1', 'Sanitize to prevent injection', ConstraintEnforcement.SANITIZE),
    ]);
    expect(result.violations).toHaveLength(0);
  });

  it('handles readonly constraints array', () => {
    const result = validateToolAgainstConstraints(
      makeTool('t', 'd', { x: { type: 'number' } }),
      Object.freeze([makeConstraint('F', 'Alert', ConstraintEnforcement.ALERT)])
    );
    expect(result.validatedAt).toBeInstanceOf(Date);
  });

  it('case-insensitive param name matching for sanitization', () => {
    const result = validateToolAgainstConstraints(
      makeTool('bash', 'Shell', { PATH: { type: 'string' } }),
      [makeConstraint('CI', 'Sanitize to prevent injection', ConstraintEnforcement.SANITIZE)]
    );
    expect(result.violations.some((v) => v.details.includes('PATH'))).toBe(true);
  });

  it('returns one violation per constraint on first sensitive param', () => {
    const result = validateToolAgainstConstraints(
      makeTool('bash', 'Shell', {
        path: { type: 'string' },
        url: { type: 'string' },
        command: { type: 'string' },
      }),
      [makeConstraint('F1', 'Sanitize to prevent injection', ConstraintEnforcement.SANITIZE)]
    );
    expect(result.violations.filter((v) => v.constraintId === 'F1')).toHaveLength(1);
  });
});

// -- Vacuous validity (#4585) -------------------------------------------------

describe('vacuous validity (#4585)', () => {
  it('does not report a tool with no input schema as valid', () => {
    const tool: ToolDefinition = {
      name: 'bare_tool',
      description: 'Takes no declared parameters',
      inputSchema: { type: 'object' },
    };
    const result = validateToolAgainstConstraints(tool, [
      makeConstraint('U1', 'Sanitize to prevent injection', ConstraintEnforcement.SANITIZE),
    ]);
    // Inputs could not be inspected at all, so "passes all constraints" is
    // unmeasured, not true.
    expect(result.valid).toBe(false);
    expect(result.warnings.some((w) => w.code === 'NO_INPUT_SCHEMA')).toBe(true);
  });

  it('reports a parameterless tool as valid when an applicable constraint passes', () => {
    // An empty `properties` map is a *measurement*, not a missing one: this
    // tool genuinely takes no parameters, so there is nothing to sanitize and
    // the sanitization constraint below genuinely passes. Treating the empty
    // map as unmeasured made `valid: true` unreachable for every parameterless
    // tool — a permanent false alarm (#4585 follow-up).
    const result = validateToolAgainstConstraints(
      makeTool('list_workspace_files', 'List every file in the workspace root', {}),
      // Applies via the ('path' in constraint, 'file' in tool) description
      // pattern in doesConstraintApply, so this constraint is really evaluated.
      [
        makeConstraint(
          'U2',
          'Sanitize path input to prevent traversal',
          ConstraintEnforcement.SANITIZE
        ),
      ]
    );
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.passed).toContain('U2');
  });

  it('does not report validity when zero constraints were evaluated', () => {
    const result = validateToolAgainstConstraints(
      makeTool('my_tool', 'Does something', { data: { type: 'string' } }),
      []
    );
    expect(result.valid).toBe(false);
    expect(result.warnings.some((w) => w.code === 'NO_CONSTRAINTS_EVALUATED')).toBe(true);
  });

  it('omits NO_CONSTRAINTS_EVALUATED when at least one constraint was evaluated', () => {
    const result = validateToolAgainstConstraints(
      makeTool('my_tool', 'Does something', { data: { type: 'string' } }),
      [makeConstraint('U3', 'Alert on cosmic rays', ConstraintEnforcement.ALERT)]
    );
    expect(result.warnings.every((w) => w.code !== 'NO_CONSTRAINTS_EVALUATED')).toBe(true);
  });

  it('still reports valid when an applicable constraint is evaluated and passes', () => {
    // Positive control. The constraint must genuinely APPLY to the tool,
    // otherwise checkConstraint returns null and the id lands in `passed`
    // without being evaluated — which would certify "measured" on zero
    // applicable constraints, the same defect this suite exists to catch.
    // Applicability here comes from doesConstraintApply's ('path', 'file')
    // description pattern; the second assertion block proves the check is live
    // by removing the property pattern and getting a violation.
    const constraints = [
      makeConstraint(
        'U4',
        'Sanitize path input to prevent traversal',
        ConstraintEnforcement.SANITIZE
      ),
    ];

    const result = validateToolAgainstConstraints(
      makeTool('read_file', 'Read a file from disk', {
        path: { type: 'string', pattern: '^[\\w./-]+$' },
      }),
      constraints
    );
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.passed).toContain('U4');

    // Same tool, same constraint, no validation pattern: the constraint fires,
    // so the pass above was earned rather than skipped.
    const unpatterned = validateToolAgainstConstraints(
      makeTool('read_file', 'Read a file from disk', { path: { type: 'string' } }),
      constraints
    );
    expect(unpatterned.violations.map((v) => v.constraintId)).toContain('U4');
  });

  it('reports invalid (not unmeasured) when a real violation exists', () => {
    const result = validateToolAgainstConstraints(
      makeTool('bash', 'Shell', { command: { type: 'string' } }),
      [makeConstraint('U5', 'Prevent injection', ConstraintEnforcement.PREVENT)]
    );
    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });
});

// -- Coverage Fidelity (#4592) ------------------------------------------------

/**
 * `passed` conflates four outcomes (#4592): a real pass, a constraint that did
 * not apply, a RATE_LIMIT check that could never fail, and an enforcement type
 * the switch does not recognise. `evaluated` names the subset that was really
 * measured; `notApplicable` names what was skipped; anything in neither was
 * unmeasured.
 */
describe('coverage fidelity - evaluated / notApplicable (#4592)', () => {
  /** Applies via doesConstraintApply's ('path', 'file') description pattern. */
  const applicable = (id: string, enforcement: ConstraintEnforcement): SafetyConstraint =>
    makeConstraint(id, 'Sanitize path input to prevent traversal', enforcement);

  const fileTool = (
    props: Record<string, { type: string; pattern?: string }> = {}
  ): ToolDefinition => makeTool('read_file', 'Read a file from disk', props);

  it('counts an applicable constraint that is satisfied as evaluated', () => {
    const result = validateToolAgainstConstraints(
      fileTool({ path: { type: 'string', pattern: '^[\\w./-]+$' } }),
      [applicable('E1', ConstraintEnforcement.SANITIZE)]
    );
    expect(result.evaluated).toContain('E1');
    expect(result.passed).toContain('E1');
    expect(result.notApplicable).not.toContain('E1');
  });

  it('counts an applicable constraint that is violated as evaluated', () => {
    const result = validateToolAgainstConstraints(fileTool({ path: { type: 'string' } }), [
      applicable('E2', ConstraintEnforcement.SANITIZE),
    ]);
    expect(result.violations.map((v) => v.constraintId)).toContain('E2');
    expect(result.evaluated).toContain('E2');
    expect(result.passed).not.toContain('E2');
  });

  it('records a non-applicable constraint as notApplicable, not evaluated', () => {
    const result = validateToolAgainstConstraints(
      makeTool('calculator', 'Adds numbers', { a: { type: 'number' } }),
      [makeConstraint('NA1', 'Alert on cosmic rays', ConstraintEnforcement.ALERT)]
    );
    expect(result.notApplicable).toContain('NA1');
    expect(result.evaluated).not.toContain('NA1');
  });

  // An applicable constraint that no check could judge leaves the tool
  // unmeasured against it. Reporting `valid: true` there is the vacuous pass
  // this whole issue is about, relocated into the verdict field — and it is
  // the same fail-closed rule the function already applies to zero supplied
  // constraints and to an uninspectable input schema (#4592).
  it('is not valid when an applicable constraint could not be measured', () => {
    const result = validateToolAgainstConstraints(fileTool({ path: { type: 'string' } }), [
      applicable('RL1', ConstraintEnforcement.RATE_LIMIT),
    ]);

    expect(result.violations).toHaveLength(0);
    expect(result.evaluated).toHaveLength(0);
    expect(result.valid).toBe(false);
  });

  it('is not valid when every supplied constraint was judged not to apply', () => {
    // The side door the first attempt at this rule left open. Verified against
    // the real analyzer pipeline: a shell tool whose single generated
    // constraint does not apply reported `valid: true` having evaluated
    // nothing. Not applicable is still not measured.
    const result = validateToolAgainstConstraints(fileTool({ path: { type: 'string' } }), [
      makeConstraint('NA9', 'Throttle unrelated widget calls', ConstraintEnforcement.RATE_LIMIT),
    ]);

    expect(result.notApplicable).toContain('NA9');
    expect(result.evaluated).toHaveLength(0);
    expect(result.valid).toBe(false);
  });

  it('stays valid when something was evaluated and only the remainder is unmeasurable', () => {
    // The opposite failure. Requiring `unmeasured.length === 0` made file-read,
    // file-delete and shell tools permanently invalid, because the catalog
    // emits an unmeasurable RATE_LIMIT or REQUIRE_CONFIRMATION constraint for
    // those hazards by construction — no schema edit could ever clear it. The
    // gap belongs in coverage, not in the verdict.
    const result = validateToolAgainstConstraints(
      fileTool({ path: { type: 'string', pattern: '^[\\w./-]+$' } }),
      [
        applicable('E9', ConstraintEnforcement.SANITIZE),
        applicable('RL9', ConstraintEnforcement.RATE_LIMIT),
      ]
    );

    expect(result.evaluated).toEqual(['E9']);
    expect(result.violations).toHaveLength(0);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.code === 'UNMEASURED_ENFORCEMENT')).toBe(true);
  });

  it('records an applicable RATE_LIMIT constraint as unmeasured, not passed', () => {
    // checkRateLimitViolation returned null unconditionally: a check that
    // silently credited every tool it was pointed at. Rate limiting is a
    // runtime property with no representation in a JSON Schema, so the honest
    // report is "unmeasured" — neither passed nor evaluated.
    const result = validateToolAgainstConstraints(fileTool({ path: { type: 'string' } }), [
      applicable('RL1', ConstraintEnforcement.RATE_LIMIT),
    ]);
    expect(result.passed).not.toContain('RL1');
    expect(result.evaluated).not.toContain('RL1');
    expect(result.notApplicable).not.toContain('RL1');
    expect(result.warnings.some((w) => w.code === 'UNMEASURED_ENFORCEMENT')).toBe(true);
  });

  it.each([
    ConstraintEnforcement.ALERT,
    ConstraintEnforcement.REQUIRE_CONFIRMATION,
    ConstraintEnforcement.REQUIRE_PRIVILEGE,
  ])('records applicable but unhandled enforcement %s as unmeasured', (enforcement) => {
    const result = validateToolAgainstConstraints(fileTool({ path: { type: 'string' } }), [
      applicable('UE1', enforcement),
    ]);
    expect(result.passed).not.toContain('UE1');
    expect(result.evaluated).not.toContain('UE1');
    expect(result.notApplicable).not.toContain('UE1');
  });

  it('names the unmeasured constraint ids in the warning', () => {
    const result = validateToolAgainstConstraints(fileTool({ path: { type: 'string' } }), [
      applicable('UE2', ConstraintEnforcement.ALERT),
    ]);
    const warning = result.warnings.find((w) => w.code === 'UNMEASURED_ENFORCEMENT');
    expect(warning?.message).toContain('UE2');
  });

  it('omits the unmeasured warning when every constraint was judged', () => {
    const result = validateToolAgainstConstraints(
      fileTool({ path: { type: 'string', pattern: '^ok$' } }),
      [applicable('E3', ConstraintEnforcement.SANITIZE)]
    );
    expect(result.warnings.every((w) => w.code !== 'UNMEASURED_ENFORCEMENT')).toBe(true);
  });
});

// -- Bucket Invariants (#4592) ------------------------------------------------

describe('coverage buckets partition the constraint set (#4592)', () => {
  const mixed: readonly SafetyConstraint[] = [
    // applies + violated. Labelled "satisfied" in an earlier revision, which
    // was wrong: `checkSanitizationViolation` scans every property, so the
    // unpatterned `command` below makes BOTH sanitization constraints fail on
    // this tool. The satisfied-and-evaluated branch is covered by its own test
    // under a fully patterned tool, below.
    makeConstraint('P1', 'Sanitize path input', ConstraintEnforcement.SANITIZE),
    // applies + violated (command param, no pattern)
    makeConstraint('V1', 'Validate command inputs', ConstraintEnforcement.SANITIZE),
    // does not apply
    makeConstraint('N1', 'Alert on cosmic rays', ConstraintEnforcement.ALERT),
    // applies but unmeasurable
    makeConstraint('U1', 'Rate limit path access', ConstraintEnforcement.RATE_LIMIT),
  ];
  const tool = makeTool('read_file', 'Executes a file read', {
    path: { type: 'string', pattern: '^[\\w./-]+$' },
    command: { type: 'string' },
  });

  it('never places the same id in both evaluated and notApplicable', () => {
    const { evaluated, notApplicable } = validateToolAgainstConstraints(tool, mixed);
    const overlap = evaluated.filter((id) => notApplicable.includes(id));
    expect(overlap).toEqual([]);
  });

  it('places every constraint in exactly one of evaluated / notApplicable / unmeasured', () => {
    const result = validateToolAgainstConstraints(tool, mixed);
    const ids = mixed.map((c) => c.id);
    const unmeasured = ids.filter(
      (id) => !result.evaluated.includes(id) && !result.notApplicable.includes(id)
    );
    expect([...result.evaluated, ...result.notApplicable, ...unmeasured].sort()).toEqual(
      [...ids].sort()
    );
    // The unmeasured bucket is not empty by accident — U1 is in it.
    expect(unmeasured).toEqual(['U1']);
  });

  it('makes every evaluated id either passed or violated', () => {
    const result = validateToolAgainstConstraints(tool, mixed);
    const violated = result.violations.map((v) => v.constraintId);
    for (const id of result.evaluated) {
      expect(result.passed.includes(id) || violated.includes(id)).toBe(true);
    }
    expect(result.evaluated.length).toBeGreaterThan(0);
    // Both halves of the disjunction must be reachable, or this loop proves
    // only that the violated branch works. `mixed` on this tool yields no
    // satisfied constraint, so that half is pinned separately below.
    expect(violated.length).toBeGreaterThan(0);
  });

  it('routes an evaluated-and-satisfied constraint to both passed and evaluated', () => {
    // The other half of the invariant above. Every property is patterned, so
    // the sanitization check runs and finds nothing — a real pass, not a skip.
    const patterned = makeTool('read_file', 'Executes a file read', {
      path: { type: 'string', pattern: '^[\\w./-]+$' },
      command: { type: 'string', pattern: '^[\\w ]+$' },
    });
    const result = validateToolAgainstConstraints(patterned, [
      makeConstraint('S1', 'Sanitize path input', ConstraintEnforcement.SANITIZE),
    ]);

    expect(result.violations).toHaveLength(0);
    expect(result.evaluated).toEqual(['S1']);
    expect(result.passed).toContain('S1');
  });

  it('keeps `passed` overstating coverage, which is why `evaluated` exists', () => {
    const result = validateToolAgainstConstraints(tool, mixed);
    // The whole point of #4592: `passed` absorbs the non-applicable N1, so it
    // credits a constraint that no check ever looked at. `evaluated` does not.
    expect(result.passed).toContain('N1');
    expect(result.evaluated).not.toContain('N1');
    const unevaluatedButPassed = result.passed.filter((id) => !result.evaluated.includes(id));
    expect(unevaluatedButPassed).toEqual(['N1']);
  });
});

// -- Persisted-Record Compatibility (#4592) -----------------------------------

describe('ValidationResultSchema round-trip (#4592)', () => {
  const legacyRecord = {
    valid: true,
    toolName: 'read_file',
    violations: [],
    passed: ['SC-001'],
    warnings: [],
    validatedAt: new Date('2026-01-15T12:00:00-05:00'),
  };

  it('parses a record persisted before evaluated/notApplicable existed', () => {
    const parsed = ValidationResultSchema.parse(legacyRecord);
    expect(parsed.passed).toEqual(['SC-001']);
    expect(parsed.evaluated).toBeUndefined();
    expect(parsed.notApplicable).toBeUndefined();
  });

  it('parses a record carrying the new coverage fields', () => {
    const parsed = ValidationResultSchema.parse({
      ...legacyRecord,
      evaluated: ['SC-001'],
      notApplicable: ['SC-002'],
    });
    expect(parsed.evaluated).toEqual(['SC-001']);
    expect(parsed.notApplicable).toEqual(['SC-002']);
  });

  it('accepts a live validation result unchanged', () => {
    const result = validateToolAgainstConstraints(
      makeTool('read_file', 'Read a file from disk', { path: { type: 'string' } }),
      [makeConstraint('R1', 'Sanitize path input', ConstraintEnforcement.SANITIZE)]
    );
    expect(() => ValidationResultSchema.parse(result)).not.toThrow();
  });
});
