---
'nexus-agents': patch
---

Stop four unit tests from spawning the real `opencode` binary (#4629)

Measured with a `PATH` shim over the full 1,185-file suite: 23 real `opencode`
spawns, all from four test files, none of them an opt-in integration test.

The disk cost was visible (each spawn unpacks an 8.2 MB `libopentui.so` into
`$TMPDIR` and never removes it). The determinism cost was not: a unit test that
shells out to an installed binary makes the suite's result depend on what is on
the machine. On a box without `opencode` these four exercised a different branch
and nothing reported which branch had run.

`verify-command.test.ts` mocks the auth probe with a deliberately mixed panel —
one authenticated, three not — so both sides of the availability check stay
exercised rather than collapsing to a uniform all-authed shape.

The three MCP tests needed a **wholesale** module mock of the CLI factory. The
narrow `vi.mock(path, async (importOriginal) => ({ ...actual, stub }))` form does
not stop the spawn: the test file's own import is mocked, but other importers
still reach the real `getAvailableClis`. Each mock carries a comment saying so.
