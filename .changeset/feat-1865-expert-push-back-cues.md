---
'nexus-agents': minor
---

feat(experts): add Push-Back Cues + Task Scope Management to 7 experts (#1865, #1866)

Every expert prompt now includes explicit guidance on when to refuse, push back, or escalate instead of compliantly answering. Matching the pattern already established for code-expert and architecture-expert, the remaining 7 experts (data-visualization, documentation, infrastructure, pm, research, security, testing) now carry a dedicated "Push-Back Cues" section with a confidence-threshold cue and domain-specific refusals (e.g. PM spike after 3 clarification rounds, research staleness at 3 years, data-viz single-chart limit at 3 dimensions, infra refuses power-cycle without OOB).

Task Scope Management sections were also added to the 5 experts that lacked them (data-visualization, documentation, infrastructure, pm, research) so all 9 experts now share scope-bounding guidance.
