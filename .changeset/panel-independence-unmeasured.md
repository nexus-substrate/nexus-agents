---
'nexus-agents': patch
---

fix(vote): stop the panel-correlation warning firing on placeholder model ids

The #4390 check asked whether every voter was running the same model by
comparing the adapters' `modelId` at assignment time. Adapter detection is lazy
(#811), so at that point all of them report the same `pending-detection`
placeholder — which reads as one model. The warning fired on every CLI-path
vote, and a panel that genuinely had collapsed onto one model produced the
identical line. Both directions were wrong, and the second is the one that
matters: the safeguard could not distinguish the condition it exists to catch.

`assessPanelIndependence` now returns `unmeasured` / `collapsed` / `diverse`
instead of a boolean, so an unresolved panel is neither accused nor cleared, and
the real judgement moved to after the votes are collected — the first moment the
adapters have actually resolved. An empty panel is `unmeasured` rather than
`diverse`, since no adapters is not a healthy spread.

The gateway path is unaffected: its adapters are built from a probed model
catalog and carry real ids from construction.
