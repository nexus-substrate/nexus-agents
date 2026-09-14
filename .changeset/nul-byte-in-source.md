---
'nexus-agents': patch
---

`improvement-review.ts` no longer carries a raw NUL byte in its dedup-key separator (now the escape `\0`, same hash), so `grep` reads the file as text again; the arch lint now fails on any raw control byte in `packages/nexus-agents/src/**/*.ts` or `scripts/**/*.ts`, naming file:line:col (#6149).
