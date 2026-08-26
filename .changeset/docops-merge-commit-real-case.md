---
'nexus-agents': patch
---

test(ci): replace a DocOps escape-hatch test that could not fail

`does NOT see [skip-docops] when only the merge-commit message has it (the
original bug)` created a branch with no bypass token anywhere and asserted the
token was absent. That passes for any implementation that does not invent the
token — including the `git log -1` version #2411 fixed — so it pinned nothing
while reading as coverage of the merge-ref case.

It now exercises the actual #2411 bug: the token sits in an earlier branch
commit with an unrelated commit on top, which is precisely what `git log -1`
missed under a PR merge ref. Narrowing the range to `HEAD~1..HEAD` fails it.
