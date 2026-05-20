---
'nexus-agents': minor
---

**feat(config):** sandbox-fallback for cross-repo paths + `nexusDataPathEnsure()` helper. Closes #2888 + #2890 (epic #2887).

## Sandbox-fallback (#2888)

Cross-repo subdirs (`research`, `learning`, `memory`, `voting`, `weather`, `auth`, `usage`) now transparently fall back to `<repo>/.nexus-agents/<subdir>/` when `~/.nexus-agents/` is physically unwritable AND we're inside a git repo. Per the user direction at epic #2887: _"research could be cross repo but we need to be able to support it locally in a repo as well and create the folder if missing — I don't want to override the vote I just want things to work for users running nexus-agents in a sandbox without cross repo access."_

The fallback fires only when homedir is genuinely unreachable. Normal-machine users see no change — vote #2876's state-split is preserved. A one-time stderr warning per subdir announces the fallback so operators can see what happened without per-call noise.

If homedir is unwritable AND we're not in a repo, the resolver returns the homedir path anyway — the caller's eventual write surfaces the underlying EACCES, which is the right error to show because the environment is genuinely broken.

## `nexusDataPathEnsure()` (#2890)

New helper that resolves like `nexusDataPath()` then auto-creates the parent directory. Eliminates the class of "forgot `mkdirSync(dirname(p), { recursive: true })`" bugs that callers were working around individually. `nexusDataPath()` itself stays pure (no syscalls on resolve) — callers that want auto-create opt in explicitly.

## Tests

11 new tests covering: per-repo subdir short-circuits before the writability probe, cross-repo fallback fires only when homedir unwritable + in repo, no fallback when not in a repo (surfaces the underlying error), once-per-subdir announce, `nexusDataPathEnsure` creates parents idempotently.
