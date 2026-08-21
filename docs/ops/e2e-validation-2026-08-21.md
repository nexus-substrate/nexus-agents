# E2E Validation — 2026-08-21 — nexus-agents 3.4.1→3.4.4 (sha 5f83291a27)

**Trigger:** release + ≥3 behavior-affecting fixes landed the same day.
**Adapters live:** Claude CLI, Codex CLI, Opencode CLI (Gemini warned). No `simulateVotes` used.
**Coverage:** 7/7 families.
**Result:** 4 PASS / 2 FAIL / 1 PARTIAL.
**Issues filed:** #4517, #4518, #4521, #4523. **Fixes merged:** #4520, #4522.

| #   | Family        | Verdict  | Evidence                                                                                                                                                                                                                                         |
| --- | ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Research      | PASS     | `research_discover` returned 5 items over 5 sources; both cited arXiv URLs verified HTTP 200 with matching titles. Reported `failedSources: ["semantic_scholar"]` rather than silently shrinking the result set.                                 |
| 2   | Consensus     | PASS     | 4 live panels (7-voter `higher_order` ×3, 3-voter `--quick` ×1). All returned full panels; no dead voters. Record 27 persisted at schema 1.4 with a real `optionTally` (C:4, A:2) — the #4472 gate working end to end.                           |
| 3   | Planning/exec | **FAIL** | `delegate_to_model` escalated a CHANGELOG formatting task to `security / supermajority` because **"author" matched the `auth` substring**. Second repro: a TypeDoc task escalated because the text named `security.ts`. → #4518, fixed in #4520. |
| 4   | Pipelines     | PARTIAL  | `run_dev_pipeline` dryRun returned `completed:false, securityPassed:false` but produced a correct diagnosis with a standalone 3-file minimal reproduction. Plan quality high; terminal status not a clean pass.                                  |
| 5   | Memory        | PASS     | `memory_write` → `memory_query` round-trip: content intact, relevance 0.9. `memory_stats`: session + belief live (1904 beliefs, 10000 outcomes); **5 of 7 backends report unavailable**.                                                         |
| 6   | Audit/health  | PASS*    | `verify_audit_chain` returns `ok: true` on **zero events**. Honest (reports `eventCount: 0`) but a consumer reading only `ok` sees a pass on no evidence. Noted, not filed.                                                                      |
| 7   | Repo/analysis | **FAIL** | `extract_symbols` returned _"No symbols found (file may not be TypeScript/JavaScript)"_ for a valid `.ts` file. TS/JS only, hard-gated at `symbol-extractor.ts:143`. → #4517.                                                                    |

## What the run actually bought

The pipeline family diagnosed a defect **in my own work**: #4504's premise was false. Three entry points I had reported as producing no documentation were emitting to `docs/api/exports/` and were live the whole time. The coverage gate I shipped in #4513 used a non-recursive `readdirSync` and could not see them, so its allowlist documented a bug in the checking script rather than a gap in the docs. Fixed in #4522; record corrected on #4504; the surviving consistency questions split to #4523.

Seven unit tests passed against that buggy gate because every fixture used flat module names. That is the case for this discipline in one line.

## Caveats on this run

- The MCP server was on **3.4.1** while main moved 3.4.2→3.4.4 during the run. Findings hold, but families were not all exercised against identical builds.
- Family 4 is PARTIAL, not PASS: the dry run's own status flags were false even though its output was correct. Worth a look before relying on that status field.
- `verify_audit_chain` was exercised against empty log dirs only — the `ok: true`/zero-event path is validated, a populated chain is not.
