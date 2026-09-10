---
'nexus-agents': patch
---

Codex is now started with `-c features.use_legacy_landlock=true` on Linux, on both the `codex mcp-server` spawn the voter seats use and the subprocess `codex exec` path (#6093). On hosts with `kernel.apparmor_restrict_unprivileged_userns=1` (the Ubuntu 24.04+ default) every bwrap-backed codex sandbox mode failed with `bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted` before codex could read a file, so the two codex voter seats either abstained with "repository inspection failed" or voted on the proposal text alone. With the legacy landlock backend (measured on codex-cli 0.153.4) reads work and writes are still refused. The read scope is read-only-all-disk, the same scope the read-only bwrap profile already granted, so nothing widens; the flag is not passed on macOS or Windows. `docs/guides/SANDBOXED-USAGE.md` documents the cause, the flag and the host-level alternative.
