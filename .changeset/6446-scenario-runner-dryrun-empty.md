---
'nexus-agents': patch
---

Fix vacuous `passed: true` in `ScenarioRunner.runDryRun` when `expectedOutputs` is empty (#6446). Uses `allOf(validations, (v) => v.passed, false)` so that scenarios asserting nothing correctly fail rather than reporting passed, adhering to `.rules/development-disciplines.md`.
