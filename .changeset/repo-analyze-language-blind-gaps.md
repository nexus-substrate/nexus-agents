---
'nexus-agents': patch
---

`repo_analyze` no longer reports language-blind false gaps (#6018)

Found by running nexus-agents against external repositories rather than itself.
On `aegis-boot/aegis-boot` (Rust) it reported three gaps, all false — and its
own `topLevelEntries`, in the same response, disproved one:

- "No LICENSE file" — the repo has `LICENSE-APACHE` **and** `LICENSE-MIT`, the
  standard Rust dual-license. The check was `includes('LICENSE') ||
includes('LICENSE.md')`.
- "No test directory detected" / `hasTests: false` — 1385 `#[test]` functions
  across 84 files. The probes look for a root `tests/` dir or a JS test-runner
  config.
- "No CODEOWNERS file" — `.github/CODEOWNERS`, 31 lines. Only the repo root was
  checked, though GitHub honours root, `.github/` and `docs/`.

The same call on a TypeScript repo returned `gaps: []` and was correct on every
axis, which is what makes it a defect rather than a broken detector: it encoded
root-level JS conventions and reported their absence as fact. For any Rust repo
it emitted the same three gaps regardless of content — a constant wearing the
costume of a finding, and `repo_analyze` feeds `repo_security_plan`.

Widens LICENSE to a `LICENSE*`/`LICENCE*` match and looks for CODEOWNERS in
`.github/` as well as the root. The structural half matters more: a new required
`testsMeasured` field, and a gap is emitted only when the check could actually
run. Rust is deliberately absent from the test-probe language list, so it now
reports `testsMeasured: false` instead of asserting an absence nobody measured.
Only the NEGATIVE is language-guarded — a root `tests/` directory means tests
whoever wrote it.

Verified against both repos: aegis-boot now returns `gaps: []` with
`testsMeasured: false`; the TypeScript control is unchanged.
