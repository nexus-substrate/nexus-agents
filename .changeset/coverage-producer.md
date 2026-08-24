---
'nexus-agents': minor
---

fix(self-eval): produce coverage-summary.json, and read per-file coverage from it

`component-scanner` hardcoded `testCoverage: null` with the comment "Would need
coverage report integration". Integration was impossible for a reason nobody had
traced: **`coverage-summary.json` is never written.** The vitest coverage
reporter list was `['text', 'json', 'html']`, and `json` produces
`coverage-final.json` — a different file.

Three consumers read the missing one — the SICA test-generation workflow, the
system-review workflow, and `cli/system-review.ts`. All three silently saw no
coverage, their `existsSync` guards permanently false. The SICA workflow's
`jq '.total.lines.pct // 0'` then turns that absence into 0%, the dangerous
direction for a coverage figure.

Adding `json-summary` to the reporter list produces the file (verified: 1406
per-file entries alongside `total`), which unblocks all three and makes per-file
coverage available to the scanner.

The scanner now reads its own file's entry, not the project total — a
project-wide number stamped onto every component would be a fabricated per-file
metric. An absent report, or a file missing from it, stays `null`: unmeasured is
not 0%, and coercing it would turn the `deprecate` recommendation from one that
could never fire into one that fires for the wrong reason.
