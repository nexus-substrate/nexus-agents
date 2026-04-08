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

import type { SecurityFinding, FindingSeverity, SarifParseResult } from './sarif-types.js';
import { SARIF_LEVEL_MAP, SEVERITY_ORDER } from './sarif-types.js';

// ============================================================================
// SARIF JSON Shape (minimal subset for parsing)
// ============================================================================

interface SarifLocation {
  readonly physicalLocation?: {
    readonly artifactLocation?: { readonly uri?: string };
    readonly region?: {
      readonly startLine?: number;
      readonly endLine?: number;
      readonly snippet?: { readonly text?: string };
    };
  };
}

interface SarifResult {
  readonly ruleId?: string;
  readonly level?: string;
  readonly message?: { readonly text?: string };
  readonly locations?: readonly SarifLocation[];
}

interface SarifRule {
  readonly id: string;
  readonly shortDescription?: { readonly text?: string };
  readonly defaultConfiguration?: { readonly level?: string };
  readonly properties?: {
    readonly precision?: string;
    readonly tags?: readonly string[];
    readonly 'security-severity'?: string;
  };
  readonly helpUri?: string;
  readonly help?: { readonly markdown?: string };
}

interface SarifRun {
  readonly tool?: {
    readonly driver?: {
      readonly name?: string;
      readonly rules?: readonly SarifRule[];
    };
  };
  readonly results?: readonly SarifResult[];
}

interface SarifLog {
  readonly version?: string;
  readonly runs?: readonly SarifRun[];
}

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
/** Try parsing JSON, returning null on failure. */
function tryParseJson(json: string): SarifLog | null {
  try {
    return JSON.parse(json) as SarifLog;
  } catch {
    return null;
  }
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
  const log = tryParseJson(sarifJson);
  if (log === null) {
    return { scanner: 'unknown', totalFindings: 0, findings: [], errors: ['Invalid JSON'] };
  }
  return parseLog(log, maxFindings, errors);
}

/** Extract findings from a parsed SARIF log. */
function parseLog(log: SarifLog, maxFindings: number, errors: string[]): SarifParseResult {
  const runs = log.runs;
  if (runs === undefined || runs.length === 0) {
    return { scanner: 'unknown', totalFindings: 0, findings: [], errors: ['No runs in SARIF'] };
  }
  const run = runs[0];
  const scanner = run.tool?.driver?.name ?? 'unknown';
  const ruleMap = buildRuleMap(run.tool?.driver?.rules ?? []);
  const results = run.results ?? [];
  const findings = collectFindings(results, scanner, ruleMap, errors);
  return {
    scanner,
    totalFindings: findings.length,
    findings: findings.slice(0, maxFindings),
    errors,
  };
}

/** Collect and sort findings from SARIF results. */
function collectFindings(
  results: readonly SarifResult[],
  scanner: string,
  ruleMap: ReadonlyMap<string, SarifRule>,
  errors: string[]
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  for (const result of results) {
    const finding = parseResult(result, scanner, ruleMap, errors);
    if (finding !== null) findings.push(finding);
  }
  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return findings;
}

// ============================================================================
// Internal Helpers
// ============================================================================

/** Build rule ID → rule metadata lookup. */
function buildRuleMap(rules: readonly SarifRule[]): ReadonlyMap<string, SarifRule> {
  const map = new Map<string, SarifRule>();
  for (const rule of rules) {
    map.set(rule.id, rule);
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

/** Get the first physical location from a SARIF result, or null. */
function getPhysicalLocation(result: SarifResult): SarifLocation['physicalLocation'] | null {
  const locations = result.locations;
  if (locations === undefined || locations.length === 0) return null;
  return locations[0].physicalLocation ?? null;
}

/** Extract file and line from SARIF location. */
function extractLocation(result: SarifResult): ParsedLocation | null {
  const phys = getPhysicalLocation(result);
  if (phys === null || phys === undefined) return null;
  return buildParsedLocation(phys);
}

/** Build ParsedLocation from a physical location. Returns null if required fields missing. */
function buildParsedLocation(
  phys: NonNullable<SarifLocation['physicalLocation']>
): ParsedLocation | null {
  const file = phys.artifactLocation?.uri;
  const startLine = phys.region?.startLine;
  if (file === undefined || file === '' || startLine === undefined) return null;
  return {
    file,
    startLine,
    endLine: phys.region?.endLine,
    snippet: phys.region?.snippet?.text?.slice(0, 500),
  };
}

/** Parse a single SARIF result into a SecurityFinding. */
function parseResult(
  result: SarifResult,
  scanner: string,
  ruleMap: ReadonlyMap<string, SarifRule>,
  errors: string[]
): SecurityFinding | null {
  const ruleId = result.ruleId ?? 'unknown';
  const rule = ruleMap.get(ruleId);
  const loc = extractLocation(result);

  if (loc === null) {
    errors.push(`Skipped finding ${ruleId}: missing location`);
    return null;
  }

  const message = result.message?.text ?? rule?.shortDescription?.text ?? ruleId;
  return {
    id: `${scanner}:${ruleId}:${loc.file}:${String(loc.startLine)}`,
    scanner,
    rule: ruleId,
    severity: resolveSeverity(result.level, rule),
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

/** Resolve severity from result level, rule properties, or defaults. */
function resolveSeverity(level: string | undefined, rule: SarifRule | undefined): FindingSeverity {
  const fromScore = resolveSeverityFromScore(rule);
  if (fromScore !== null) return fromScore;
  if (level !== undefined) return SARIF_LEVEL_MAP[level] ?? 'medium';
  const ruleLevel = rule?.defaultConfiguration?.level;
  if (ruleLevel !== undefined) return SARIF_LEVEL_MAP[ruleLevel] ?? 'medium';
  return 'medium';
}

/** Try to resolve severity from security-severity property. */
function resolveSeverityFromScore(rule: SarifRule | undefined): FindingSeverity | null {
  if (rule === undefined) return null;
  const props = rule.properties;
  if (props === undefined) return null;
  const secSeverity = props['security-severity'];
  if (secSeverity === undefined) return null;
  const score = parseFloat(secSeverity);
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
