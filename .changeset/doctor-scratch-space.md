---
'nexus-agents': minor
---

`doctor` now reports headroom on the filesystem backing the scratch root (#4488).

A full scratch filesystem is invisible until it bites, and it bites badly: a subprocess does its work and then dies at the _write_ step, so the output is lost rather than the command being refused. During a long autonomous run that reads as unexplained tool failure, not a disk problem.

`nexus-agents doctor` now prints a scratch-space line alongside the other storage checks:

```
✓ Scratch space (/repo/.nexus-agents/tmp): 226.9 GiB free of 912.8 GiB (75% used)
```

Grading is on **absolute free bytes**, deliberately not percentage — the question is "can the next run write?", which is an absolute quantity. 3% free on a 4 TiB volume is ~123 GiB and entirely fine; 20% free on a 1 GiB volume is not enough for one agent run. Percentage is reported for context only. Warn below 2 GiB, critical below 512 MiB; remediation guidance (free space, or repoint `NEXUS_TMPDIR`) is printed only when space is actually short.

The check never throws — a platform without `statfs` reports as unreadable and grades `ok`, since an unreadable filesystem is not evidence of a full one and a diagnostic must not fail closed.
