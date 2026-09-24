---
'nexus-agents': patch
---

`nexus-agents doctor` no longer reports false failures, and treats unmeasured checks the same way everywhere (#6782).

- **Install freshness** compares versions as semver. A global install newer than this build (or a release newer than its pre-release) is now `ahead`, shown with ⚠ and not failing the exit code. Only a strictly older global install is `behind` ✗. An unparseable version is `unknown`.
- **Harness alignment** looks for `AGENTS.md` and the harness config files at the project root (the git root, else the nearest `package.json`), not only in the current directory. Running `doctor` from a subdirectory no longer reports a false "AGENTS.md MISSING".
- **Unmeasured checks**: install freshness that could not be determined, and a scratch filesystem that could not be read or identified, are shown with ⚠ and named in the summary line (`— unmeasured: install freshness, scratch space`). They do not fail the exit code by themselves. Before this, an unknown install freshness failed `doctor`, while an unreadable scratch filesystem passed with no mention in the summary.
- **CLI list in gateway mode** reports each CLI binary's own health. A slot served by the gateway because its CLI is unavailable was credited to the CLI (version `api`, healthy, admitted); the CLI now shows its own version, status and error, or "Not found in PATH" when there is no binary.
