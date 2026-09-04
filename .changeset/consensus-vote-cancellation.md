---
'nexus-agents': minor
---

feat(mcp): consensus_vote honours cancel_job — the remaining voters are not launched (#5393)

`runAsJob` derives `signalAccepted` from the runner's arity and records it
honestly, which #4972 fixed. **Nothing used it.** All ten adopting tools declared
an arity-2 runner, so `signalAccepted` was `false` everywhere and `cancel_job`
marked a job cancelled while every remaining voter still ran. The most expensive
jobs are exactly the ones a user would want to cancel: `consensus_vote` fans out
to 7 live voters and can run for minutes. Cancelling one stopped the
bookkeeping, not the spend.

`consensus_vote` now takes the signal. The chain is
`run(jobId, input, signal)` → `handleConsensusVote` → `executeVoting` →
`collectRealVotes` → the staggered launcher, which checks the signal **after
each stagger delay** — the point where an un-launched voter is actually waiting
— and returns an error result for the voters it does not start.

`signalAccepted` flips to `true` for this tool **because the arity changed**, so
the record follows the capability rather than being claimed separately. The other
nine tools are untouched and still report `false`.

## A false comment was covering this

`consensus-vote.ts` carried a paragraph stating that on cancel "the existing
collector unwinds via the AbortSignal plumbing already in #3038 —
`collectRealVotes` honors per-voter signals". It did not. `collectRealVotes` had
no signal parameter at all. A docstring describing a capability that did not
exist is plausibly why this went unnoticed for as long as it did; it is corrected
to describe what actually happens now.

## What cancellation does and does not do

Votes **already in flight are left to settle**. An adapter call is a subprocess
or an HTTP request whose cost is already incurred, and abandoning it would lose
the result without saving the spend. The win is the remainder: cancelling a
7-voter panel after two have started stops five model calls. Whatever landed is
still written, so audit visibility into who voted before the cancel is preserved.

Un-launched voters are recorded as **error** results, never as a decision — a
cancelled voter returning `approve` would manufacture consensus out of work that
never ran.

## Verification

Four mutations, each run separately, one per link in the chain:

| mutation                                            | result   |
| --------------------------------------------------- | -------- |
| runner back to arity 2                              | 2 failed |
| launcher ignores the abort                          | 3 failed |
| `collectRealVotes` drops the signal                 | 1 failed |
| `consensus_vote` drops it before `collectRealVotes` | 1 failed |

The third and fourth are the reason two of these tests exist. The launcher test
and the tool test both stayed green while the middle of the chain dropped the
signal on the floor — and the first seam test I wrote did not catch it either,
because it mocked `collectRealVotes` and so never exercised the forwarding
inside it.

The acceptance test asserts the **adapter was not called** for un-launched
voters, not merely that a job status became `cancelled`; the latter would pass
against code that cancels the bookkeeping and keeps spending.

`src/cli` + `consensus_vote` dispatch: 3748 tests passing. `tsc` and `eslint`
clean.

## Two structural notes

`executeVotingInner` took `opts` as required, normalized by `executeVoting`.
Every `opts?.` inside was a branch against the same never-null value; removing
the optionality at that boundary took the complexity **down**, rather than
adding one more branch for the new field.

`launchVotesWithOverallDeadline` carries a targeted `max-lines-per-function`
disable. It was already at the 50-line cap and this adds two guards, one per
model call the function can make. Splitting the staggered mapper out would need
six closed-over values threaded through an options object — more structure than
two `if` statements justify. The #3587 rationale moved onto
`shouldRetryOnFallback` to pay for what it could.
