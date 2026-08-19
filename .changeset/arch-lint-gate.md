---
'nexus-agents': patch
---

Make `lint:arch` a gate that actually runs, and add a tempdir-cleanup rule (#4490).

`scripts/arch-lint.ts` has existed since #570 and exits non-zero on error, but it was wired into no workflow and no hook — nothing ever ran it. An unrun gate rots like unrun code: it had drifted to 9 errors, all false positives.

- **Test Hygiene (5)** — `vi.fn()`/`vi.mock(` matched inside _comments_ and inside `expert-prompts` text, which are prompt strings that teach testing practice. Whole-line comments are now skipped (trailing comments deliberately are not, so `//` cannot mask real code), and `expert-prompts` is exempt.
- **Security (4)** — "Hardcoded API key" fired on a `${apiKey}` template interpolation, an `{env:NAME}` placeholder, a pattern quoted in a comment, and AWS's published documentation placeholder used as the _input_ to a credential-scanning example. Runtime indirections no longer count as hardcoding; the last is suppressed with a documented `arch-lint-ignore security` directive.

New **`tmpdir-cleanup`** rule: a module calling `nexusMkdtemp`/`nexusMkdtempSync` must also contain an `rm`/`rmSync`/`rimraf` teardown. Stated honestly, this is a module-level smoke check — it proves teardown _exists_, not that every throw path reaches it; ordering stays a review concern. It catches the failure mode that actually occurred (#4489): a new caller landing with no teardown at all.

Suppressions use `// arch-lint-ignore <rule> -- <reason>`, accepted on the line or anywhere in the contiguous comment block above it, so every suppression names its rule and is greppable.

Also fixed the reporter: errors were truncated behind a 10-item-per-category cap that warnings filled, so a failing run could not say what failed. Errors now print in full, ahead of warnings.

`lint:arch` now runs in CI's Lint job. Errors block; the 397 advisory warnings do not. Repo is at 0 errors.
