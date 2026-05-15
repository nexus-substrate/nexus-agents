---
'nexus-agents': patch
---

`repo_analyze` / `repo_security_plan`: detect gitleaks via `.gitleaks.toml` ([#2732](https://github.com/williamzujkowski/nexus-agents/issues/2732)).

Pre-fix the `detectSecurityTooling` rule list didn't include gitleaks config files, so a repo with `.gitleaks.toml` at the top level reported `existingTooling: [security-policy, codeowners, semgrep, codeql]` — gitleaks invisible. Downstream `repo_security_plan` consequently showed `coverage[secrets] = { covered: true, scanners: [] }` (covered by existing-but-undetected tooling), which read as inconsistent.

Now matches `.gitleaks.toml` (canonical), `gitleaks.toml` (legacy), and `.gitleaksignore`. `existingTooling` includes `gitleaks` when any are present; `coverage[secrets]` now has the matching tool in `scanners` or in `existing` consistently.

The other #2732 sub-bugs (`ciSnippet: null` for most scanners, "3 critical SCA scanners" priority noise) are scanner-registry data work — they're tracked separately because they're 60+ lines of YAML edits, not a code fix.
