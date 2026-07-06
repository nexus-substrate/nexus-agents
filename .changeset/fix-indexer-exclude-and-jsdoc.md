---
'nexus-agents': patch
---

Fix two indexer bugs: default exclude globs (`**/*.test.ts`, `**/*.d.ts`) were never actually applied because `shouldExcludeFile` stripped `*`/`**` from patterns before matching, leaving a broken substring check that couldn't match real file paths — test files and `.d.ts` files were being indexed. Excludes are now passed as negated globs directly to ts-morph's `addSourceFilesAtPaths`, which resolves them correctly.

Also fixed `extractDescription` mishandling single-line JSDoc headers (e.g. `/** Utils. */`): `classifyJsDocLine` checked `startsWith('/**')` before `endsWith('*/')`, so a self-closing single-line comment never closed the comment state, causing the next code line to be misread as the description. A leading non-JSDoc block comment (e.g. `/* eslint-disable */`) also incorrectly aborted extraction before reaching the real module JSDoc; it is now skipped instead.
