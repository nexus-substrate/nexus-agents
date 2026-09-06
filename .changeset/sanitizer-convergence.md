---
'nexus-agents': minor
---

The security-layer sanitizer no longer returns unconverged content as clean.
`stripXmlTags` and `stripDangerousHtml` loop to remove a tag reconstructed by an
earlier removal (#1496), but the loop is bounded at five passes and never
re-tested afterwards — so a six-deep `<sy<sy…<system foo>…stem>` payload came
back with a live `<system>` tag, `wasModified: true` and `strippedElements` at
the cap, indistinguishable from a clean strip. `SanitizedInput` gains
`sanitizationIncomplete`. The detectors also ran on the original text only, so a
flag could never see a tag that exists only after stripping; they now run on
both and union, which raises `fake_conversation` and demotes the author to tier
4 on that payload instead of leaving `injectionFlags` empty.
