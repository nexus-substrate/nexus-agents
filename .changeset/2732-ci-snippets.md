---
'nexus-agents': patch
---

`repo_security_plan` now emits a GitHub Actions CI snippet for every scanner it can recommend ([#2732](https://github.com/williamzujkowski/nexus-agents/issues/2732)).

Pre-fix, the `CI_SNIPPETS` map covered only 11 of the 27 fallback scanners. A TypeScript repo asking for a plan therefore got `ciSnippet: null` for `npm-audit`, `eslint-security`, `sonarqube`, and `trivy` — the recommendations all rendered with a copy-paste-ready snippet missing. Python, Ruby, Go, Java, PHP, Rust, Kotlin, HCL, and shell repos hit the same gap on their language-specific scanners.

Added entries for 19 missing scanners (`eslint-security`, `sonarqube`, `npm-audit`, `trivy`, `trufflehog`, `cppcheck`, `spotbugs`, `pip-audit`, `cargo-audit`, `bundler-audit`, `composer-audit`, `govulncheck`, `detekt`, `brakeman`, `phpstan`, `tfsec`, `owasp-dependency-check`, `owasp-zap`, `syft`) and a drift-gate test that iterates the fallback scanner list and fails when any recommendation comes back with `ciSnippet: null` on github-actions. Confirmed the gate catches the pre-fix bug (lists exactly the 7 scanners that were broken in the TypeScript/Python/etc. plans).
