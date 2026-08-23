---
'nexus-agents': patch
---

Fail any unit test that spawns a real agent-CLI binary (#4639)

#4629 fixed four tests that shelled out to a real `opencode`. This stops the
fifth. A vitest `setupFiles` interceptor blocks the five agent CLIs (`claude`,
`gemini`, `codex`, `opencode`, `agy`) and records the attempt; anything else —
`git`, `node`, `npm` — passes through untouched, because 16 test files spawn
those legitimately and a blanket guard would be reverted within a day.

Full-suite spawn count goes from 23 to 0.

Two mechanisms that look right and are not, recorded in the module so they are
not retried: mutating the `node:child_process` namespace throws
`Cannot redefine property`, and a `Proxy` apply-trap misses
`promisify(execFile)` entirely because promisify resolves via
`util.promisify.custom` — that alone would have let 17 of the 23 spawns
through while the guard reported success.

Blocking is also not enough on its own. Every CLI probe catches the throw and
reports "CLI unavailable", so the spawn stopped while the test still passed,
silently, on a branch it never meant to take. Attempts are re-raised from an
`afterEach` outside any production catch block.
