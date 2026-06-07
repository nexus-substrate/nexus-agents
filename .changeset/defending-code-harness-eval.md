---
'nexus-agents': patch
---

docs(research): evaluate Anthropic defending-code-reference-harness (#3574)

Adds a research-spike findings doc evaluating the (unmaintained) Anthropic defending-code-reference-harness against nexus-agents across five overlap areas, with adopt/adapt/skip + trigger per area (capability-bias gated). Net: two genuine borrows deferred behind triggers — execution-verified findings (stronger than our reasoning-only Discovered-Issues gate) and the generate→validate→iterate patch loop (a model for the #3540 auto-implementation frontier); the rest is shape we already have (consensus/Workflow verify-dedupe, sandbox #2500 + ClawGuard). Reference only — extract patterns, do not vendor.
