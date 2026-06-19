---
'nexus-agents': patch
---

fix(capability-loop): harden code-PR write-time guards (#3670)

Adversarial review of the Stage-1 guard library (`codepr-guards.ts`, OFF, no
runtime consumer) flagged three gaps; all are now closed, additively, with no
currently-sensitive classification loosened:

- **New-file confinement.** `confinePath` realpathed the full candidate, so a
  not-yet-existing file (the adapter's whole purpose) hit `ENOENT` and was
  denied as a `path_escape`. It now canonicalizes the nearest EXISTING ancestor
  (symlink-safe for the real part) and re-appends the new tail lexically,
  resolving `..`/`.` without touching the filesystem, then asserts containment.
  A symlinked ancestor that escapes, a `..` that climbs out, and any non-ENOENT
  realpath error all still fail closed. The returned `resolvedPath` is the
  canonical path the caller MUST write to (closes the symlink TOCTOU).
- **Path-normalization bypasses.** `classifyPath` now strips NTFS ADS suffixes
  (`::$DATA`), trailing dots/spaces per segment, and collapses repeated slashes,
  and matches the sensitive rules + self-guard basenames case-insensitively.
  Forms like `Package.json`, `.GitHub/workflows/x`, `CODEOWNERS ` (trailing
  space), `package.json.` (trailing dot), and `package.json::$DATA` now classify
  sensitive. Over-matches toward sensitive; plain source stays non-sensitive.
- **Throw-free composition.** `evaluateWriteGuards` wraps each guard so a thrown
  exception (e.g. the secret scanner) becomes a fail-closed `guard_error` denial
  (new reason; names the guard + message, never secret content) instead of
  propagating.
