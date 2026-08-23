---
'nexus-agents': patch
---

fix(ci): make the orphan gate able to fail, and each exemption say why it exists

`scripts/check-orphans.ts` ended with `return true` no matter what it found. It
detected orphans correctly, printed them under a "Flagged orphans (audit-only —
not blocking)" heading, and exited 0. The docstring promised promotion "in
v2/v3" with nothing tracking that promise, so v1 was the permanent state. A
check that cannot fail by construction is not a check — it is a CI job that
launders an unread finding as a passing gate.

Promotion is free today and was already earned: the repo reports 22 orphans, all
22 allowlisted, 0 flagged, so `return flagged.length === 0` lands green. The
gate is also demonstrably able to fire — an unreferenced non-exempt module makes
it exit 1, and removing that module returns it to 0.

That moves the load onto the allowlist, so the allowlist now has to be honest
too. The seven `patterns` are permanent structural facts about the repo layout
(tests, scripts, configs, examples, migrations, barrels) and are unchanged. Each
`specific_files` entry — the one-off exemptions, the ones that quietly become
debt — must now declare exactly one of `expires: YYYY-MM-DD` or
`permanent: true`. Neither fails the check by name; both fails as a
contradiction; an unparseable date fails rather than silently never expiring.
Once an `expires` date passes the entry stops exempting, so the file flags and
the gate goes red.

The obvious version of this rule — require `expires` on everything — would have
been wrong. The sole entry is a TypeDoc markdown-hooks plugin loaded by name
from `typedoc.markdown.json`; it exports only a `load(app)` hook and can never
be imported. Stamping a fake expiry date on a permanent structural fact is the
same defaulted-rather-than-named value this change exists to remove, so it is
marked `permanent: true` with a rationale saying why nothing can import it.

Scope is unchanged: knip's unused-_files_ category only. The unused-_exports_
half stays with the #4561 ratchet.

Closes #4583.
