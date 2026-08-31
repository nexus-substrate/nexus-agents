---
'nexus-agents': patch
---

fix(ci): three CI gates reported a pass over an empty input set

All three decided success with `length === 0` over a collection that could be
empty because nothing was found to inspect, not because nothing was wrong.

- `check-tool-output-consistency.ts` opened with
  `if (!existsSync(TOOLS_DIR)) return []` and printed
  "Tool output consistency OK — no timestamp-as-number fields." with no path,
  count, or file list. A zero-file run was indistinguishable from a clean sweep
  of every tool. It now reports coverage ("141 tool file(s) scanned") and fails
  when the directory is missing or nothing was scanned.
- `check-model-string-drift.ts` scanned via ts-morph
  `addSourceFilesAtPaths`, which returns an empty set for a glob matching
  nothing rather than throwing. Its success line printed `ALLOWLIST.length`, a
  static constant that reads as coverage but is independent of what was
  scanned. It now prints the real scanned count and fails at zero.
- `check-dist-assets.ts` did `if (stat.isDirectory()) continue`, so a declared
  directory passed on existence alone — making `minBytes: 1` dead data on
  `workflows/templates` and `security/ast-rules`, and an empty shipped
  directory indistinguishable from a populated one. Assets are now kind-tagged
  (`file` with `minBytes`, `dir` with `minEntries`), empty directories fail,
  and a kind mismatch is reported instead of skipped.

All three run in required CI jobs. `scanToolFiles` keeps its array shape as a
view over the new coverage-aware scan so `scripts/inject-governance.ts` is
unaffected.
