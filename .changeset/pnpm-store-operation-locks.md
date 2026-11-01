---
'nexus-agents': patch
---

Redirect package manager runtime directory to private writable boundary in dev pipeline bubblewrap sandbox, fixing `ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK` with pnpm 12 (#7612).
