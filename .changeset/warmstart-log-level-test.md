---
'nexus-agents': patch
---

test(routing): pin the warm-start skip log levels at the seam

`warmStartSkipLogs` decides which skip bucket is a `warn` and which is a
`debug`, and is unit-tested. Whether `warmStart` honours that decision was not:
collapsing the mapping to a single `logger.warn` left the entire suite green, so
the drowned-signal regression #4904 fixed could return unnoticed.

Asserted on the bytes the process actually writes at the default `info` level
rather than through a mocked logger — that `debug` is dropped is the behaviour
being protected, and a mock would assert the intent instead of the outcome.
