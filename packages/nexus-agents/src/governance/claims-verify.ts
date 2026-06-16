/**
 * nexus-agents/governance - Claims verification runner.
 *
 * Consumes the validated registry from `claims-registry.ts` and verifies each
 * claim against live source: every claim's `verification` recipe is executed
 * against the source-of-truth `path`, AND — when the verification declares a
 * `subjectContains` literal — the `subject` doc that actually makes the claim
 * is checked for that literal (#3877). The doc-side check is what catches
 * documentation drift: a README that says "200 MCP tools" while source has 46
 * fails the gate even though the source side passes. Pure functions over an
 * injectable filesystem so the logic is unit-testable without touching the real
 * repo.
 *
 * This is the seam #3826 wires into CI as a blocking gate.
 *
 * @module governance/claims-verify
 * (Source: Issue #3824, #3825, #3826)
 */

import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import type { ClaimEntry, ClaimsRegistry } from './claims-registry.js';

/** Minimal filesystem surface, injectable for tests. */
export interface ClaimFs {
  exists(path: string): boolean;
  read(path: string): string;
}

/** Default filesystem backed by `node:fs`. */
export const nodeFs: ClaimFs = {
  exists: (p): boolean => existsSync(p),
  read: (p): string => readFileSync(p, 'utf-8'),
};

/** Result of verifying one claim. */
export interface ClaimResult {
  id: string;
  ok: boolean;
  /** Human-readable reason; populated for failures, optional context on pass. */
  detail: string;
}

/** Aggregate verification outcome. */
export interface VerifyReport {
  results: ClaimResult[];
  passed: boolean;
}

/**
 * Count string members of a named `z.enum([...])` or string-literal union in
 * source. Matches `export const Name = z.enum([ ... ])` or `type Name = 'a' | 'b'`.
 */
export function countEnumMembers(source: string, symbol: string): number | null {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const enumMatch = source.match(new RegExp(`${escaped}\\s*=\\s*z\\.enum\\(\\[([\\s\\S]*?)\\]`));
  if (enumMatch?.[1] !== undefined) {
    return [...enumMatch[1].matchAll(/['"][^'"]+['"]/g)].length;
  }
  const unionMatch = source.match(new RegExp(`type\\s+${escaped}\\s*=\\s*([\\s\\S]*?);`));
  if (unionMatch?.[1] !== undefined) {
    return unionMatch[1]
      .split('|')
      .map((s) => s.trim().replace(/['"]/g, ''))
      .filter((s) => s.length > 0).length;
  }
  return null;
}

/** Count registered MCP tools (`name:` entries) in a tool-manifest source. */
export function countManifestTools(source: string): number {
  return [...source.matchAll(/\bname:\s*['"][a-z0-9_]+['"]/g)].length;
}

function resolvePath(repoRoot: string, p: string): string {
  return isAbsolute(p) ? p : join(repoRoot, p);
}

/**
 * Strip `//` line comments and `/* … *\/` block comments from source so a
 * `file-contains` / `source-contains-all` needle that survives only in a
 * comment (e.g. `// removed verify_audit_chain`) no longer counts as evidence
 * (#3879). Deliberately conservative: it does not parse strings, so a needle
 * inside a string literal still matches — that is acceptable for the symbol /
 * tool-name claims these methods back.
 */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // line comments (keep e.g. http://)
}

/** Outcome of a single verification method, before it is tagged with the id. */
interface MethodOutcome {
  ok: boolean;
  detail: string;
}

const pass = (detail = ''): MethodOutcome => ({ ok: true, detail });
const miss = (detail: string): MethodOutcome => ({ ok: false, detail });

/** Per-method verifiers, keyed by `VerificationMethod`. Each is small + flat. */
const METHOD_VERIFIERS: Record<
  ClaimEntry['verification']['method'],
  (v: ClaimEntry['verification'], evidence: string) => MethodOutcome
> = {
  'file-exists': () => pass(),

  'file-contains': (v, evidence) => {
    const needle = String(v.expected);
    if (stripComments(evidence).includes(needle)) return pass();
    // Distinguish "absent entirely" from "present only in a comment" so a
    // reviewer sees that the symbol was commented out, not merely typo'd.
    return evidence.includes(needle)
      ? miss(`evidence ${v.path} has "${needle}" only in comments, not real code`)
      : miss(`evidence ${v.path} missing "${needle}"`);
  },

  'source-contains-all': (v, evidence) => {
    const code = stripComments(evidence);
    const needles = String(v.expected)
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const missing = needles.filter((n) => !code.includes(n));
    return missing.length === 0
      ? pass(`all present: ${needles.join(', ')}`)
      : miss(`evidence ${v.path} missing in real code: ${missing.join(', ')}`);
  },

  'enum-member-count': (v, evidence) => {
    const sym = v.symbol ?? '';
    const count = countEnumMembers(evidence, sym);
    if (count === null) return miss(`could not find enum/union '${sym}' in ${v.path}`);
    return count === v.expected
      ? pass(`${sym}=${String(count)}`)
      : miss(`${sym} has ${String(count)}, expected ${String(v.expected)}`);
  },

  'manifest-tool-count': (v, evidence) => {
    const count = countManifestTools(evidence);
    return count === v.expected
      ? pass(`tools=${String(count)}`)
      : miss(`manifest has ${String(count)} tools, expected ${String(v.expected)}`);
  },

  // Aspirational claim: the subject doc must mark the feature with the roadmap
  // status token in `expected` (e.g. a `-` cell in the roadmap row).
  'roadmap-status': (v, evidence) => {
    const token = String(v.expected);
    return evidence.includes(token)
      ? pass(`roadmap token "${token}" present`)
      : miss(`subject ${v.path} no longer marks claim as roadmap ("${token}")`);
  },
};

/**
 * Verify the `subject` doc actually makes the claim (#3877). Runs only when the
 * verification declares a `subjectContains` literal. Returns `null` (i.e. "no
 * objection") when there is nothing to check, otherwise a failed `MethodOutcome`
 * if the literal is absent (or the subject doc is missing).
 */
function verifySubject(claim: ClaimEntry, repoRoot: string, fs: ClaimFs): MethodOutcome | null {
  const { subjectContains } = claim.verification;
  if (subjectContains === undefined) return null;
  const subjectPath = resolvePath(repoRoot, claim.subject);
  if (!fs.exists(subjectPath)) {
    return miss(`subject doc missing: ${claim.subject}`);
  }
  return fs.read(subjectPath).includes(subjectContains)
    ? null
    : miss(`subject ${claim.subject} no longer states "${subjectContains}" (doc drift)`);
}

/** Verify a single claim. Pure over the injected fs. */
export function verifyClaim(claim: ClaimEntry, repoRoot: string, fs: ClaimFs): ClaimResult {
  const evidencePath = resolvePath(repoRoot, claim.verification.path);
  if (!fs.exists(evidencePath)) {
    return { id: claim.id, ok: false, detail: `evidence path missing: ${claim.verification.path}` };
  }
  // `file-exists` needs no read; every other method inspects the file body.
  const evidence = claim.verification.method === 'file-exists' ? '' : fs.read(evidencePath);
  const outcome = METHOD_VERIFIERS[claim.verification.method](claim.verification, evidence);
  if (!outcome.ok) {
    return { id: claim.id, ok: false, detail: outcome.detail };
  }
  // Source side passed — now confirm the DOC making the claim is consistent.
  const subjectOutcome = verifySubject(claim, repoRoot, fs);
  if (subjectOutcome !== null) {
    return { id: claim.id, ok: false, detail: subjectOutcome.detail };
  }
  return { id: claim.id, ok: true, detail: outcome.detail };
}

/** Verify every claim in the registry. */
export function verifyClaims(
  registry: ClaimsRegistry,
  repoRoot: string,
  fs: ClaimFs = nodeFs
): VerifyReport {
  const results = registry.claims.map((c) => verifyClaim(c, repoRoot, fs));
  return { results, passed: results.every((r) => r.ok) };
}
