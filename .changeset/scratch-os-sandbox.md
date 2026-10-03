---
'nexus-agents': minor
---

Run scratch-bound expert CLIs, dependency installs, quality checks, security
scanners and change capture in a Linux bwrap sandbox when `changes.isolation.mode === 'os-sandbox'`.
The source tree, dependencies, shared package stores/caches and shared Git config,
index, objects and hooks are read-only. Writable paths are the scratch, its own
worktree Git metadata (including private objects) and a private TMPDIR. Installs
use private writable package stores/caches and copy imports. Pin the sandbox
executable before execution so a scratch PATH entry cannot replace it.

Before change capture, compare the scratch gitfile, commondir and gitdir with
bytes recorded before execution. Modified metadata returns `changes.status === 'tampered'`, an empty diff and a
warning. Capture runs in the same sandbox with
fsmonitor, hooks, external diff and textconv disabled. Host cleanup removes only
the scratch and worktree metadata paths recorded before execution, then runs
source-side worktree prune with fsmonitor disabled.

Remove host IPC environment redirects, mask `/run/user` with an empty tmpfs and
mask existing Docker sockets with `/dev/null`. Preserve DNS resolver paths under
`/run`. Network and abstract-namespace sockets remain reachable.

Unavailable bwrap, blocked user namespaces or sandbox setup failure retain
best-effort execution and record the reason in `changes.isolation`. Dependency
install failure records failed provisioning and leaves the quality gate
unmeasured. Best-effort mode retains the known channel where a SIGTERM-ignoring
install descendant can write the source during the kill grace period before the
shared-config snapshot. Hermetic Git, HUSKY=0, copy imports and shared-config
warnings remain in both modes.

Expert CLIs started inside the sandbox see a read-only home. Codex gets a private `CODEX_HOME` seeded with copies of its `auth.json` and `config.toml` (it cannot start without a writable home). Token refreshes land in that throwaway copy, and the host's codex home is never writable from the sandbox.
