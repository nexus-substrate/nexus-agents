---
'nexus-agents': patch
---

fix(adapters): let an open circuit recover while traffic continues

The reset window was measured from `lastFailureTime`, and `onFailure` updated
that field unconditionally — including while the circuit was already open. Since
an open circuit does not shed load on the default paths (`base-adapter` and
`resilient-adapter` never consult `canExecute`), traffic kept arriving, kept
failing occasionally, and each failure pushed the half-open probe another 30s
out. Recovery required a 30-second window containing zero failures; under
concurrent panel traffic with a 5% residual error rate that window never
arrived, and `isCliServingForVoters` kept the CLI out of every voter panel until
a manual `reset()`.

A failure recorded while open is now ignored, and the window is measured from
the state transition rather than the last failure. Remedy chosen by a 7-voter
panel: Option A, 4 of 5 approvers, audit record #79 — the load-shedding half
(gating the default call paths on `canExecute`) was deliberately not taken.
