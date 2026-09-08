---
'nexus-agents': patch
---

`extractStateValue` now has tests and a JSDoc that describes it accurately
(#5771 item 4). It is published API with no consumer anywhere — not even a test
— under a section header promising "typed access to well-known state keys",
while the function is a bare `state[key]` returning `unknown`. Behaviour
unchanged; the signature narrowing that would make the old header true is
breaking and stays queued for the next major.
