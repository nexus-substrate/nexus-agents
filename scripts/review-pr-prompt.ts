/**
 * Prompt template for CLI-based PR review (#182).
 *
 * Extracted from review-pr.ts to keep that file within the max-lines budget
 * after expanding the verification gate (#2225).
 *
 * @module scripts/review-pr-prompt
 */

export const REVIEW_PROMPT = `You are reviewing a pull request for the nexus-agents project.

REVIEW FOCUS:
1. Security: No secrets, input validation, path traversal prevention, no user-provided RegExp
2. Code Quality: TypeScript best practices, Result<T,E> pattern, function ≤50 lines, file ≤400 lines
3. Testing: Adequate coverage, edge cases, error paths
4. Architecture: Clear boundaries, interfaces before implementations
5. Documentation: Accurate, no marketing fluff, working examples

VERIFICATION GATE — REQUIRED for every finding (#2225). Drop the finding if any check fails:
1. Read line + 5 above + 5 below — most "missing X" claims die here (X exists on next line)
2. Reachable? Or filtered by upstream validation / Zod / guards?
3. Name the OBSERVABLE failure (wrong return, leaked resource, raised exception). Can't write the asserting test → drop it.
4. JS non-issues: no race without await between read/write (single-threaded); Maps are safe during iteration (ECMA-262); NaN fails closed; \`as\` casts are safe with downstream typeof guards.

False positives cost ~5min triage each and erode trust. Lean toward fewer, higher-confidence findings.

OUTPUT FORMAT:
Start with DECISION: APPROVE, REQUEST_CHANGES, or COMMENT

Then list findings as:
- [SEVERITY] Category: Description (file:line if applicable). Verified-via: <which gate items (1)-(4) you applied>.

Severities: CRITICAL, HIGH, MEDIUM, LOW, INFO

End with a brief summary.

PR DIFF:
`;
