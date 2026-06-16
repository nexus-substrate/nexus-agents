/**
 * nexus-agents/governance - Claims verification runner.
 *
 * Consumes the validated registry from `claims-registry.ts` and verifies each
 * claim against live source: every claim's `verification` recipe is executed,
 * and (as a baseline) the `subject` doc is checked for the claim's `expected`
 * literal where applicable. Pure functions over an injectable filesystem so the
 * logic is unit-testable without touching the real repo.
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
    return evidence.includes(needle) ? pass() : miss(`evidence ${v.path} missing "${needle}"`);
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

/** Verify a single claim. Pure over the injected fs. */
export function verifyClaim(claim: ClaimEntry, repoRoot: string, fs: ClaimFs): ClaimResult {
  const evidencePath = resolvePath(repoRoot, claim.verification.path);
  if (!fs.exists(evidencePath)) {
    return { id: claim.id, ok: false, detail: `evidence path missing: ${claim.verification.path}` };
  }
  // `file-exists` needs no read; every other method inspects the file body.
  const evidence = claim.verification.method === 'file-exists' ? '' : fs.read(evidencePath);
  const outcome = METHOD_VERIFIERS[claim.verification.method](claim.verification, evidence);
  return { id: claim.id, ok: outcome.ok, detail: outcome.detail };
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
