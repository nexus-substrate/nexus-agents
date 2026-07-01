---
---

Fix CodeQL alert #222 (`js/unnecessary-use-of-cat`): the codepr-push never-merge invariant test read the module source via `execFileSync('cat', …)`; swap to `fs.readFileSync` — strictly better (no subprocess). Test-only, no runtime change.
