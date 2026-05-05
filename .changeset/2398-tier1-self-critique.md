---
'nexus-agents': minor
---

Tier 1 of epic #2398 — adopt the five-dimensional self-critique pattern from Apache-2.0-licensed [nexu-io/open-design](https://github.com/nexu-io/open-design) as a new `self-critique` skill.

This is the **pre-emit gate**: before an agent emits work (code, design, docs, spec, PR description), it silently scores the output 0-10 across 5 task-appropriate dimensions. Worst sustained band < 3 = regression; fix lowest dimension and rescore.

Distinct from `reviewing-code` (which reviews _others'_ code post-hoc). Self-critique is the _internal_ gate that runs _first_. Both can apply to the same artifact at different lifecycle points.

**Concrete dimension tables included** (per architect's QA on epic #2398 — "rubric tables, not vague guidance"):

- **Code**: Correctness / Readability / Architecture / Security / Performance
- **Design**: Philosophy / Hierarchy / Detail / Functionality / Innovation (Open Design's original)
- **Documentation**: Accuracy / Discoverability / Density / Examples / Tone
- **Spec/PR/ADR**: Completeness / Testability / Reversibility / Stakeholder-fit / Scope
- **Default**: Soundness / Clarity / Coverage / Specificity / Restraint

**Scoring bands** (universal): 0-4 Broken / 5-6 Functional / 7-8 Strong / 9-10 Exceptional.

**Scoring discipline rules** ported verbatim from upstream:

- Always cite evidence (no "feels inconsistent")
- Don't average up (worst sustained band wins)
- Don't grade-inflate (7 = strong, not acceptable)
- Innovation/Restraint allowed to be low for production work
- One dimension can fail without the others

Wired as cross-link from `reviewing-code` (external counterpart) and `dev-pipeline` (Phase-4 pre-emit gate).

License: Apache-2.0 attribution in skill source comment. Skill count: 25 → 26.
