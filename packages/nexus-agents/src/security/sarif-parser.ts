/**
 * SARIF Parser (#1682)
 *
 * Parses SARIF 2.1.0 JSON output from security scanners into unified
 * SecurityFinding objects. Supports Semgrep, CodeQL, Bandit, and any
 * SARIF-compliant scanner.
 *
 * @module security/sarif-parser
 * (Source: Issue #1681, #1682 — Proactive Defensive Security)
 */

import { z } from 'zod';

import type { SecurityFinding, FindingSeverity, SarifParseResult } from './sarif-types.js';
import { SARIF_LEVEL_MAP, SEVERITY_ORDER } from './sarif-types.js';

// ============================================================================
// SARIF JSON Shape (minimal subset for parsing)
// ============================================================================

/**
 * SARIF arrives as stdout from an external subprocess (semgrep, via
 * `runSemgrep` in `mcp/tools/security-scan.ts`), so it is untrusted input at a
 * trust boundary. It used to be `JSON.parse(json) as SarifLog` (#5328): the
 * cast made every field below a *claim* rather than a fact, and the claims
 * reached the ship gate. A string `startLine` produced a `SecurityFinding` that
 * violated `SecurityFindingSchema` while typechecking fine, because a cast
 * satisfies the compiler and nothing else checked.
 *
 * These schemas cover the subset of SARIF 2.1.0 the parser reads. Unknown keys
 * pass through — SARIF logs carry far more than this and rejecting extra fields
 * would fail on every real scanner. What they pin is the *type* of each field
 * that is actually consumed.
 *
 * Note that `SecurityFindingSchema` is deliberately NOT re-applied to the
 * constructed finding. Once the input is validated the output is correct by
 * construction, so a runtime output check could not fail — it would be exactly
 * the vacuous gate this change exists to remove. The schema is used as the
 * oracle in `sarif-parser-trust.test.ts` instead, where it can fail.
 */
/**
 * `.catch(undefined)` on every decorative field, deliberately.
 *
 * The first version of this schema (#5343) rejected the whole RESULT when any
 * field failed — including `endLine`, `snippet`, and an out-of-range
 * `startLine`. An adversarial review of that commit showed the consequence: a
 * result with `level: 'error'` (a BLOCKING severity) and `endLine: 0` produced
 * zero findings. A malformed decorative field deleted a finding that would have
 * failed the ship gate, which is strictly worse than the severity laundering
 * #5343 set out to fix — it converted a validation into a fail-OPEN.
 *
 * So the rule here is: a field that cannot change the verdict must never be
 * able to suppress the finding. `.catch(undefined)` drops the bad value and
 * keeps the result. `uri` is `.optional()` rather than `.min(1)` for the same
 * reason — `extractLocation` already treats an empty path as a missing
 * location, which skips the finding WITH the long-standing disclosure instead
 * of silently discarding the result.
 */
const SarifLocationSchema = z.object({
  physicalLocation: z
    .object({
      artifactLocation: z.object({ uri: z.string().optional().catch(undefined) }).optional(),
      region: z
        .object({
          startLine: z.number().optional().catch(undefined),
          endLine: z.number().int().min(1).optional().catch(undefined),
          snippet: z
            .object({ text: z.string().optional().catch(undefined) })
            .optional()
            .catch(undefined),
        })
        .optional(),
    })
    .optional(),
});

const SarifResultSchema = z.object({
  ruleId: z.string().nullish(),
  level: z.string().nullish(),
  message: z.object({ text: z.string().optional() }).nullish(),
  locations: z.array(SarifLocationSchema).nullish(),
});

/**
 * Same discipline as the location schema, and for a sharper reason.
 *
 * Dropping a rule does not drop its findings — it strips them of their CWEs,
 * help URL, and, because `security-severity` outranks `level`, their SEVERITY.
 * A rule carrying `security-severity: 9.8` as a NUMBER (the field is
 * scanner-defined, not spec-typed, so a number is entirely plausible) was
 * discarded whole; its finding then resolved from `level: 'warning'` to
 * `'medium'`, below `BLOCKING_SEVERITIES`. A 9.8 crossed the blocking boundary
 * in the fail-OPEN direction, and `Skipped rule 0` never named the finding it
 * had just downgraded.
 *
 * `id` stays required: it is the map key, and a rule without one cannot be
 * looked up by any finding, so skipping it costs nothing.
 */
const SarifRuleSchema = z.object({
  id: z.string(),
  shortDescription: z.object({ text: z.string().optional().catch(undefined) }).optional(),
  defaultConfiguration: z.object({ level: z.string().optional().catch(undefined) }).optional(),
  properties: z
    .object({
      precision: z.string().optional().catch(undefined),
      tags: z.array(z.string()).optional().catch(undefined),
      // Accept the number form and normalize; `resolveSeverityFromScore`
      // parses it either way.
      'security-severity': z.union([z.string(), z.number()]).optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
  helpUri: z.string().optional().catch(undefined),
  help: z.object({ markdown: z.string().optional().catch(undefined) }).optional(),
});

/**
 * Runs and results are arrays of `unknown` here on purpose. Validating each
 * element inside the envelope schema would make ONE malformed result discard
 * the entire scan, which is the opposite of what a security gate wants. Each
 * element is validated individually at its point of use, so a bad result is
 * skipped and disclosed while its siblings are still reported.
 */
const SarifRunSchema = z.object({
  tool: z
    .object({
      driver: z
        .object({
          name: z.string().optional(),
          rules: z.array(z.unknown()).optional(),
        })
        .optional(),
    })
    .optional(),
  results: z.array(z.unknown()).nullish(),
});

const SarifLogSchema = z.object({
  version: z.string().optional(),
  runs: z.array(z.unknown()).optional(),
});

type SarifLocation = z.infer<typeof SarifLocationSchema>;
type SarifResult = z.infer<typeof SarifResultSchema>;
type SarifRule = z.infer<typeof SarifRuleSchema>;
type SarifRun = z.infer<typeof SarifRunSchema>;
type SarifLog = z.infer<typeof SarifLogSchema>;

/**
 * The severity assigned when a SARIF level is present but outside the spec.
 *
 * SARIF 2.1.0 defines exactly four levels (none/note/warning/error) and
 * `SARIF_LEVEL_MAP` covers all four, so this fires only for a level we do not
 * understand. It used to be `'medium'`, which is below `BLOCKING_SEVERITIES`
 * in `pipeline/security-gate.ts` — so "we could not read this severity"
 * silently became "this does not block the ship gate", and `agent-executor`
 * recorded security as passed for a finding the scanner had reported.
 *
 * Fail closed instead: an unreadable severity blocks, and the unmapped level is
 * named in `SarifParseResult.errors` so the record says why.
 */
const UNMAPPED_LEVEL_SEVERITY: FindingSeverity = 'high';

/** Longest message `SecurityFindingSchema` accepts. */
const MAX_MESSAGE_LENGTH = 2000;

// ============================================================================
// Public API
// ============================================================================

/**
 * Parse a SARIF JSON string into normalized SecurityFinding objects.
 *
 * @param sarifJson - Raw SARIF JSON string
 * @param maxFindings - Maximum findings to return (default: 100)
 * @returns Parsed findings sorted by severity
 */
/**
 * Parse and validate the SARIF envelope.
 *
 * Returns a discriminated result rather than `null` so the caller can tell
 * "this is not JSON" from "this is JSON that is not a SARIF log" — previously
 * both collapsed to `'Invalid JSON'`, and a top-level array reached
 * `log.runs`, read `undefined`, and reported the honest-sounding
 * `'No runs in SARIF'`.
 */
function parseEnvelope(json: string): { ok: true; log: SarifLog } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: 'Invalid JSON' };
  }
  const parsed = SarifLogSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: `Malformed SARIF log: ${describeZodError(parsed.error)}` };
  }
  return { ok: true, log: parsed.data };
}

/** Condense a Zod error to a single line naming the offending paths. */
function describeZodError(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}

/**
 * Parse a SARIF JSON string into normalized SecurityFinding objects.
 *
 * @param sarifJson - Raw SARIF JSON string
 * @param maxFindings - Maximum findings to return (default: 100)
 * @returns Parsed findings sorted by severity
 */
export function parseSarif(sarifJson: string, maxFindings = 100): SarifParseResult {
  const errors: string[] = [];
  const envelope = parseEnvelope(sarifJson);
  if (!envelope.ok) {
    return { scanner: 'unknown', totalFindings: 0, findings: [], errors: [envelope.error] };
  }
  return parseLog(envelope.log, maxFindings, errors);
}

/** Extract findings from a parsed SARIF log. */
/** Pull the scanner name and its rule list out of a run's tool driver. */
function describeDriver(run: SarifRun): { scanner: string; rules: readonly unknown[] } {
  const driver = run.tool?.driver;
  return { scanner: driver?.name ?? 'unknown', rules: driver?.rules ?? [] };
}

/** An empty result carrying one reason, for the several ways a log yields nothing. */
function emptyResult(error: string): SarifParseResult {
  return { scanner: 'unknown', totalFindings: 0, findings: [], errors: [error] };
}

function parseLog(log: SarifLog, maxFindings: number, errors: string[]): SarifParseResult {
  const runs = log.runs;
  if (runs === undefined || runs.length === 0) return emptyResult('No runs in SARIF');

  const parsedRun = SarifRunSchema.safeParse(runs[0]);
  if (!parsedRun.success) {
    return emptyResult(`Malformed SARIF run: ${describeZodError(parsedRun.error)}`);
  }
  const { scanner, rules } = describeDriver(parsedRun.data);
  const ruleMap = buildRuleMap(rules, errors);
  const findings = collectFindings(parsedRun.data.results ?? [], scanner, ruleMap, errors);
  return {
    scanner,
    totalFindings: findings.length,
    findings: findings.slice(0, maxFindings),
    errors,
  };
}

/** Collect and sort findings from SARIF results. */
function collectFindings(
  results: readonly unknown[],
  scanner: string,
  ruleMap: ReadonlyMap<string, SarifRule>,
  errors: string[]
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  for (const [index, raw] of results.entries()) {
    // Per-result validation, not per-log: one unreadable result is skipped and
    // disclosed, while the rest of the scan is still reported. Discarding the
    // whole scan on one bad result would turn a partial read into a clean pass.
    const parsed = SarifResultSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push(`Skipped result ${String(index)}: ${describeZodError(parsed.error)}`);
      continue;
    }
    const finding = parseResult(parsed.data, scanner, ruleMap, errors);
    if (finding !== null) findings.push(finding);
  }
  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return findings;
}

// ============================================================================
// Internal Helpers
// ============================================================================

/** Build rule ID → rule metadata lookup. */
function buildRuleMap(rules: readonly unknown[], errors: string[]): ReadonlyMap<string, SarifRule> {
  const map = new Map<string, SarifRule>();
  for (const [index, raw] of rules.entries()) {
    const parsed = SarifRuleSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push(`Skipped rule ${String(index)}: ${describeZodError(parsed.error)}`);
      continue;
    }
    map.set(parsed.data.id, parsed.data);
  }
  return map;
}

/** Parsed location from a SARIF result. */
interface ParsedLocation {
  file: string;
  startLine: number;
  endLine?: number;
  snippet?: string;
}

/** Get the first physical location, or null if missing. */
function getFirstPhysicalLocation(
  result: SarifResult
): NonNullable<SarifLocation['physicalLocation']> | null {
  const locations = result.locations;
  if (locations === undefined || locations === null || locations.length === 0) return null;
  const first = locations[0];
  if (first === undefined) return null;
  return first.physicalLocation ?? null;
}

/** Build a ParsedLocation from validated physical location fields. */
function buildLocation(
  file: string,
  startLine: number,
  phys: NonNullable<SarifLocation['physicalLocation']>
): ParsedLocation {
  const loc: ParsedLocation = { file, startLine };
  const endLine = phys.region?.endLine;
  const snippetText = phys.region?.snippet?.text;
  if (endLine !== undefined) loc.endLine = endLine;
  if (snippetText !== undefined) loc.snippet = snippetText.slice(0, 500);
  return loc;
}

/**
 * Extract file and line from SARIF location.
 *
 * An unusable `startLine` (0, negative, fractional) does NOT discard the
 * finding. The line number is metadata; the severity, rule and file are the
 * verdict-bearing facts, and a security finding with a bad line number is still
 * a security finding. It is normalized to 1 and the substitution is disclosed
 * in `errors`, so the record does not present a fabricated line as measured.
 */
function extractLocation(
  result: SarifResult,
  ruleId: string,
  errors: string[]
): ParsedLocation | null {
  const phys = getFirstPhysicalLocation(result);
  if (phys === null) return null;
  const file = phys.artifactLocation?.uri;
  const rawStartLine = phys.region?.startLine;
  if (file === undefined || file === '' || rawStartLine === undefined) return null;

  const startLine = usableStartLine(rawStartLine);
  if (startLine !== rawStartLine) {
    errors.push(
      `Finding ${ruleId}: startLine ${String(rawStartLine)} is not a valid 1-based line; ` +
        `recorded as ${String(startLine)} — the location is unknown, not measured`
    );
  }
  return buildLocation(file, startLine, phys);
}

/**
 * The value if it carries content, else `undefined`.
 *
 * Written out rather than using `||` so the empty case is named: these feed
 * `SecurityFindingSchema` fields declared `min(1)`, where `''` and absent must
 * reach the same fallback.
 */
function firstNonEmpty(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  return value.length > 0 ? value : undefined;
}

/** SARIF lines are 1-based integers; anything else is unusable. */
function usableStartLine(line: number): number {
  return Number.isInteger(line) && line >= 1 ? line : 1;
}

/**
 * Resolve severity, recording in `errors` when it was assigned rather than read.
 *
 * The disclosure lives with the resolution because a severity the parser
 * guessed and a severity the scanner stated must not look alike to the gate
 * that consumes them.
 */
function severityWithDisclosure(
  result: SarifResult,
  rule: SarifRule | undefined,
  ruleId: string,
  errors: string[]
): FindingSeverity {
  const { severity, unmappedLevel } = resolveSeverity(result.level ?? undefined, rule);
  if (unmappedLevel !== undefined) {
    errors.push(
      `Finding ${ruleId}: SARIF level '${unmappedLevel}' is not defined by the spec; ` +
        `severity recorded as '${severity}' (fail-closed), not measured`
    );
  }
  return severity;
}

/** Parse a single SARIF result into a SecurityFinding. */
function parseResult(
  result: SarifResult,
  scanner: string,
  ruleMap: ReadonlyMap<string, SarifRule>,
  errors: string[]
): SecurityFinding | null {
  // An EMPTY ruleId is not a rule id. `??` let `''` through and produced
  // `rule: ''`, violating SecurityFindingSchema's `min(1)` — the exact defect
  // #5343 claimed to close, reached by an input its hostile table omitted.
  const ruleId = firstNonEmpty(result.ruleId) ?? 'unknown';
  const rule = ruleMap.get(ruleId);
  const loc = extractLocation(result, ruleId, errors);

  if (loc === null) {
    errors.push(`Skipped finding ${ruleId}: missing location`);
    return null;
  }

  // Same reason as ruleId: an empty message is not a message.
  const rawMessage =
    firstNonEmpty(result.message?.text) ?? firstNonEmpty(rule?.shortDescription?.text) ?? ruleId;
  const message = rawMessage.slice(0, MAX_MESSAGE_LENGTH);
  const severity = severityWithDisclosure(result, rule, ruleId, errors);

  return {
    id: `${scanner}:${ruleId}:${loc.file}:${String(loc.startLine)}`,
    scanner,
    rule: ruleId,
    severity,
    message,
    file: loc.file,
    startLine: loc.startLine,
    endLine: loc.endLine,
    cweIds: extractCweIds(rule),
    confidence: resolveConfidence(rule),
    snippet: loc.snippet,
    helpUrl: rule?.helpUri,
  };
}

/** Map a CVSS-style numeric score to a severity tier. */
function scoreToSeverity(score: number): FindingSeverity {
  if (score >= 9.0) return 'critical';
  if (score >= 7.0) return 'high';
  if (score >= 4.0) return 'medium';
  return 'low';
}

/**
 * Resolve severity from result level, rule properties, or defaults.
 *
 * `unmappedLevel` is set when a level was present but outside the SARIF spec,
 * so the caller can disclose it. Returning it alongside the severity — rather
 * than logging inside — keeps the disclosure on the same path as the value it
 * describes; a severity that was guessed and a severity that was read must not
 * be indistinguishable to the gate that consumes them.
 */
function resolveSeverity(
  level: string | undefined,
  rule: SarifRule | undefined
): { severity: FindingSeverity; unmappedLevel?: string } {
  const fromScore = resolveSeverityFromScore(rule);
  if (fromScore !== null) return { severity: fromScore };
  if (level !== undefined) return mapLevel(level);
  const ruleLevel = rule?.defaultConfiguration?.level;
  if (ruleLevel !== undefined) return mapLevel(ruleLevel);
  return { severity: 'medium' };
}

/** Map one SARIF level, reporting it when the spec does not define it. */
function mapLevel(level: string): { severity: FindingSeverity; unmappedLevel?: string } {
  const mapped = SARIF_LEVEL_MAP[level];
  if (mapped !== undefined) return { severity: mapped };
  return { severity: UNMAPPED_LEVEL_SEVERITY, unmappedLevel: level };
}

/** Try to resolve severity from security-severity property. */
function resolveSeverityFromScore(rule: SarifRule | undefined): FindingSeverity | null {
  if (rule === undefined) return null;
  const props = rule.properties;
  if (props === undefined) return null;
  const secSeverity = props['security-severity'];
  if (secSeverity === undefined) return null;
  // Scanners emit this as a string ("9.8") or a number (9.8) — the property is
  // scanner-defined, not fixed by the SARIF spec.
  const score = typeof secSeverity === 'number' ? secSeverity : parseFloat(secSeverity);
  if (isNaN(score)) return null;
  return scoreToSeverity(score);
}

/** Extract CWE IDs from rule tags. */
function extractCweIds(rule: SarifRule | undefined): string[] {
  const tags = rule?.properties?.tags ?? [];
  return tags
    .filter((t) => /^(?:CWE-\d+|external\/cwe\/cwe-\d+)$/i.test(t))
    .map((t) => {
      const match = /(\d+)/.exec(t);
      const num = match?.[1];
      return num !== undefined ? `CWE-${num}` : t;
    });
}

/** Resolve confidence from rule precision. */
function resolveConfidence(rule: SarifRule | undefined): number {
  const precision = rule?.properties?.precision;
  if (precision === 'very-high') return 0.95;
  if (precision === 'high') return 0.8;
  if (precision === 'medium') return 0.6;
  if (precision === 'low') return 0.3;
  return 0.5;
}
