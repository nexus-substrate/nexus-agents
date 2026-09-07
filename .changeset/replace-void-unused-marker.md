---
'nexus-agents': patch
---

Replace the ad-hoc `void x;` "intentionally unused" marker with ESLint's own
mechanisms: `varsIgnorePattern: '^_'` and `ignoreRestSiblings` on
`no-unused-vars`, optional catch binding where a caught error was never read, and
deletion of two genuinely dead bindings. The idiom existed only to suppress
`no-unused-vars` and became 25 errors under `no-meaningless-void-operator` in
typescript-eslint 8.69, which is correct that `void` on a plain identifier
discards nothing.
