---
'nexus-agents': patch
---

fix(security): stop the SARIF validation from failing open (follow-up to #5343)

An adversarial review of the merged #5343 found that its validation half
re-introduced the class of defect it was fixing. Every case below was
reproduced against the merged parser before being fixed.

**A malformed decorative field deleted a blocking finding.** The result schema
rejected the whole result on any violation, so a finding with `level: 'error'`
(a blocking severity) and `endLine: 0` produced _zero_ findings. A cosmetic
field could suppress a finding that would have failed the ship gate — strictly
worse than the severity laundering #5343 set out to fix. Decorative fields now
carry `.catch(undefined)`: a bad value is dropped, the result is kept. An
unusable `startLine` is normalized to 1 and the substitution disclosed, because
the line is metadata while the severity, rule and file are the verdict.

**The parser still emitted findings violating `SecurityFindingSchema`.**
`ruleId: ''` and `message.text: ''` are not nullish, so `??` passed them through
to fields declared `min(1)`. #5343's own oracle catches this; its hostile-input
table simply omitted empty strings.

**A rule with one bad field silently downgraded its findings.**
`security-severity` is scanner-defined, not spec-typed, so a number is
plausible — and it discarded the whole rule. The finding then lost its CWEs and
help URL, and resolved severity from `level: 'warning'` to `medium` instead of
`critical` from the 9.8 score: a downgrade across `BLOCKING_SEVERITIES` in the
fail-open direction, disclosed only as `Skipped rule 0`, which never names the
finding it downgraded.

**Parse errors could not reach the gate.** `runSecurityPipeline` took
`{ totalFindings, findings }` — `errors` was absent from the parameter type, so
every `Skipped result N` was structurally unreachable from the one consumer
whose verdict depends on it. The summary now says when scanner output was
unreadable. Four test fixtures that omitted `errors` were completed and their
`as never` casts removed, since those casts are what hid the gap from the
compiler.

Also removes a check that could not fail: `file === ''` in `extractLocation` was
unreachable once `uri` carried `min(1)`. `uri` is now `.optional()`, which both
restores that arm and stops an empty path from discarding the result.

Validated against real `semgrep --sarif` output before and after: 74 real rules
and 3 real findings parse with zero errors, unchanged.
