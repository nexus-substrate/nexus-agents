---
---

fix(docs): correct JSDoc param-name inaccuracies + gate jsdoc accuracy rules — audit Phase 1b

Fixes the 7 genuine @param mismatches the Phase 1 baseline surfaced (e.g.
`@param error`→`issue`, `config`→`_config`, removed a stale `category`, documented
omitted params in 4 functions) plus `@typeParam`→`@template` and two `@internal`
tags carrying stray text. Flips the now-clean accuracy rules (check-param-names,
check-types, check-tag-names, empty-tags, valid-types, check-alignment,
check-property-names) from warn to error; `no-undefined-types` stays warn (10
remaining, follow-up). JSDoc-only — no runtime/behavior change. #3516 / #3518.
