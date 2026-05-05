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

Two paths, depending on the harness:

**Preferred — direct dispatch by name** (Claude Code with `.claude/agents/` discovery enabled, or any harness that resolves `subagent_type` against the local agents directory):

```text
Agent({
  subagent_type: "code-reviewer",
  description: "Review PR #N",
  prompt: "[your specific review ask]"
})
```

The persona's frontmatter `name:` field is the dispatch key. The harness loads the file's body as the system prompt automatically.

**Fallback — `general-purpose` + inline persona** (any harness without agents-directory discovery):

```text
Agent({
  subagent_type: "general-purpose",
  description: "Review PR #N",
  prompt: "[paste the persona file body as system context]\n\n[your specific review ask]"
})
```

Use the fallback only when direct dispatch isn't available — it works everywhere but loses the harness's persona-aware features (e.g., per-agent permission scoping).

## License

Adapted from MIT-licensed [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) (Copyright © 2025 Addy Osmani). Each persona file's header comment cites the upstream source.
