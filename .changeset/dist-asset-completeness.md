---
'nexus-agents': patch
---

fix(build): keep the dist-asset list from going stale (#5143)

`check-dist-assets.ts` (added by #5084) verifies that known runtime assets reach
`dist/`, with a size floor so a truncated copy still fails. But
`REQUIRED_DIST_ASSETS` is hand-maintained, so it guarded the assets somebody
remembered to list.

That is the #5084 shape one step removed: add a loader that resolves an asset
relative to its own module, forget the list entry, and the gate stays green while
every installed copy reads a file that was never shipped. #5084 cost every
installed user zero models for claude, codex and gemini, and was found by running
the tool rather than by CI.

The check now also asserts that every runtime file resolving a module-relative
path is **declared** — either naming the shipped asset it needs, cross-checked
against `REQUIRED_DIST_ASSETS`, or explicitly `null` with a reason. A new
resolver fails until someone answers "does this need to ship?".

Keyed on the file rather than an extracted asset string: the four real loaders
resolve their assets four different ways, and a regex over those shapes would be
a false-positive generator rather than a check.

Currently 7 resolvers declared, 4 of them asset-reading, all 4 guarded — so this
lands green and is a regression guard, not a bug fix.
