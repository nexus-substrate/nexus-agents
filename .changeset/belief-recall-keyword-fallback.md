---
'nexus-agents': patch
---

let belief recall find beliefs for a real task description

`fetchBeliefs` called `recallBySubject(task)`, an exact lookup against the
subject index. Subjects are written by producers like `skill:${name}` and
`learning.context` — never the caller's prose — so for any ordinary multi-word
task the lookup missed and the Beliefs section was silently dropped from the
context prefix.

It was intermittent rather than total: a task of three words or fewer matches
`orchestrate`'s `slice(0, 3).join(' ')` subject exactly, and identifier-shaped
tasks (`arXiv:2502.12110`) are their own subject. Those paths kept working,
which is part of why it went unnoticed.

`fetchBeliefs` now falls back to the keyword scan that `queryBeliefMemory`
already uses against the same store (#1225), behind the exact lookup so the
paths that worked are unchanged and the scan only runs when the result would
otherwise be empty. An empty result is logged with the scan size, since it was
previously indistinguishable from "no beliefs stored".

The three existing belief tests all wrote and read the same literal string, so
they stayed green throughout. Added a case that drives a realistic task against
a `skill:`-shaped subject, plus its negative.

Fixes #4845.
