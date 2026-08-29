---
'nexus-agents': patch
---

docs(governance): move eight harness-agnostic sections from CLAUDE.md into AGENTS.md

Codex, Gemini CLI and OpenCode read AGENTS.md. The CLI quick reference, the
`NEXUS_*` environment table, Operating Rules, the Discovered-Issues protocol,
Workflows, Governance quality, File References and the MCP tool list lived only
in CLAUDE.md, so three of four harnesses never saw them. Verified by grep:
`NEXUS_BILLING_MODE` and `nexus-agents doctor` appeared zero times in AGENTS.md.

They now live in AGENTS.md's `AGNOSTIC:BODY` and are injected into CLAUDE.md's
generated block, so every harness sees the same content and it is drift-checked.
CLAUDE.md's hand-maintained tail shrinks to the two genuinely Claude-specific
sections. Content outside the generated block is ungated by construction — that
is why the TypeScript pin drifted — so shrinking the tail removes the defect
class rather than patching instances.

The #4722 environment-variable guarantee now reads AGENTS.md rather than
CLAUDE.md. It was gating the table in the one file only Claude reads.

Panel: option A, 6/6 approvers, supermajority met.
