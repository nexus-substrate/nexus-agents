---
'nexus-agents': patch
---

docs: correct six JSDoc comments that misdescribed behaviour

An accuracy pass per `.rules/jsdoc-accuracy.md`. Comments only; no behaviour
change. Each was verified against the code before editing.

- `cli-adapters/composite-router-stages.ts` said tune demotions are "Default off
  → no-op" while the code reads `parseBoolEnv(TUNE_ENFORCE_ENV, true)` — default
  ON since #3323, and the adjacent line eight below said so. A reader would
  believe routing-score penalties were inert unless opted in.
- `mcp/middleware/middleware-chain.ts` documented the order as beginning with
  `auth`. There is no auth stage in the chain — `grep -c auth` over the file
  returns 1, that line. Authentication lives in `auth-handler.ts` and is wired
  separately. The documented order also inverted rate-limit and validation.
- `pipeline/v2-delegate.ts` claimed "5 built-in rules"; `BUILT_IN_RULES` is the
  single `trustTierRule`, the four siblings having been removed as unwired. A
  reader would assume cost, security and high-risk gates run on that path.
- `consensus/correlation-persistence.ts` said the "not found" error case had
  been replaced by an empty array. It had not — the `err` branch still fires
  when neither the jsonl nor the legacy file exists, which is the first-run case.
- `pipeline/agent-executor.ts` and `pipeline/iterative-consensus.ts` described
  quick mode as "3 agents instead of 6"; the full panel is 7 roles.
- `pipeline/expert-bridge.ts` and `pipeline/quality-pipeline.ts` each carried a
  JSDoc block detached from the function it described — sitting above an
  interface and a private helper respectively, so the generated types documented
  parameters those declarations do not have.
