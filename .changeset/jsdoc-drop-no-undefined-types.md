---
---

chore(lint): drop redundant jsdoc/no-undefined-types — JSDoc audit mechanical layer complete

Removes jsdoc/no-undefined-types: in TypeScript, type references are
import-resolved and enforced by the compiler, so the rule is redundant for
accuracy; its only signal here was 10 false-positives on legitimate
`{@link symbol}` navigation references. The JSDoc accuracy ruleset is now fully
clean (0 violations) with all accuracy rules gating at error. Config-only.
Epic #3516.
