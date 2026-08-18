---
'nexus-agents': patch
---

Align the website's TypeScript to the rest of the monorepo (#4478).

`nexus-agents` and `nexus-memory` were on `^6.0.3` while `website` sat on `^5.9.3` — a full major behind, resolving two compiler copies in one workspace. A skew like that means the website type-checks against different inference and different lib definitions than the code it documents, so a type error can exist in one and not the other.

Website now on `^6.0.3`; the lockfile resolves a single `typescript@6.0.3`. Verified with `astro check` (0 errors, 0 warnings, 1 pre-existing hint) and a full website build (134 pages).

TypeScript 7 is available but deliberately not taken here — it is the native-port rewrite and warrants its own evaluation rather than riding along with a skew fix.
