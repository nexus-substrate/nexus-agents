---
'nexus-agents': patch
---

fix(deps): bump dompurify override to >=3.4.11 (Dependabot #120, runtime)

Dependabot alert #120 flags a medium-severity runtime vulnerability in
`dompurify`, fixed in 3.4.11. The root `pnpm.overrides` block already pinned
`dompurify` to `>=3.4.9`, which still resolved to the vulnerable 3.4.10.

Bump the override to `>=3.4.11` and regenerate the lockfile so the transitive
`dompurify` dependency now resolves to 3.4.11. No other overrides changed; no
source change (dompurify is a transitive dependency, only referenced by name in
security-knowledge content). `tsc --noEmit` remains clean.
