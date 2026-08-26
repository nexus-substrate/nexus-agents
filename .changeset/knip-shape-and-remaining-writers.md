---
'nexus-agents': patch
---

fix(ci): treat an unrecognised knip shape as unmeasured, and finish the CLI-attribution sweep

Two corrections to fixes that shipped a few hours ago.

**#5030 left half the defect.** `normalizeKnipJson` returns `[]` for any parsed
JSON that is neither a top-level array nor an object with an `issues` array, and
`classifyKnipOutput` reported that as `ran: true`. So a knip whose reporter shape
changed — the exact case the check exists for, and which its own doc comment
says varies by version and reporter mode — parsed cleanly and counted as a
completed scan of zero issues. The test shipped with that fix asserted
`{"files":[]}` was "a genuine empty result"; that fixture is the
reporter-change case. An unrecognised shape is now `ran: false`, and the pair
test uses the two shapes the normalizer actually understands.

**#5020 fixed two of four writers.** `issue-triage-tool.ts` and
`research-discover.ts` append the same shape — synthetic `model` label, no
knowledge of the serving CLI — and still hardcoded `cli: DEFAULT_CLI`.
`research_discover` runs on essentially every non-trivial task, so it was the
highest-volume of the four. Both now record `cli: 'unknown'`; the changeset for
#5020 said "two live tool paths" and should have said four.
