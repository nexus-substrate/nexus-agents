/**
 * nexus-agents/governance - Claims Registry schema + loader.
 *
 * The claims registry (`governance/claims-registry.yaml`) is the durable home
 * for the machine-verifiable claims that README.md / ARCHITECTURE.md make about
 * the system. Each entry pairs a human-readable claim with a `verification`
 * recipe a script can run against live source, so documentation drift fails CI
 * instead of shipping silently.
 *
 * This module owns ONLY the schema + loader/validator (Epic A child #3825). The
 * verification runner (#3826) lives in `claims-verify.ts` and consumes the
 * validated registry produced here.
 *
 * @module governance/claims-registry
 * (Source: Issue #3824, #3825)
 */

import { existsSync, readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

/**
 * Verification methods a claim can use. Each is implemented by the runner in
 * `claims-verify.ts`. Kept small and explicit so a reviewer can reason about
 * exactly what a green check guarantees.
 *
 * - `file-exists`: the evidence path resolves to an existing file.
 * - `file-contains`: the evidence path exists AND contains the `expected`
 *   substring (e.g. an exported symbol name, a test title).
 * - `enum-member-count`: count the string members of the named `z.enum([...])`
 *   (or string-literal union) in the evidence file; must equal `expected`.
 * - `manifest-tool-count`: count registered MCP tools in the evidence file
 *   (`name:` entries in tool-manifest.ts); must equal `expected`.
 * - `roadmap-status`: aspirational claim — the subject doc must mark the
 *   feature with the roadmap status token in `expected` (e.g. `-`).
 */
export const VerificationMethodSchema = z.enum([
  'file-exists',
  'file-contains',
  'enum-member-count',
  'manifest-tool-count',
  'roadmap-status',
]);
export type VerificationMethod = z.infer<typeof VerificationMethodSchema>;

/** Lifecycle status of a claim relative to current reality. */
export const ClaimStatusSchema = z.enum([
  'verified', // backed by live evidence the runner checks every CI run
  'partial', // backed, but with a documented caveat (e.g. small-n eval)
  'aspirational', // roadmap; allowed only when the subject doc marks it roadmap
  'stale', // known-broken backing; tracked, must not regress to silent
]);
export type ClaimStatus = z.infer<typeof ClaimStatusSchema>;

/** Evidence categories per #3825 (test | gate | eval-artifact | adr | source). */
export const EvidenceTypeSchema = z.enum(['test', 'gate', 'eval-artifact', 'adr', 'source']);
export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;

/**
 * The verification recipe: how the runner proves (or refutes) the claim.
 * `expected` is a number for counting methods and a string for substring /
 * status methods. `symbol` names the target for `enum-member-count`.
 */
export const VerificationSchema = z
  .object({
    method: VerificationMethodSchema,
    /** Repo-root-relative path to the live backing evidence. */
    path: z.string().min(1),
    /**
     * Expected value. Numeric for `enum-member-count` / `manifest-tool-count`,
     * string for `file-contains` / `roadmap-status`. Unused by `file-exists`.
     */
    expected: z.union([z.number().int().nonnegative(), z.string().min(1)]).optional(),
    /** Target symbol name (e.g. the exported `z.enum` const) for count methods. */
    symbol: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const needsNumber = v.method === 'enum-member-count' || v.method === 'manifest-tool-count';
    const needsString = v.method === 'file-contains' || v.method === 'roadmap-status';
    if (needsNumber && typeof v.expected !== 'number') {
      ctx.addIssue({
        code: 'custom',
        message: `method '${v.method}' requires a numeric 'expected'`,
        path: ['expected'],
      });
    }
    if (needsString && typeof v.expected !== 'string') {
      ctx.addIssue({
        code: 'custom',
        message: `method '${v.method}' requires a string 'expected'`,
        path: ['expected'],
      });
    }
    if (v.method === 'enum-member-count' && v.symbol === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: `method 'enum-member-count' requires a 'symbol'`,
        path: ['symbol'],
      });
    }
  });
export type Verification = z.infer<typeof VerificationSchema>;

/** A single claim entry. `claim` text is capped at 25 words per #3825. */
export const ClaimEntrySchema = z
  .object({
    /** Stable, kebab-case identifier; never reused. */
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'id must be kebab-case'),
    /** Human-readable claim text (<=25 words). */
    claim: z
      .string()
      .min(1)
      .refine((s) => s.trim().split(/\s+/).length <= 25, 'claim must be <=25 words'),
    /** Repo-root-relative doc that makes the claim (e.g. README.md). */
    subject: z.string().min(1),
    status: ClaimStatusSchema,
    evidenceType: EvidenceTypeSchema,
    verification: VerificationSchema,
    /** ISO date (YYYY-MM-DD) the claim was last manually verified. */
    lastVerified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'lastVerified must be YYYY-MM-DD'),
    /** Optional caveat surfaced in reports (required-ish for `partial`). */
    caveat: z.string().optional(),
  })
  .strict();
export type ClaimEntry = z.infer<typeof ClaimEntrySchema>;

/** The full versioned registry document. */
export const ClaimsRegistrySchema = z
  .object({
    version: z.number().int().positive(),
    claims: z
      .array(ClaimEntrySchema)
      .min(1)
      .superRefine((claims, ctx) => {
        const seen = new Set<string>();
        for (const [i, c] of claims.entries()) {
          if (seen.has(c.id)) {
            ctx.addIssue({
              code: 'custom',
              message: `duplicate claim id '${c.id}'`,
              path: [i, 'id'],
            });
          }
          seen.add(c.id);
        }
      }),
  })
  .strict();
export type ClaimsRegistry = z.infer<typeof ClaimsRegistrySchema>;

/** Parse + validate a registry from raw YAML text. Throws `ZodError` on drift. */
export function parseClaimsRegistry(yamlText: string): ClaimsRegistry {
  const raw: unknown = parseYaml(yamlText);
  return ClaimsRegistrySchema.parse(raw);
}

/**
 * Load + validate the registry from disk.
 * @throws if the file is missing or fails schema validation.
 */
export function loadClaimsRegistry(registryPath: string): ClaimsRegistry {
  if (!existsSync(registryPath)) {
    throw new Error(`Claims registry not found: ${registryPath}`);
  }
  return parseClaimsRegistry(readFileSync(registryPath, 'utf-8'));
}
