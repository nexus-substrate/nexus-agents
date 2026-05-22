---
'nexus-agents': patch
---

**fix(vote):** record vote comments via `gh ... --body-file -` stdin. Closes #2863 (#2824 audit bullet 10).

`recordVoteToGitHub` embedded the markdown comment body directly in the command string as `gh issue comment N --body '<comment>'`. The sandbox `validateArgs` gate rejects any argument containing shell metacharacters (`/[;&|`$()]/`), and every vote comment from `formatVoteComment` contains a markdown table (`|`) plus a `(NN% approval)`parenthetical — so the body token always matched a denied pattern and`safeExecSandboxed`returned`null`. Result: **every** vote comment was silently dropped with "command denied or failed", regardless of the proposal text.

The body is now piped to `gh` over stdin via `--body-file -`, so it never touches the shell. `escapeForShell` is removed (no longer needed). `SandboxExecOptions` gains an optional `stdin` field, wired into `safeExecSandboxed`/`execSandboxed` as `execSync`'s `input` option.
