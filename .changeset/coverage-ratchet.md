---
'nexus-agents': patch
---

fix(test): ratchet coverage floors from measured actual, 60/50 → 88/79/92/89

`.rules/testing.md` and CODING_STANDARDS.md documented line ≥80% / branch ≥75%
while `vitest.config.ts` enforced 60/50/60/60, and nothing compared the two.

Measuring settled it in the opposite direction from the obvious guess: actual
coverage is **89.51 statements / 80.52 branches / 93.02 functions / 90.45 lines**
over 28,549 tests. The documented bar was right and already met; the enforced
floor sat 30 points below reality, so it could not fail — a check that measures
nothing.

Floors are set one point below measured actual rather than at it. Two
consecutive full runs returned 80.52 and 80.50 for branches, so a floor equal to
actual would flake, and a gate that reddens for reasons unrelated to regression
is how floors get lowered in a hurry.

The docs now state the ratchet **policy** and name `vitest.config.ts` as the
single source of the numbers. One copy cannot drift from itself.

Lowering requires owner ratification and a stated cause. Coverage is a ratio, so
deleting dead well-tested code lowers it — #5098 removed 4,131 lines of
never-constructed routing stages and would have tripped a naive ratchet,
rewarding keeping the dead code.

Panel: option C, 6/6 approvers, supermajority met.
