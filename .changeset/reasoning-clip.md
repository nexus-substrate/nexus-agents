---
'nexus-agents': patch
---

fix(cli): stop clipping voter reasoning at 600 characters (#5339)

`--verbose` clipped each voter's rationale at 600 characters. Measured against a
live 7-voter panel: **every voter exceeded it**, the shortest rationale was
1567 characters, and the median lost roughly 80% of its argument. A blocking
dissent was cut mid-sentence — and because reasoning never reaches the persisted
record, that half was unrecoverable. It cost a full review round on #5228: an
objection about the sampler's `{tool, rule}` grouping was clipped away and only
resurfaced, independently, a round later.

The clip was a second control on something the flag already controlled.
Reasoning renders **only** under `--verbose`; the default panel shows the tally
alone. The "seven multi-paragraph rationales would bury the tally" concern was
already handled by making it opt-in, and the number was set without measuring a
real rationale.

What remains is a runaway guard at 20,000 characters, far above any observed
argument, whose only job is to stop a pathological model response flooding a
terminal. It **discloses itself** — `[reasoning truncated at 20000 characters]`
— rather than trailing into an ellipsis, because a reader must be able to tell a
finished argument from an amputated one. That distinction is the whole point of
this change, so the guard must not repeat the defect in miniature.

Deliberately NOT done: rendering dissents in full and approvals clipped. A
governance instrument that records one side's voice completely and the other's
in summary is biased, and the same panel showed why — the architect's approval
in one round and rejection in the next were both substantive, and approvals have
carried conditions. Which voice matters is not knowable in advance.

The durable fix is persisting reasoning in the vote record, which would make the
display a preference rather than a data-loss mechanism. That is `src/audit/` and
tracked as #5339's remaining half.
