---
'nexus-agents': patch
---

Upgrade Changesets CLI v2 → v3 and `changesets/action` v1 → v2 as a coordinated pair (#4473).

These two must move together: action v2 hard-fails on CLI v2 (`Changesets CLI v2 is not supported`), and action v1 is equally unsupported on CLI v3. #4469 bumped only the action, which broke every release until it was reverted.

The v2 action also renamed all four inputs — `version` → `version-script`, `publish` → `publish-script`, `title` → `pr-title`, `commit` → `commit-message`. Passing the old names is **not** an error: the action logs `Unexpected input(s)` and silently ignores them, so a release would run with no version script, no publish script, and default PR text. That silent-ignore is why the original regression was invisible until release time.

Verified locally against the real pipeline rather than a dry run: `changeset status` and a full `pnpm changeset:version` (which chains governance inject, repo-index, docs-content and TypeDoc) both succeed on v3, producing a correct bump. The probe changeset and its version bump were reverted.

The dependabot ignore now covers **both** halves of the pair, so a future major has to be done deliberately as a coordinated change.
