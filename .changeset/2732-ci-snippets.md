---
'nexus-agents': patch
---

`repo_security_plan` now emits a GitHub Actions CI snippet for every scanner it can recommend, and caps `critical` priority at one scanner per category ([#2732](https://github.com/williamzujkowski/nexus-agents/issues/2732)).

**CI snippet coverage.** Pre-fix, the `CI_SNIPPETS` map covered only 11 of the 27 fallback scanners. A TypeScript repo asking for a plan therefore got `ciSnippet: null` for `npm-audit`, `eslint-security`, `sonarqube`, and `trivy` — the recommendations all rendered with a copy-paste-ready snippet missing. Python, Ruby, Go, Java, PHP, Rust, Kotlin, HCL, and shell repos hit the same gap on their language-specific scanners. Added entries for 19 missing scanners (`eslint-security`, `sonarqube`, `npm-audit`, `trivy`, `trufflehog`, `cppcheck`, `spotbugs`, `pip-audit`, `cargo-audit`, `bundler-audit`, `composer-audit`, `govulncheck`, `detekt`, `brakeman`, `phpstan`, `tfsec`, `owasp-dependency-check`, `owasp-zap`, `syft`).

**Priority noise.** Pre-fix every SCA and secrets entry was marked `critical`, so a TypeScript plan came back with three `critical` scanners (`npm-audit` + `osv-scanner` + `gitleaks`) — the priority signal was meaningless. SAST already used "first scanner → critical, rest → recommended"; now SCA and secrets follow the same rule.

**Drift gates.** Two regression tests bind the registry: (1) iterates `FALLBACK_SCANNER_DATA.scanners` and fails when any recommendation comes back with `ciSnippet: null` on github-actions, (2) asserts no category has more than one `critical` recommendation across TypeScript/Python/Go/Ruby/Java plans. Both gates verified to fail on pre-fix code.
