---
'nexus-agents': patch
---

`doctor` names the issues it counts (#6011)

The summary reported a count with no names, while several lines in the output
carry a warning glyph and only some of them are counted — the "API keys
configured: 0 of 3" note is advisory when CLI auth already satisfies
`hasAuthMethod`. A reader seeing two warnings and "1 issue(s) found" had to know
the counting rules to tell which was which; I hit this while validating #6010
and ended up reading `printDoctorSummary` to find out.

`failingVerdictTerms` (#6010) already returns the terms by name, so the summary
now says them:

```
Summary: 2 issue(s) found (install freshness, CLI gemini) — stale global install
```

Parenthesised rather than appended after an em dash, because the install-
freshness note already contributes its own ` — …` clause and two dash-separated
clauses on one line read as a run-on. That was visible only in the real output,
not in the unit test that preceded it.
