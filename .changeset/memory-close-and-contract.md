---
'nexus-agents': patch
---

`MemoryRegistry.close()` no longer reports success for backends it never closed
(#5776 item 2). It marked itself closed *before* the loop and awaited each
backend in turn, so one rejecting backend left every later backend open and
leaked the shared SQLite handle, while the retry a shutdown path would make
returned early and resolved. Every backend is now attempted, the owned handle
always closes, and the first failure is re-thrown.

Also pins the three places the two backends genuinely diverge, which the shared
contract suite could not see because its only payload is the two shapes JSON
preserves exactly.
