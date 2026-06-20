---
'nexus-agents': patch
---

docs: align org slug to canonical nexus-substrate + remove unsound NEXUS_ENFORCE_KEY_BOUNDARIES framing

Two owner-decided documentation/config fixes. No source code changed.

Org slug (#3998): the canonical repo is `nexus-substrate/nexus-agents` (confirmed
via the npm package `repository.url`, git origin, ADR-0018, and the live GitHub
repo; the old `williamzujkowski/nexus-agents` path now redirects). Updated the
stale slug so the plugin-install story is internally consistent:
`.claude-plugin/marketplace.json` (`name` → `nexus-substrate`, plugin
`source.repo` → `nexus-substrate/nexus-agents`), `.claude-plugin/plugin.json`
(`repository` URL), and the root `CHANGELOG.md` releases link. The author-identity
`owner` block (William Zujkowski / personal GitHub URL) is left as legitimate
attribution. The `/plugin marketplace add nexus-substrate/nexus-agents` +
`install nexus-agents@nexus-substrate` commands in PLUGIN_INSTALL.md now match the
manifest.

Key boundaries (#3997, closed won't-do): removed the `NEXUS_ENFORCE_KEY_BOUNDARIES`
"planned enforcement" framing from `docs/security/API_KEY_BOUNDARIES.md`. The
premise is unsound — CLIs like OpenCode legitimately route multi-vendor models
(including Anthropic via a separate paid API key), so a hard "refuse Anthropic →
non-Claude CLI" rule would wrongly block valid routing. The doc now keeps the
accurate, shipped guardrail (the advisory cross-CLI warning, #1429) and adds an
honest note on why hard enforcement is intentionally not built.
