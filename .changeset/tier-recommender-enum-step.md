---
'nexus-agents': patch
---

The tier recommender now steps between `RequestTier` values explicitly instead of adding or subtracting 1 from an enum value. Recommendations are unchanged (promote DIRECT→ANALYZED→ORCHESTRATED, demote the reverse). The `@typescript-eslint/no-unsafe-enum-assignment` rule introduced in typescript-eslint 8.71 flagged the arithmetic; the rule is turned off in this repo's ESLint config for now because its type walk runs lint out of memory (#6994).
