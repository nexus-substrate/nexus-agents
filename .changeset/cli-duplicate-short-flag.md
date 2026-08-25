---
'nexus-agents': patch
---

stop `vote -t supermajority` silently running a simple-majority vote

`parseArgs` takes one options object for the whole CLI, so a short letter is
global even when the two long options belong to different commands. `-t` was
claimed by both `task` and `threshold`; `task` is declared first and won, so
`--threshold` was never set from the short form, `resolveStrategy` fell through
to its `simple_majority` default, and the summary reported that default as the
chosen threshold. No error — `strict: false` makes the misbinding silent.

`-p` had the same collision between `proposal` and `period`, leaving
`learning-metrics -p` unable to set its reporting window.

Both losers drop their short form and keep the long one; neither was reachable,
so nothing that worked before changes. The help entry and its example now show
`--threshold`.

The durable part is a test that walks the options table and asserts no letter
is claimed twice — nothing in the type system or the parser objects to a
duplicate, so the next one would recur silently.
