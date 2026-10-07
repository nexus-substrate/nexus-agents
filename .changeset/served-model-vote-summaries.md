---
'nexus-agents': patch
---

Vote panel summaries now report the model that answered, not the one requested (#7179). `consensus_vote`'s `panelWarning` and `panelDiversity` (distinct models and families), and the CLI `vote` summary's `Models:` line, use a seat's reported `servedModel` when present and fall back to the requested model otherwise. When the two differ, both are shown, for example `All 7 seats answered on claude-fable-5 → served claude-opus`. A bare served alias such as `opus` is resolved against the CLI that answered, so it counts toward its vendor family instead of being reported as unclassified. Panels whose seats were served the model they requested produce the same output as before.
