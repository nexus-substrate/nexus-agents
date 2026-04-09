---
'nexus-agents': minor
---

Central workflow hub: memory integration, conditional votes, harness mode, distribution

- Dev pipeline is now the central workflow hub — all tools feed into unified feedback loop
- SessionMemory queried before research, QA outcomes written back, RoutingMemory feedback
- VoteResult discriminated union with conditional_go support
- Harness mode (mode: 'harness') returns tasks for external implementation
- dryRun mode stops after plan+vote
- Checkpoint/resume for crash recovery
- Research trigger auto-creates tasks from discoveries
- Project identity rewrite across 15+ files and website
- Submitted to 7 distribution platforms
