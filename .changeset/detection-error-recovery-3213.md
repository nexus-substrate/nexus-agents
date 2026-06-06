---
'nexus-agents': patch
---

feat(cli): actionable recovery guidance for CLI detection errors (#3213)

CLI detection failures now carry a class-specific, runnable recovery step (via
`detectionRecoveryHint` / `DETECTION_ERROR_SOLUTIONS`) with a
`docs/TROUBLESHOOTING.md` pointer — e.g. permission → `chmod +x "$(command -v
<cli>)"`, timeout → check PATH for hung mounts / re-run with `--verbose`,
not-found → install + PATH guidance. `nexus-agents setup` prints the hint beneath
each unavailable CLI's status line instead of just a terse cause phrase.
