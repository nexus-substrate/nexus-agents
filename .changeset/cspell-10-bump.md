---
'nexus-agents': patch
---

chore(deps): bump cspell 9.8.0 → 10.0.0 (closes #1988)

cspell major bump evaluated and applied. Breaking changes:

- Requires Node.js >=22.18 (we use Node 22, CI setup-node defaults to
  latest 22.x — no action needed; local dev is on 22.22 already)
- Internal `import-fresh` v3→v4 async shift — does not affect consumers

Dictionary: added `yourname` as a placeholder word used in ECOSYSTEM.md
template-repo examples.

Validation: `pnpm spell` passes 139 files / 0 issues.
