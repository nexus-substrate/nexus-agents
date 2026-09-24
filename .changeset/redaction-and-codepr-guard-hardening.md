---
'nexus-agents': patch
---

Error messages and job records now redact configured gateway header values and more GitHub token formats; the code-PR path guard covers more repository-control paths.

- Gateway errors (model discovery, per-model adapter errors and `doctor --gateway`) redact the key and every `NEXUS_OPENAI_COMPAT_EXTRA_HEADERS` value through one shared helper.
- The output, logger and outcome-storage sanitizers redact `ghs_`, `ghu_` and `github_pat_` tokens, and the credentials in URL userinfo (`scheme://user:pass@host`), keeping the scheme and host.
- Completed async job records sanitize every string value of the stored result, as failed records already did. Keys and non-string values are unchanged.
- The code-PR sensitive-path classifier treats `.git` (the path and anything under it), `.husky/**`, `.gitattributes` and `.github/actions/**` as sensitive. `.gitignore` stays allowed.
- CI withholds secrets from `nexus-codepr/` branches as it does from `auto-remediation/` branches.
