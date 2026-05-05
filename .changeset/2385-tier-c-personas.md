---
'nexus-agents': patch
---

Tier C of epic #2385 — adopt 3 subagent persona prompts from MIT-licensed [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) under `.claude/agents/`. **Per architect QA on the epic vote**: adopted as subagent prompt templates only, NOT as new voter roles (the 7-role panel `architect, security, devex, ai_ml, pm, catfish, scope_steward` stays unchanged).

Personas:

- `code-reviewer.md` — Senior Staff-Engineer code-review persona. Five-axis assessment (correctness, readability, architecture, security, performance) with categorized findings (Critical / Important / Suggestion).
- `security-auditor.md` — Security audit persona. Vulnerability scan + threat modeling, OWASP-aligned findings, severity classification.
- `test-engineer.md` — Test-engineer persona. Coverage assessment, missing edge cases, test-quality review (DAMP / AAA / naming).

These are **distinct from** the voter-pipeline experts at `agents/*.md` (repo root), which output structured JSON for `ConsensusEngine`. The new personas output human-readable narrative review and are consumed by the Agent tool's `subagent_type` dispatch (or direct invocation where `.claude/agents/` discovery is supported).

`.claude/agents/README.md` documents the split and the related voter-pipeline counterparts.

Pure-patch: no public-API impact, no behavior change to ConsensusEngine, no skills/index.yaml change.
