/**
 * Tests for stpa-validation.ts - validateToolAgainstConstraints
 *
 * Covers: happy path, constraint matching (category keywords + description
 * patterns), sanitization/prevention/rate-limit checks, warnings, edge cases.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateToolAgainstConstraints } from './stpa-validation.js';
import type { ToolDefinition, SafetyConstraint } from './stpa-types.js';
import { HazardSeverity, ConstraintEnforcement, ConstraintPriority } from './stpa-types.js';

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
  it('returns valid=true with no constraints', () => {
    const result = validateToolAgainstConstraints(
      makeTool('my_tool', 'Does something', { data: { type: 'string' } }),
      []
    );
    expect(result.valid).toBe(true);
    expect(result.toolName).toBe('my_tool');
    expect(result.violations).toHaveLength(0);
    expect(result.passed).toHaveLength(0);
  });

  it('passes constraint that does not apply to tool category', () => {
    const result = validateToolAgainstConstraints(
      makeTool('calculator', 'Math', { x: { type: 'number' } }),
      [makeConstraint('SC-1', 'Prevent random stuff', ConstraintEnforcement.PREVENT)]
    );
    expect(result.valid).toBe(true);
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
    expect(result.passed).toContain('SC-Y');
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
    expect(result.passed).toContain('N');
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
