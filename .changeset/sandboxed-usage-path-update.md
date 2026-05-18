---
'nexus-agents': patch
---

**Closes #2844 and #2846.** docs: relocate SANDBOXED-USAGE.md to docs/guides/; demote CLAUDE.md from new-user surfaces

`docs/getting-started/SANDBOXED-USAGE.md` moves to `docs/guides/` (it's ops material, not new-user onboarding). The runtime messages in `cli-server-gateway.ts`, `portable-mode.ts`, and `sandbox-factory.ts` were updated to print the new path so the auto-detected portable-mode banner and the sandbox-factory error message both point to the file's new home.

No behavior change; only the printed string changed.
