---
'nexus-agents': patch
---

Count non-empty changesets in the publish-race fallback (#4646)

The `#2382` fallback counted `.changeset/*.md` **files**. `changesets/action`
counts **releases**. An empty changeset — one file, zero releases, and what
`pnpm changeset --empty` produces — meant the two disagreed about the same
directory.

Consequence: when a version PR merged while an empty changeset sat on `main`,
the action published nothing _and opened no PR_ (its `All changesets are empty;
not creating PR` branch), while the fallback stood down logging "the next
release-PR merge should close the loop." No such PR existed. The release stalled
silently with both components exiting 0.

`scripts/count-pending-changesets.ts` now supplies the count via
`@changesets/read` — the same library the action uses — so the predicate cannot
drift. It materialises the ref's `.changeset/` from the commit object rather
than reading the working tree, preserving the #4625 hardening that keeps an
uncommitted version bump from swaying the verdict.

Also corrects `docs/ops/release-changeset-race.md`, which described two action
modes; v2 has four, and the third is the one that stalls.
