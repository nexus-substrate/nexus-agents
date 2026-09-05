---
'nexus-agents': patch
---

The startup "Security configuration" line reports authentication the way `initializeAuth` resolves it (on by default, `token`), instead of defaulting to disabled and warning about unprotected endpoints on a server that then enforces a token (#5663).
