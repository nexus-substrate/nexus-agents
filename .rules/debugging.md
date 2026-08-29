---
paths: ['**/*']
description: Reach for this when a test, build, or lint just failed
---

# Debugging & Error-Recovery Rules

Auto-loaded when a test / build / lint fails, or when the user asks for a debug / triage / "why is this broken" investigation. **Full workflow:** [skills/bug-fix/SKILL.md](../../skills/bug-fix/SKILL.md)

## Stop-the-Line (non-negotiable)

On ANY failure in the middle of a multi-step task:

1. **STOP** — do not edit, retry, or "try one more thing"
2. **PRESERVE** — capture raw error, stack, last-passing commit, repro command
3. **DIAGNOSE** — Triage Sequence below; find the _causal_ layer, not the surfacing layer
4. **FIX** — root cause only. No speculative refactors alongside the fix.
5. **GUARD** — regression test that would have caught the original failure
6. **RESUME** — re-run full checks before continuing the original task

Failures compound. An unresolved bug at step N makes every change N+1…N+k incorrect.

## Triage Sequence

1. **Reproduce** reliably (or document conditions if intermittent)
2. **Localize** to a layer: UI / service / data / build / external — verify with a log, not a hunch
3. **Trace to the producer, not the guard.** When a check, flag, or reported value looks wrong, find every production writer of the value it reads. A guard that reads correctly proves nothing if nothing upstream can make it fire — grep the writers before concluding the logic is fine
4. **Reduce** to minimal failing case
5. **Fix** at the root. Upstream fix = usually right; downstream dedupe/catch = usually a symptom patch
6. **Guard** with regression test that fails without the fix
7. **Verify** end-to-end

## Anti-Rationalization

| Excuse                           | Counter                                                                                                                                                                                                                                                                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "I know what the bug is"         | Unverified guesses succeed ~70%. Reproduce before fixing — cost of confirming is minutes, cost of a wrong fix is hours + a regression.                                                                                                                                                                                      |
| "The failing test must be wrong" | Sometimes true, but verify against the spec _before_ changing the test. Tests asserting correct-but-inconvenient behavior get "fixed" to assert the bug.                                                                                                                                                                    |
| "It works on my machine"         | Diff Node version, env vars, lockfile drift, CI container, clock/timezone, fs case sensitivity. Environment is a variable.                                                                                                                                                                                                  |
| "This is flaky, ignore it"       | Flaky = real race / ordering / timing bug being exposed. Fix it or understand why. `.skip` with a TODO is ticking debt.                                                                                                                                                                                                     |
| "It passed, so it works"         | A pass is evidence only once you know what it measured. Check the subject: right branch (`git rev-parse HEAD` vs the PR head), right run, right input. A test can pass because it never reached the code — a wrong arg name rejected at validation, an empty fixture, a degraded environment returning nothing to validate. |
| "That failure is pre-existing"   | Pre-existing is not the same as unimportant. Baseline it, then read WHAT is failing. `research_synthesize` had been erroring on every real call; CI was green only because CI's registry was empty, so the tool returned nothing to validate (#5134).                                                                       |

## Non-Reproducible Bugs

- Timing / race: add timestamps, widen race windows with artificial delays
- Env-dependent: diff local vs CI env vars, Node/pnpm versions, lockfile
- State-dependent: isolate the triggering sequence; clear DB/cache between attempts
- Regression: `git bisect run` with a one-line repro script beats manual inspection

## Instrumentation

- Add logging _only when necessary_, remove on resolution
- Keep only permanent telemetry (error boundaries, API logging, metrics)
- Never leave `console.log` / ad-hoc prints in committed code — use the logger
