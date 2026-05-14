---
'nexus-agents': minor
---

OpenCode permission-system parity ([#2658](https://github.com/williamzujkowski/nexus-agents/issues/2658), Epic D).

`nexus-agents init --opencode` now emits a conservative default `permission` block into `opencode.json` instead of leaving operators on OpenCode's defaults:

- `bash` → `ask` (highest-risk surface)
- `edit` → `ask` for everything, with `.env*` / `*.pem` / `*.key` / `id_rsa*` / `secrets/**` / `.git/**` **hard-denied**. OpenCode resolves glob maps last-match-wins, so the deny patterns are ordered after the broad `"*"` rule.
- `skill` → `allow` (trusted, in-repo, CI-validated content)

Never overwrites an operator's existing `permission` block (merge-not-overwrite, matching the file's existing pattern). Documented in `.rules/security.md`.
