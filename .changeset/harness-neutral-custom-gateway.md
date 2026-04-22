---
'nexus-agents': minor
---

**feat: harness-neutral decoupling + direct custom-API gateway adapter (epic #2119)**

Makes nexus-agents a first-class MCP peer for OpenCode, Codex CLI, Cursor, Aider, and Cline — not just Claude Code.

**New: direct `custom-openai` SDK adapter (#2120 / #2125)**

Point nexus-agents at any OpenAI-compatible gateway (multi-vendor proxies, self-hosted LLM servers, corporate gateways) with three env vars:

```bash
export NEXUS_CUSTOM_API_BASE_URL="https://your-gateway.example.com/v1"
export NEXUS_CUSTOM_API_KEY="..."
export NEXUS_CUSTOM_MODEL="claude-opus-4-5"   # optional; default: gpt-4o
```

No OpenCode subprocess in the chain. SSRF guard validates the base URL at construction — blocks loopback, RFC 1918 private ranges, link-local (incl. AWS IMDS `169.254.169.254`), IPv6 equivalents, and non-http(s) protocols. Escape hatch `NEXUS_CUSTOM_API_ALLOW_PRIVATE=1` for trusted internal hosts.

**Harness-neutral rule location (#2121 / #2126)**

`.claude/rules/*.md` → `.rules/*.md`. Single source of truth; CLAUDE.md pointers updated. `detectProjectInfo` accepts both paths during migration. Other harnesses can point their rule-loading systems at `.rules/` directly now.

**AGENTS.md is now standalone (#2122 / #2127)**

Previously a redirect to CLAUDE.md; now inlines the harness-neutral subset (prime directive, TDD/YAGNI/DRY, rule-file index, skills/agents discovery, MCP startup, canonical paths, untrusted-input invariants, consensus thresholds). OpenCode, Codex CLI, and others that read AGENTS.md natively no longer have to chain through CLAUDE.md.

**Harness compatibility guide (#2123 / #2128)**

New `docs/guides/HARNESS_COMPATIBILITY.md` with tested wiring snippets for OpenCode, Codex CLI, Cursor, Aider, and Cline — each section covers config path, MCP server registration, rule-file discovery strategy, and verify steps.

No breaking changes. CLAUDE.md still works for Claude Code users; `.claude-plugin/` marketplace manifest untouched.
