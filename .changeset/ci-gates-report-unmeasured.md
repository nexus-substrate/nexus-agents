---
'nexus-agents': patch
---

fix(ci): two gates that reported clean because their input was empty

`scripts/arch-lint.ts` graded `passed: errors.length === 0` over whatever the
source globs matched — including zero files. A directory rename or a broken
`collectLintTargets` made the architecture lint report PASSED having inspected
nothing, with `filesScanned: 0` sitting unread in the same object.

`scripts/check-registry-coverage.ts` graded `success: violations.length === 0`
over `manifest.registries` — which an empty manifest satisfies trivially.
`validateManifest`'s bitrot loop could not catch it either: no entries, no
paths to check. Emptying the manifest made the gate green.

Both now distinguish three states rather than two. An empty input reports
`unmeasured` and exits non-zero, because absence of evidence is not evidence of
compliance. The verdict logic is extracted into a pure function in each so the
empty case is testable without a filesystem.

Refs #4586. Two of the four non-governor sites that issue lists; the other two
do not survive tracing — see the PR for why. The `inject-governance.ts` and
`claims-verify.ts` sites are governor paths and need owner ratification, so they
stay open.
