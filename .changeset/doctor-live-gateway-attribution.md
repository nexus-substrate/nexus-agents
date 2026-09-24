---
'nexus-agents': patch
---

`doctor --live` now attributes a live probe to the gateway when the gateway served it (#6781). In gateway mode, a slot whose CLI binary is on PATH is decided on first use. The live report read that slot before the probe decided it, so when the CLI's health or auth check failed and the gateway model answered, the report said `ready through "serves"` and marked the CLI's installed, authenticated and serves levels as passed. The CLI had not been measured. The live run now makes the slot decide its route before probing. A gateway-served slot is reported as `served by gateway model <id> (CLI not available)`, and the CLI levels are shown as not attempted. When the main doctor CLI list accepted a CLI that the live run found unavailable, the live line now says the two checks disagree.
