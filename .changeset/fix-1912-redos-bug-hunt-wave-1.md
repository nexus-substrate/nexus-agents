---
'nexus-agents': patch
---

fix(security): eliminate 3 ReDoS patterns surfaced in bug-hunt sweep (#1912)

The CodeQL ReDoS fix in v2.30.2 (#1899) addressed one `[\s\S]*`-greedy-match pattern in `pipeline/agent-executor.ts`. A focused bug-hunt sweep across `src/cli-adapters/`, `src/orchestration/`, and `src/mcp/` surfaced 3 more call sites with the same anti-pattern:

- `orchestration/consensus-plan.ts:217` — `/\{[\s\S]*\}/`
- `orchestration/triangulated-review.ts:232` — `/\[[\s\S]*\]/`
- `cli-adapters/parsers/gemini-parser-resilient.ts:207-210` — compound pattern with THREE `[\s\S]*` groups (worst case)
- `mcp/tools/orchestrate-reflection.ts:94` — `/\[[\s\S]*\]/`

All replaced with the shared ReDoS-safe `extractJsonArray` / `extractJsonObject` helpers (`src/core/json-extract.ts`) — O(n) index-based slicing, no regex backtracking. 10 regression tests including 100k-char pathological inputs that complete in <100ms.

The local `extractJsonArray` helper in `pipeline/agent-executor.ts` (introduced in #1899) is now a re-export of the canonical shared version, preserving API compatibility.
