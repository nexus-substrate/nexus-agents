/**
 * nexus-agents/mcp/safety - STPA Validation Functions
 *
 * Functions for validating tools against safety constraints.
 */

import { getTimeProvider } from '../../core/index.js';
import type {
  ToolDefinition,
  SafetyConstraint,
  ValidationResult,
  ConstraintViolation,
  ValidationWarning,
} from './stpa-types.js';
import { HazardSeverity, ConstraintEnforcement } from './stpa-types.js';
import { classifyTool, ToolCategory } from './hazard-catalog.js';

// =============================================================================
// Tool Validation
// =============================================================================

/**
 * Validates a tool against a set of safety constraints.
 *
 * `valid` is an assertion that the tool was *measured* and passed. It is true
 * only when at least one constraint was supplied, the tool's inputs were
 * inspectable, and nothing was violated. Two vacuous-pass cases used to report
 * `valid: true` because `violations.length === 0` (#4585):
 *
 *  - zero constraints — the check loop never ran, so nothing was measured
 *  - no input schema — inputs cannot be inspected, so no input-shaped
 *    constraint can be judged (the code already said as much in a warning)
 *
 * "No input schema" means the `properties` map is *absent or unreadable*. An
 * empty `properties` map is not that case: a parameterless tool has been
 * inspected and found to have nothing to sanitize, which is a measurement.
 * Conflating the two made `valid: true` unreachable for every parameterless
 * tool — a check that can only ever fail is as useless as one that can only
 * ever pass.
 *
 * Callers distinguish "unmeasured" from "violated" with the existing fields:
 * `violations` is non-empty for a real violation, while an unmeasured result
 * carries the `NO_CONSTRAINTS_EVALUATED` / `NO_INPUT_SCHEMA` warning codes.
 * `ValidationResult.valid` is a boolean in the shared type, so the honest value
 * for "could not be measured" is `false` — fail closed rather than launder an
 * uninspected tool as safe.
 *
 * Coverage is a separate question from `valid`, and `evaluated` answers it
 * (#4592). `valid` can still be `true` with `evaluated` empty — a tool none of
 * the supplied constraints govern violates nothing — so a caller asking "how
 * much of the constraint set was actually checked?" must read `evaluated` and
 * the `UNMEASURED_ENFORCEMENT` warning, not `valid` and not `passed`.
 *
 * @param tool - Tool definition to validate
 * @param constraints - Safety constraints to check against
 * @returns Validation result with violations, coverage buckets, and warnings
 */
export function validateToolAgainstConstraints(
  tool: ToolDefinition,
  constraints: readonly SafetyConstraint[]
): ValidationResult {
  const { violations, passed, evaluated, notApplicable, unmeasured } = bucketConstraints(
    tool,
    constraints
  );

  // Nothing was checked: the constraint loop iterated zero times (#4585).
  const noConstraintsEvaluated = constraints.length === 0;
  const inputs = inspectInputSchema(tool);
  const warnings = collectWarnings(tool, { noConstraintsEvaluated, inputs, unmeasured });

  // `valid` asserts the tool was measured and passed, so the condition is that
  // at least one constraint was actually *evaluated* — applicable, and judged
  // by a check that could have failed (#4592).
  //
  // Two weaker rules were tried and both are wrong, verified against the real
  // analyzer pipeline rather than reasoned about:
  //
  //  - `constraints.length > 0` lets the vacuous pass through the side door. A
  //    shell tool whose single generated constraint does not apply reported
  //    `valid: true` having evaluated nothing at all.
  //  - additionally requiring `unmeasured.length === 0` fails closed so hard it
  //    can never open. The catalog emits an unmeasurable RATE_LIMIT or
  //    REQUIRE_CONFIRMATION constraint for file-read, file-delete and shell
  //    hazards, so those tools would be permanently `valid: false` with no
  //    schema edit able to clear it — a gate that is always red on the highest
  //    risk categories is a false alarm, not a signal.
  //
  // The unmeasured remainder is reported as coverage instead: it is named in
  // `UNMEASURED_ENFORCEMENT` and excluded from `evaluated`, which is where a
  // caller asking "how much was checked?" must look.
  const measured = evaluated.length > 0 && !inputs.uninspectable;

  return {
    valid: measured && violations.length === 0,
    toolName: tool.name,
    violations,
    passed,
    evaluated,
    notApplicable,
    warnings,
    validatedAt: new Date(getTimeProvider().now()),
  };
}

/** Inputs the warning set is derived from. */
interface WarningContext {
  readonly noConstraintsEvaluated: boolean;
  readonly inputs: InputSchemaInspection;
  /** Applicable constraints no check could judge (#4592). */
  readonly unmeasured: readonly string[];
}

/**
 * Builds the non-blocking warnings, each of which names a way the result is
 * less complete than it looks.
 */
function collectWarnings(tool: ToolDefinition, ctx: WarningContext): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  if (ctx.unmeasured.length > 0) {
    warnings.push({
      code: 'UNMEASURED_ENFORCEMENT',
      message:
        `No check exists for the enforcement type of ${String(ctx.unmeasured.length)} applicable ` +
        `constraint(s), so they were not measured: ${ctx.unmeasured.join(', ')}`,
      affected: 'constraints',
    });
  }

  if (ctx.noConstraintsEvaluated) {
    warnings.push({
      code: 'NO_CONSTRAINTS_EVALUATED',
      message: 'No safety constraints were supplied; the tool was not measured',
      affected: 'constraints',
    });
  }

  if (ctx.inputs.noParameters) {
    warnings.push({
      code: 'NO_INPUT_SCHEMA',
      message: 'Tool has no input schema defined; cannot validate inputs',
      affected: 'inputSchema',
    });
  }

  if (classifyTool(tool.name) === ToolCategory.UNKNOWN) {
    warnings.push({
      code: 'UNKNOWN_CATEGORY',
      message: 'Tool category could not be determined; manual review recommended',
      affected: 'name',
    });
  }

  return warnings;
}

/** Constraint ids sorted into the buckets `ValidationResult` reports (#4592). */
interface ConstraintBuckets {
  readonly violations: ConstraintViolation[];
  /** Historical field: satisfied ids AND non-applicable ids. See `evaluated`. */
  readonly passed: string[];
  readonly evaluated: string[];
  readonly notApplicable: string[];
  /** Applicable, but no check exists for the enforcement type. */
  readonly unmeasured: string[];
}

/**
 * Sorts each constraint into exactly one of evaluated / notApplicable /
 * unmeasured, and mirrors the historical `passed` contents alongside.
 */
function bucketConstraints(
  tool: ToolDefinition,
  constraints: readonly SafetyConstraint[]
): ConstraintBuckets {
  const buckets: ConstraintBuckets = {
    violations: [],
    passed: [],
    evaluated: [],
    notApplicable: [],
    unmeasured: [],
  };
  const category = classifyTool(tool.name);

  for (const constraint of constraints) {
    const outcome = checkConstraint(tool, constraint, category);

    switch (outcome.kind) {
      case 'violated':
        buckets.violations.push(outcome.violation);
        buckets.evaluated.push(constraint.id);
        break;
      case 'satisfied':
        buckets.passed.push(constraint.id);
        buckets.evaluated.push(constraint.id);
        break;
      case 'not_applicable':
        // `passed` keeps its historical contents so persisted records stay
        // comparable, but the skip is now also named for what it is (#4592).
        buckets.passed.push(constraint.id);
        buckets.notApplicable.push(constraint.id);
        break;
      case 'unmeasured':
        // Applicable, but no check exists that could have failed it. Crediting
        // it to `passed` is what made coverage a fiction (#4592).
        buckets.unmeasured.push(constraint.id);
        break;
    }
  }

  return buckets;
}

/** What the tool's declared input schema does and does not tell us (#4585). */
interface InputSchemaInspection {
  /**
   * The property map is absent or is not a readable object, so the inputs
   * could not be inspected at all — no input-shaped constraint can be judged.
   */
  readonly uninspectable: boolean;
  /**
   * The tool exposes no parameters — either because the map was unreadable or
   * because it is present and empty. An empty map is a measurement (there is
   * nothing to sanitize), which is why it is tracked separately from
   * `uninspectable`.
   */
  readonly noParameters: boolean;
}

/**
 * Separates "inputs could not be inspected" from "tool declares no parameters".
 */
function inspectInputSchema(tool: ToolDefinition): InputSchemaInspection {
  const declaredProperties = tool.inputSchema.properties;
  const uninspectable = declaredProperties === undefined || typeof declaredProperties !== 'object';
  return {
    uninspectable,
    noParameters: uninspectable || Object.keys(declaredProperties).length === 0,
  };
}

/**
 * What checking one constraint against one tool established.
 *
 * Before #4592 all four of these collapsed to `null`, and the caller read
 * `null` as "passed". Only `satisfied` is a pass.
 */
type ConstraintOutcome =
  /** A check ran and failed. */
  | { readonly kind: 'violated'; readonly violation: ConstraintViolation }
  /** A check ran that could have failed, and did not. */
  | { readonly kind: 'satisfied' }
  /** The constraint does not govern this tool; nothing was checked. */
  | { readonly kind: 'not_applicable' }
  /** The constraint applies, but no check exists for its enforcement type. */
  | { readonly kind: 'unmeasured' };

/**
 * Checks a single constraint against a tool.
 *
 * Enforcement types with no schema-level check — `RATE_LIMIT`, `ALERT`,
 * `REQUIRE_CONFIRMATION`, `REQUIRE_PRIVILEGE` — are reported as `unmeasured`
 * rather than passed. They are runtime properties; nothing in a JSON Schema
 * expresses "how often may this be called" or "was a human asked", so a
 * schema-time verdict on them would be invented, not measured (#4592).
 */
function checkConstraint(
  tool: ToolDefinition,
  constraint: SafetyConstraint,
  category: ToolCategory
): ConstraintOutcome {
  // Check if constraint applies to this tool category
  const constraintApplies = doesConstraintApply(constraint, tool, category);
  if (!constraintApplies) return { kind: 'not_applicable' };

  // Check for common violations based on enforcement type
  switch (constraint.enforcement) {
    case ConstraintEnforcement.SANITIZE:
      return toOutcome(checkSanitizationViolation(tool, constraint));
    case ConstraintEnforcement.PREVENT:
      return toOutcome(checkPreventionViolation(tool, constraint));
    default:
      return { kind: 'unmeasured' };
  }
}

/** Lifts a check's `violation | null` return into the outcome vocabulary. */
function toOutcome(violation: ConstraintViolation | null): ConstraintOutcome {
  return violation === null ? { kind: 'satisfied' } : { kind: 'violated', violation };
}

/** Category-to-keyword mapping for constraint matching. */
const CATEGORY_KEYWORDS: ReadonlyMap<ToolCategory, string> = new Map([
  [ToolCategory.SHELL_EXECUTE, 'injection'],
  [ToolCategory.FILE_WRITE, 'data loss'],
  [ToolCategory.NETWORK_REQUEST, 'disclosure'],
]);

/** Description pattern pairs for matching. */
const DESC_PATTERNS: ReadonlyArray<[string, string]> = [
  ['path', 'file'],
  ['command', 'execut'],
];

/**
 * Determines if a constraint applies to a tool based on category and description.
 */
function doesConstraintApply(
  constraint: SafetyConstraint,
  tool: ToolDefinition,
  category: ToolCategory
): boolean {
  const desc = constraint.description.toLowerCase();
  const toolDesc = tool.description.toLowerCase();

  // Category-based matching
  const keyword = CATEGORY_KEYWORDS.get(category);
  if (keyword !== undefined && desc.includes(keyword)) return true;

  // Description-based matching
  for (const [constraintTerm, toolTerm] of DESC_PATTERNS) {
    if (desc.includes(constraintTerm) && toolDesc.includes(toolTerm)) return true;
  }

  return false;
}

/**
 * Checks for sanitization-related violations.
 */
function checkSanitizationViolation(
  tool: ToolDefinition,
  constraint: SafetyConstraint
): ConstraintViolation | null {
  const properties = tool.inputSchema.properties ?? {};

  // Check if string properties have validation patterns
  for (const [name, prop] of Object.entries(properties)) {
    const property = prop as { type?: string; pattern?: string };
    const isString = property.type === 'string';
    const hasNoPattern = property.pattern === undefined || property.pattern === '';

    if (isString && hasNoPattern) {
      // Check if parameter name suggests it needs sanitization
      if (/path|command|url|query/i.test(name)) {
        return {
          constraintId: constraint.id,
          constraintDescription: constraint.description,
          severity: HazardSeverity.HIGH,
          details: `Parameter '${name}' accepts arbitrary strings without validation pattern`,
          remediation: `Add a 'pattern' property to validate '${name}' input`,
        };
      }
    }
  }

  return null;
}

/**
 * Checks for prevention-related violations.
 */
function checkPreventionViolation(
  tool: ToolDefinition,
  constraint: SafetyConstraint
): ConstraintViolation | null {
  const category = classifyTool(tool.name);

  // Shell tools without command restrictions
  if (category === ToolCategory.SHELL_EXECUTE) {
    const properties = tool.inputSchema.properties ?? {};
    const commandProp = properties['command'] as { enum?: unknown[] } | undefined;

    if (commandProp && !commandProp.enum) {
      return {
        constraintId: constraint.id,
        constraintDescription: constraint.description,
        severity: HazardSeverity.CRITICAL,
        details: 'Shell execution tool allows arbitrary commands without allowlist',
        remediation: 'Add an enum property to restrict allowed commands',
      };
    }
  }

  return null;
}

// `checkRateLimitViolation` was removed in #4592. It returned `null`
// unconditionally, so every RATE_LIMIT constraint it was pointed at landed in
// `passed` — a check that could not fail, silently certifying tools it never
// examined. Rate limiting needs call counts and a window, neither of which is
// reachable from a tool's JSON Schema, so there was nothing to implement here.
// RATE_LIMIT constraints now fall to the `unmeasured` arm of `checkConstraint`
// and are reported as such. The constraints themselves are unchanged: the
// generator still emits RATE_LIMIT for RESOURCE_EXHAUSTION / DENIAL_OF_SERVICE
// hazards (see `getEnforcementForCategory` in stpa-helpers.ts) and the runtime
// enforcer that can actually judge them is `mcp/middleware/tool-rate-limiter.ts`.
