---
'nexus-agents': patch
---

fix(mcp): list_available_models called three dead transports healthy

`healthyTransports` counted transports whose probe merely did not throw, so a
transport that succeeded and discovered **zero** models was reported as healthy.
Against a stale install this returned `healthyTransports: 5` while claude, gemini
and codex each reported `ok: true, modelCount: 0` — a diagnostic that could not
distinguish "reachable" from "usable", which is the one distinction it exists to
make.

`healthyTransports` now counts transports that can actually serve a model, and
`reachableTransports` carries the old, weaker meaning under an honest name. Each
report gains `servesModels`.

An empty probe deliberately stays `ok: true`. The probe genuinely succeeded, and
reporting it as failed would trade one misreport for another.
