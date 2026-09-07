---
'nexus-agents': minor
---

`withRetry` accepts an optional `signal`, and its exponential backoff is now
interruptible. The wait was a bare `await sleep(delayMs)`, so a cancelled
operation still held real wall-clock time before the loop noticed — with the
default profile, seconds of delay for work nobody wanted. An abort now cuts the
wait short and returns `err(RetryExhaustedError)` (never a throw — the
never-throws contract `execute_expert` depends on), and an already-aborted
signal skips the operation entirely rather than running it once first.
