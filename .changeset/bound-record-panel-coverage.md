---
'nexus-agents': patch
---

fix(audit): a PR-bound vote record always carries `panelCoverage` (#6213)

`buildVoteRecord` omits `panelCoverage` when every requested seat responded, to keep an unbound whole-panel record on the pre-1.5 hash projection. A record with `ratifiesPr` is schema 1.10 by construction and has no older projection to keep, so it now carries its coverage even when whole (`{ requested: n, responded: n, errored: 0, erroredRoles: [] }`, inside the hash). The governor ratification gate refuses a bound record without coverage as `unmeasured-panel` rather than reading absence as a whole panel; without this change no real whole-panel record could ever satisfy it. Unbound records are byte-identical to before.
