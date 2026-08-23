---
'nexus-agents': patch
---

fix: name the empty case in the vacuous-pass forms beyond `.every()`

`#4580`/`#4587` covered `.every()`. The same defect — a check reporting PASS because it had nothing to check — lives in five other shapes: `![].some(p)` is `true`, a `for` loop with an early failure return never runs its body on an empty collection, `errors.length === 0` holds when the producing loop iterated nothing, `Math.min(...[])` is `Infinity`, and `0 === 0`.

Fixed:

- **`shouldFinalize`** — `results.size === participants.length` and `votes.length === participants.length` are both `0 === 0`, so a session whose roster emptied transitioned to `finalizing` as though its work were complete. Reachable: `getStatus()` returns a shallow copy sharing the live `participants` array.
- **`benchmark-runner` / `memory-benchmark-output`** — a run that recorded zero operations, and a run with zero configured thresholds, both certified the perf gate. `checkThreshold` returned `null` for "no threshold set" and for "check passed" alike; those are now distinct.
- **`stpa-validation`** — a tool with no readable input schema, or with zero constraints evaluated, reported `valid: true`. An _empty_ property map is deliberately not that case: a parameterless tool has been inspected and found to have nothing to sanitize.
- **`skill-composer`** — a composition with zero steps reported executable.
- **`aflow` structure and completeness** — a zero-step workflow was reported acyclic, uniquely-identified, validly-roled and constraint-satisfying, all without a step being read.
- **`workflow-evolver-helpers`** — two zero-step workflows reported crossover-compatible.
- **`consensus-plan`** — when every CLI answered but none produced a parseable plan, the summary rendered as an ordinary consensus plan containing zero steps. It now says nothing was compared.
- **`confidence-cascade-stage`** — escalation on zero candidates was emergent from `-Infinity < threshold`; it is now explicit, with a `confidence:no-candidates` signal separating "nothing scored" from "scored too low".

Three sites on the original list were traced and left alone as false positives: `setup-command` and `workflow-run` aggregate over fixed or specification-derived lists, and `correlation-helpers` fails in the conservative direction — an unmeasured panel collapses to one subset, reducing effective vote count rather than inflating it.
