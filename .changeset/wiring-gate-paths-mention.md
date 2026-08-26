---
'nexus-agents': patch
---

fix(ci): stop the script-wiring gate counting a paths: mention as wiring

`isReachableFromCi` returned true on any textual occurrence of the script's
basename in the workflow text — including a `paths:` trigger entry, which never
executes anything. Deleting the
`run: npx tsx scripts/check-governor-ratification.ts` step from
`governor-review.yml` leaves the filename in two `paths:` blocks, so the gate
whose job is catching unwired gates would report it reachable.

The direct branch now requires an actual invocation — a runner (`tsx`, `node`,
`ts-node`, `bash`, `sh`) followed by the path on the same line. The npm-script
branch below it already did the careful thing; this brings the two into line.

Verified against the real workflows: 29 scripts reachable before and after, so
tightening introduced no false positives — which is the failure mode the
function's own doc comment warns about.
