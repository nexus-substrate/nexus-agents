/**
 * PR Review Findings — typed verification gate per #2225 + #2233 Child 3
 *
 * The Bench's load-bearing differentiator vs. existing autonomous-coding
 * frameworks (per the build-vs-buy audit on #2232) is that adversarial
 * voters MUST apply the 2026-04-25 verification gate before filing a
 * finding. Without enforcement, voters revert to the 100% false-positive
 * rate that triggered #2225 in the first place.
 *
 * This module provides the typed structures + parser. Voters are
 * instructed to emit a YAML-fenced `findings` block alongside their free-
 * form reasoning; we extract structured Findings out of that block and
 * mark each as verified or unverified based on the gate output.
 *
 * Aggregation rule (enforced in pr-review-tool.ts):
 *   request_changes requires at least one VERIFIED finding from a
 *   non-error voter. Unverified findings surface in the response but
 *   don't trigger blocking.
 *
 * @module mcp/tools/pr-review-findings
 */

import { parse as parseYaml } from 'yaml';

/** The 4-point verification gate (#2225). Each check is either `passed`
 * (the voter applied it and cleared) or a non-empty string explaining what
 * was named (only meaningful for `named_assertion`). Anything else fails. */
export interface VerificationGate {
  /** Re-read cited line + 5 lines before/after. */
  readonly reread_cited_line: 'passed' | 'failed' | 'skipped';
  /** Traced from a real entry point. */
  readonly traced_call_path: 'passed' | 'failed' | 'skipped';
  /** Concrete failing assertion named (e.g. "leaked listener", "throws on
   * null input"). String, not boolean — empty/short = failed. */
  readonly named_assertion: string;
  /** Ruled out language non-issues (JS single-threaded, Map iteration
   * semantics, etc). */
  readonly ruled_out_language_non_issue: 'passed' | 'failed' | 'skipped';
}

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface Finding {
  /** One-line summary of the issue. */
  readonly summary: string;
  /** path/file.ext:line citation. */
  readonly location: string;
  /** Severity classification. */
  readonly severity: FindingSeverity;
  /** Verification gate output. */
  readonly gate: VerificationGate;
  /** Detailed claim — what's wrong, why it matters. */
  readonly claim: string;
  /** Derived: did all 4 gate checks pass with substance? Computed by
   * `isFindingVerified`. */
  readonly verified: boolean;
}

/** Returns true if all 4 checks passed AND the named assertion is
 * substantive (length > 10 chars, not just "passed" or "OK"). The threshold
 * exists because LLMs tend to write "passed" for everything when not
 * forced to be specific — the named_assertion field is the signal that
 * the voter actually thought about the failure mode. */
export function isFindingVerified(gate: VerificationGate): boolean {
  if (gate.reread_cited_line !== 'passed') return false;
  if (gate.traced_call_path !== 'passed') return false;
  if (gate.ruled_out_language_non_issue !== 'passed') return false;
  // Substantive named assertion required — guards against rubber-stamping.
  if (gate.named_assertion.trim().length < 10) return false;
  if (/^(passed|ok|yes|done|verified)$/i.test(gate.named_assertion.trim())) return false;
  return true;
}

const FINDINGS_BLOCK_RE = /```yaml findings\n([\s\S]*?)\n```/;

/**
 * Extracts a YAML-fenced findings block from the voter's reasoning and
 * parses it into typed `Finding[]`. On any parse error or missing block,
 * returns an empty array — voters who don't follow the format are treated
 * as having no findings (i.e. approve), consistent with the gate design:
 * "if you can't articulate what's wrong, don't file."
 */
export function parseFindings(reasoning: string): readonly Finding[] {
  const match = FINDINGS_BLOCK_RE.exec(reasoning);
  if (match === null) return [];
  const yamlBody = match[1];
  if (yamlBody === undefined || yamlBody.trim() === '') return [];

  let parsed: unknown;
  try {
    parsed = parseYaml(yamlBody);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];
  return parsed.map(coerceFinding).filter((f): f is Finding => f !== null);
}

function coerceFinding(raw: unknown): Finding | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r['summary'] !== 'string' || r['summary'].trim() === '') return null;
  if (typeof r['location'] !== 'string' || r['location'].trim() === '') return null;
  if (typeof r['claim'] !== 'string' || r['claim'].trim() === '') return null;

  const gate = coerceGate(r['gate']);
  if (gate === null) return null;

  const severity = coerceSeverity(r['severity']);

  const finding: Finding = {
    summary: r['summary'].trim(),
    location: r['location'].trim(),
    severity,
    gate,
    claim: r['claim'].trim(),
    verified: isFindingVerified(gate),
  };
  return finding;
}

function coerceGate(raw: unknown): VerificationGate | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  return {
    reread_cited_line: coerceGateCheck(r['reread_cited_line']),
    traced_call_path: coerceGateCheck(r['traced_call_path']),
    named_assertion: typeof r['named_assertion'] === 'string' ? r['named_assertion'] : '',
    ruled_out_language_non_issue: coerceGateCheck(r['ruled_out_language_non_issue']),
  };
}

function coerceGateCheck(raw: unknown): 'passed' | 'failed' | 'skipped' {
  if (raw === 'passed' || raw === 'failed' || raw === 'skipped') return raw;
  // Treat truthy non-strings as "passed" leniently (LLMs may emit booleans),
  // but unknown strings or falsy → skipped (defaults to NOT verified).
  if (raw === true) return 'passed';
  if (raw === false) return 'failed';
  return 'skipped';
}

function coerceSeverity(raw: unknown): FindingSeverity {
  if (raw === 'critical' || raw === 'high' || raw === 'medium' || raw === 'low') return raw;
  return 'medium';
}

/** Findings prompt fragment — exact format the voter must emit if they
 * have findings. The proposal text in pr-review-tool.ts embeds this so
 * voters know what shape to produce. */
export const FINDINGS_FORMAT_INSTRUCTIONS = `If you have one or more findings (claims that justify request_changes), emit them in a fenced YAML block at the END of your reasoning, exactly as below. If you're approving, OMIT the block entirely.

\`\`\`yaml findings
- summary: 'One-line summary of the issue'
  location: path/file.ext:LINE
  severity: critical | high | medium | low
  gate:
    reread_cited_line: passed
    traced_call_path: passed
    named_assertion: 'Concrete failing assertion — what test would fail and how. Must be substantive, not "passed".'
    ruled_out_language_non_issue: passed
  claim: 'What is wrong and why it justifies blocking the merge.'
\`\`\`

A finding only triggers request_changes if ALL FOUR gate checks are 'passed' AND named_assertion is substantive (>10 chars, naming a concrete failure). Findings missing any of those surface as informational only — they do not block the merge. This is the #2225 verification gate; the 2026-04-25 audit found a 100% false-positive rate when this gate was not enforced.`;
