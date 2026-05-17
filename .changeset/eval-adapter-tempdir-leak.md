---
'nexus-agents': patch
---

**Closes one bullet of #2824.** fix(adapters/codex,gemini): cleanup removes the tempdir parent, not just the file

`CodexCliAdapter.getCommand` and `GeminiCliAdapter.getCommand` created a `mkdtempSync` tempdir per call when a `systemPrompt` was provided, dropped an `instructions.md`/`policy.md` into it, then on cleanup unlinked only the file. The empty `/tmp/nexus-codex-sysprompt-XXXXXX` and `/tmp/nexus-gemini-sysprompt-XXXXXX` parent dirs were leaked, waiting for the OS reaper.

Long-running MCP daemons and CI workers that fan out many subagent calls accumulated thousands of empty dirs, eventually hitting inode/disk limits. Fix is one-line per adapter: switch `unlinkSync(file)` → `rmSync(dir, { recursive: true, force: true })`.

Two new regression tests cover the post-cleanup state — both the file AND parent dir must be gone. Pre-fix only the file was unlinked.
