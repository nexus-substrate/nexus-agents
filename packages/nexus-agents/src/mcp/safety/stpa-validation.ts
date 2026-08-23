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
 * only when at least one constraint was evaluated, the tool's inputs were
 * inspectable, and nothing was violated. Two vacuous-pass cases used to report
 * `valid: true` because `violations.length === 0` (#4585):
 *
 *  - zero constraints — the check loop never ran, so nothing was measured
 *  - no input schema — inputs cannot be inspected, so no input-shaped
 *    constraint can be judged (the code already said as much in a warning)
 *
 * Callers distinguish "unmeasured" from "violated" with the existing fields:
 * `violations` is non-empty for a real violation, while an unmeasured result
 * carries the `NO_CONSTRAINTS_EVALUATED` / `NO_INPUT_SCHEMA` warning codes.
 * `ValidationResult.valid` is a boolean in the shared type, so the honest value
 * for "could not be measured" is `false` — fail closed rather than launder an
 * uninspected tool as safe.
 *
 * @param tool - Tool definition to validate
 * @param constraints - Safety constraints to check against
 * @returns Validation result with violations and warnings
 */
export function validateToolAgainstConstraints(
  tool: ToolDefinition,
  constraints: readonly SafetyConstraint[]
): ValidationResult {
  const violations: ConstraintViolation[] = [];
  const passed: string[] = [];
  const warnings: ValidationWarning[] = [];

  const category = classifyTool(tool.name);

  for (const constraint of constraints) {
    const violation = checkConstraint(tool, constraint, category);

    if (violation) {
      violations.push(violation);
    } else {
      passed.push(constraint.id);
    }
  }

  // Nothing was checked: the constraint loop above iterated zero times (#4585).
  const noConstraintsEvaluated = constraints.length === 0;
  if (noConstraintsEvaluated) {
    warnings.push({
      code: 'NO_CONSTRAINTS_EVALUATED',
      message: 'No safety constraints were supplied; the tool was not measured',
      affected: 'constraints',
    });
  }

  // Add warnings for tools without schema validation
  const inputsUnvalidatable =
    !tool.inputSchema.properties || Object.keys(tool.inputSchema.properties).length === 0;
  if (inputsUnvalidatable) {
    warnings.push({
      code: 'NO_INPUT_SCHEMA',
      message: 'Tool has no input schema defined; cannot validate inputs',
      affected: 'inputSchema',
    });
  }

  // Add warning for unknown tool categories
  if (category === ToolCategory.UNKNOWN) {
    warnings.push({
      code: 'UNKNOWN_CATEGORY',
      message: 'Tool category could not be determined; manual review recommended',
      affected: 'name',
    });
  }

  // Name the empty case instead of letting `violations.length === 0` speak for
  // it: an unmeasured tool is not a passing tool (#4585).
  const measured = !noConstraintsEvaluated && !inputsUnvalidatable;

  return {
    valid: measured && violations.length === 0,
    toolName: tool.name,
    violations,
    passed,
    warnings,
    validatedAt: new Date(getTimeProvider().now()),
  };
}

/**
 * Checks a single constraint against a tool.
 */
function checkConstraint(
  tool: ToolDefinition,
  constraint: SafetyConstraint,
  category: ToolCategory
): ConstraintViolation | null {
  // Check if constraint applies to this tool category
  const constraintApplies = doesConstraintApply(constraint, tool, category);
  if (!constraintApplies) return null;

  // Check for common violations based on enforcement type
  switch (constraint.enforcement) {
    case ConstraintEnforcement.SANITIZE:
      return checkSanitizationViolation(tool, constraint);
    case ConstraintEnforcement.PREVENT:
      return checkPreventionViolation(tool, constraint);
    case ConstraintEnforcement.RATE_LIMIT:
      return checkRateLimitViolation(tool, constraint);
    default:
      return null;
  }
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

/**
 * Checks for rate limit-related violations.
 */
function checkRateLimitViolation(
  _tool: ToolDefinition,
  _constraint: SafetyConstraint
): ConstraintViolation | null {
  // Rate limiting is typically enforced at runtime, not in schema
  // This check would need runtime context to be meaningful
  return null;
}
