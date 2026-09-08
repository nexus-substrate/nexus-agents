---
---

Tooling-only: `scripts/extract-api-surface.ts` no longer treats a comment
written inside a type as part of the public surface (#5972). A comment-only edit
used to fail the gate — PR #5970's entire diff was prose. Also repairs the
member sort, which comments were defeating: a member behind a JSDoc sorted under
`/` instead of its own name. No package behaviour changes.
