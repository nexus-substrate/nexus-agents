---
'nexus-agents': patch
---

fix: ast-fixer misses semicolon-terminated promise chains and over-matches `*Function` callees (#4243); rewrites now ast-grep pattern-based

The `error-handling` fixer's regex only matched a trailing `)` with no
semicolon, so any semicolon-terminated `.then(...)` chain (the overwhelmingly
common case) silently fell back to a TODO comment instead of getting a
`.catch(...)`. The `no-eval` fixer's `expressionText.endsWith('Function')`
check over-matched ordinary identifiers like `setupFunction()`.

Both transforms are replaced with `@ast-grep/napi` pattern rewrites
(`agents/collaboration/ast-rewrites.ts`): `.catch(...)` is appended to the
outermost unhandled `.then(...)` of a chain (ast-grep matches the
`call_expression` node itself, whose text excludes the trailing `;`, so this
bug class cannot recur by construction), and `eval(...)`/`Function(...)`/
`new Function(...)` are matched by exact callee so a `*Function`-suffixed
identifier cannot over-match. The other four ts-morph fixers, and
`AstFixer`'s entire public surface (`applyFix`, `createAstFixer()`,
`AstFixResult`, comment-fallback, line-targeting), are unchanged. Zero new
dependencies — `@ast-grep/napi` was already pinned for `search_usages` (#4265).
