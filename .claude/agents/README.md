# Subagent persona prompts

Human-facing review personas for the **Agent tool's `subagent_type` parameter** (Claude Code) or any equivalent subagent invocation surface. These are **not** the same as the voter-pipeline experts in `agents/` at the repo root.

## When to use these vs the voter-pipeline experts

| Surface                        | Lives in                  | Output shape                                                                     | Consumed by                                                      |
| ------------------------------ | ------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Voter-pipeline experts**     | `agents/*.md` (repo root) | Structured JSON with `confidence`, `severity`, `issues[]`, `suggestions[]`, etc. | `ConsensusEngine`, `voterPanel`, `consensus_vote` MCP tool       |
| **Persona prompts (this dir)** | `.claude/agents/*.md`     | Human-readable narrative review with categorized findings                        | Direct human review, ad-hoc subagent dispatch via the Agent tool |

The two surfaces **coexist**. Architect QA on epic #2385 explicitly authorized this split: "adopt only as subagent prompt templates, not as new voter roles, to avoid panel inflation." Don't merge them.

## Personas

| File                                           | Purpose                                                                                                                                                                                         | Voter-pipeline counterpart                                     |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| [`code-reviewer.md`](./code-reviewer.md)       | Senior code-review persona (Staff Engineer voice). Five-axis assessment: correctness, readability, architecture, security, performance. Findings categorized Critical / Important / Suggestion. | [`agents/code-expert.md`](../../agents/code-expert.md)         |
| [`security-auditor.md`](./security-auditor.md) | Security audit persona. Vulnerability scan, threat modeling, OWASP-aligned findings, severity classification.                                                                                   | [`agents/security-expert.md`](../../agents/security-expert.md) |
| [`test-engineer.md`](./test-engineer.md)       | Test-engineer persona. Coverage assessment, missing edge cases, test-quality review (DAMP, AAA, naming).                                                                                        | [`agents/testing-expert.md`](../../agents/testing-expert.md)   |

## Invocation

From a Claude Code session, dispatch via the Agent tool:

```text
Agent({
  subagent_type: "general-purpose",
  description: "Code review on PR #N",
  prompt: "[paste the persona prompt as the system context]\n\n[your specific review ask]"
})
```

Or, where the surface supports `.claude/agents/*` directly (Claude Code with the agents-directory feature enabled), the persona is auto-discoverable.

## License

Adapted from MIT-licensed [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) (Copyright © 2025 Addy Osmani). Each persona file's header comment cites the upstream source.
