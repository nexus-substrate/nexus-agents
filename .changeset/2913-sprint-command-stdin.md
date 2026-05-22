---
'nexus-agents': patch
---

**fix(sprint):** create sprint epics via `gh ... --body-file -` stdin. Closes #2913 (#2824 audit bullet 10, sprint half).

`createSprintIssue` embedded the markdown proposal body in the command string as `gh issue create --body '<body>'`. The body has a markdown table (`|`) and `(effort)` parentheticals, so the sandbox `validateArgs` gate denied the argument and `safeExecSandboxed` returned `null` — every sprint epic silently failed to create. The title was also affected: `generateSprintTitle` produced `sprint: MM/DD/YYYY (duration)`, and the `(duration)` parentheses tripped the gate on the inline `--title` argument.

The body is now piped to `gh` over stdin (`--body-file -`), so it never touches the shell. `generateSprintTitle` uses `sprint: MM/DD/YYYY - duration` (dash, no parentheses) so the title stays a metacharacter-free inline `--title` argument. This completes audit bullet 10 — the `vote-command` half shipped in #2863.
