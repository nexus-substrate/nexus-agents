---
'nexus-agents': patch
---

fix(governance): two governor-path gates passed when they scanned nothing

Both decided a verdict from an empty collection that was empty because nothing
was inspected, not because nothing was wrong.

- `governance/claims-coverage.ts` skipped any declared doc that did not exist
  (`if (!fs.exists(path)) continue`) and returned
  `passed: uncovered.length === 0`. `CoverageReport` carried no scanned count,
  and `claims-check.ts` printed only `registry.claims.length` — the FORWARD
  number, independent of the reverse scan. So renaming `README.md` made the
  anti-gaming arm certify green having read nothing, which is an easier gaming
  path than the two silent-removal and mask-by-addition vectors it exists to
  catch. A gate defeated by `git mv` is not a gate. The report now carries
  `docsScanned` and `docsMissing`, a missing declared doc fails, and the
  success line states how many docs were scanned.
- `inject-governance.ts`'s `checkToolOutputConsistency` returned `true` on
  `violations.length === 0` over `scanToolFiles()`, which yields `[]` when the
  MCP tools directory does not resolve. It now uses the coverage-aware scan
  added in #5297 and fails when zero files were inspected.
