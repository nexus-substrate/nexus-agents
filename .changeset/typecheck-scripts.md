---
'nexus-agents': patch
---

`scripts/` is now typechecked, and the 14 errors that had accumulated there are fixed ([#4558](https://github.com/nexus-substrate/nexus-agents/issues/4558)).

`pnpm typecheck` is `turbo typecheck`, which fans out to each workspace's own `tsc`. The repo-root `scripts/` tree is not a workspace, so **nothing typechecked the tree that holds the governance gates** — `check-schema-fanout`, `check-deploy-stale`, `check-release-stuck`, `inject-governance`, the drift checks. Exactly the gap #4483 found for lint, where `scripts/` sat outside every ESLint scope.

Two of the fourteen were genuine API drift rather than strictness noise:

- **`pr-review-local.ts` passed `simulate: false` to `buildPrReviewProposal`**, whose input type is a `Pick<>` that has never included it — an inert argument left behind by an API change.
- **Its local `VoterResult` had drifted from `PrReviewVote`**: `role: string` where the real type is `VoterRole`, and no `processingTimeMs` at all, so it could not be passed to `aggregatePrDecisions`. `collectRealVotes` had been returning the timing all along; the mirror simply stopped following.
- **`check-authority-tier-drift.test.ts` built an `AuditLogger` config missing five required fields.** It worked because the Zod schema supplies the same values as defaults — validation papering over a type error nothing was checking.

The rest were `noUncheckedIndexedAccess` findings on regex capture groups, fixed by guarding rather than asserting, so a missing group cannot silently read as `0` or `''`.

`tsconfig.scripts.json` scopes the check and includes the package's ambient `.d.ts` files: `scripts/` imports package modules transitively, and without the `better-sqlite3` augmentation those imports report two phantom errors the package's own typecheck does not see.

Verified the gate can fail — a deliberate `GRACE_MINUTES: string = 45` is caught, and reverting returns to clean.
