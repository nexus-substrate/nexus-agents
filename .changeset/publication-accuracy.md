---
'nexus-agents': patch
---

docs: align package metadata + READMEs with the governance-substrate positioning; fix stale counts

Accuracy/no-exaggeration pass over the publication surfaces:

- **package.json**: description reframed from "intelligent orchestration platform" to the actual "governance substrate" positioning (matches the README); added `governance`/`code-review`/`consensus`/`audit`/`codex`/`opencode` keywords; added `homepage` + `bugs`.
- **npm README** (`packages/nexus-agents/README.md`): governance-first tagline + overview; corrected "24 MCP tools" → 42 and "10 Expert types" → 12.
- **Root README**: removed the unverifiable "No other framework closes this loop" marketing line; documented the now-default bounded self-tuning loop (capped, auto-decaying, opt-out `NEXUS_TUNE_ENFORCE=false`); "11 built-in expert types" → 12.
- **consensus_vote schema**: `quickMode` description "3 agents instead of 5" → "instead of the full 7-role panel" (the panel is 7).
- **docs/ENTRYPOINTS.md**: `--quick` count fixes (→7); refreshed Last Updated. (Tool-table/YAML completeness tracked in #3334.)
