---
'nexus-agents': patch
---

The public API surface snapshot (`api-surface.txt`, checked by `pnpm api:check`)
now records the members of every union type in sorted order, at every nesting
level. TypeScript prints a union in the order the checker happened to resolve
its members, so an unrelated change to what the extractor resolved first could
reorder a union and produce snapshot lines that looked like API changes and
were not — four such lines appeared while the extractor gained real function
signatures. Reordering a union's members in source no longer changes the
snapshot; adding or removing a member still does. String literals that contain
`|`, unions nested inside object members and function parameters, and
`boolean` are all rendered as before, and a union member's own properties are
sorted before the union is, so the order is a function of the member's shape
rather than of its property declaration order. An index signature's trailing
`;` is no longer recorded as part of its type. Regenerating the snapshot after
this change reorders 645 union lines (58 of them type aliases that also drop a
source-written leading `|`) and strips the `;` from 2 index-signature lines; no
line's member set changes.
