---
'nexus-agents': minor
---

Run scratch dependency installs, quality checks and security scanners in a Linux
bwrap OS sandbox when `changes.isolation.mode === 'os-sandbox'`. The source tree
and shared Git config, index, objects and hooks are read-only. Writable paths are
the scratch, its own worktree Git metadata (including private objects), resolved
package caches/stores and a private TMPDIR. Network remains available for installs.

Unavailable bwrap, blocked user namespaces, or a sandbox whose setup fails after a passing probe (for example an unresolvable package cache) retain best-effort execution and
record the reason in `changes.isolation`. Only best-effort mode retains the known
channel where a SIGTERM-ignoring install descendant can write the source during
the kill grace period before the shared-config snapshot. Existing hermetic Git,
HUSKY=0, copy imports and shared-config warnings remain in both modes.
