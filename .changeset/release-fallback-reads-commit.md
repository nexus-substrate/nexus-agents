---
'nexus-agents': patch
---

fix(release): the publish-race fallback was reading an uncommitted version and force-publishing on every merge

`release.yml`'s `#2382` fallback force-published an unmerged version on **17 of 17 runs** on 2026-08-23. In 6 of those, npm was briefly ahead of `main`.

It was not `changesets/action` — v2 does not publish in PR mode, which the SBOM step (gated on `published == 'true'`, skipped on every version-PR run across all 38 runs) proves structurally. The fallback itself was the publisher.

The `#2696` guard, `git checkout "$GITHUB_SHA"`, worked under changesets/action v1 because v1 checked out `changeset-release/main` locally, so the checkout was a real branch switch that restored `main`'s files. v2.0.0 pushes release commits via the GitHub API and never checks that branch out: HEAD is already on `main` at `$GITHUB_SHA` with the bump uncommitted, so the checkout is a bare detach that **preserves modified files**. The guard kept running, kept logging correctly, and did nothing.

Two fixes, protecting different things. The **decision** now reads the commit object — `git show` for the version, `git ls-tree` for the pending-changeset count — so no tree state a future action version leaves behind can fool it. The **publish** gets `--force` on the checkout, so `pnpm release` ships the commit's content rather than an uncommitted bump the decision never approved.

The fallback is kept, not removed: the `#2382` skipped-minor failure it guards against silently loses a published release, and nobody has established it is impossible under v2. Verifying that is tracked separately and gates any future removal, not this fix.

Also closes the tag skew in #4624 at source. The fallback tagged `$GITHUB_SHA`, which on a feature merge held the _previous_ version — 14 of 14 tags checked were off by one. With the read fixed the fallback only fires when the commit genuinely holds the version, so the existing tag target becomes correct by construction. A post-publish assertion now fails the release if a tag ever again points at a commit whose `package.json` disagrees.
