---
'nexus-agents': minor
---

feat(capability-loop): code-PR scoped-token push + PR-open (#3670 Stage 3, OFF)

Add `codepr-push.ts` — the ONLY module in the code-PR capability loop that can
take an external action (a `git push` to a NEW `nexus-codepr/<runId>` feature
branch + a PR open). It ships OFF-by-default and is DOUBLE-GATED: a push is
impossible unless BOTH (a) `evaluateCodePrEnableReadiness` returns `ready` against
the explicit flag/enable-vote/owner evidence AND the durable guards-green soak
read from `readCodePrGuardsGreenSoak`, AND (b) an explicit scoped token is present
in `NEXUS_CODEPR_TOKEN`. Either block alone refuses the push.

`executeCodePrPush` runs a strict fail-closed sequence: readiness gate FIRST
(not-ready → `not_enabled`, no worktree/push), credentials required
(`no_credentials` when the token is absent/empty), build + validate the plan via
the dry-run `planCodePrRun`, then re-realize the diff in a fresh worktree and
RE-RUN `evaluateWriteGuards` immediately before push (defense-in-depth), push via
injectable seams to a `nexus-codepr/<runId>` branch (NEVER main, NEVER merge,
NEVER alter protections), and audit (hash-chained) BOTH before (intent: branch,
diff hash, token identity) and after (PR url/number). Any throw is wrapped into a
fail-closed denial; the push worktree is always discarded.

There is NO merge / auto-merge surface anywhere in the module (asserted
structurally in tests). NOT wired to any live runtime trigger / auto-remediation
enforce path — activation still requires the enable-vote + a real soak ≥ min +
owner-ack via the readiness gate (none triggered here). No MCP tool / CLI command
added.
