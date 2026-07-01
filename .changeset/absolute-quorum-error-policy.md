---
'nexus-agents': minor
---

Add an opt-in `absolute_quorum` error policy so an errored voter — especially the
Contrarian (`catfish`) — DEGRADES a panel verdict to `no_quorum` instead of being
silently dropped from the denominator (#4132, epic #4130).

The anti-DoS invariant: an induced voter error can NEVER manufacture `approved`
and NEVER manufacture `rejected` — errors force `no_quorum`, a recoverable
"re-run the missing voice" state. A genuine `reject` / `request_changes` still
blocks; the happy path (all-approve, zero-error, contrarian-present) stays
`approved`. This closes the gap where knocking one voice offline could flip or
rubber-stamp a security/architecture verdict.

- `consensus_vote`: new `absolute_quorum` value on `errorPolicy` (CLI
  `--error-policy` + MCP input). The post-tally predicate lives in
  `buildResponse`: `approved` requires zero errors, the contrarian present and
  non-error (skipped in `--quick`, which has no catfish), AND an ABSOLUTE
  approval floor `ceil(fraction * panelSize)` over the full requested panel. Any
  error, or an errored/missing contrarian, degrades to `no_quorum` with an
  actionable re-run message naming the errored role(s). The default policy
  (`reduce_denominator` / `fail_closed` for unanimous) is unchanged.
- Quick-mode: a `runContrarianCheck` escalation that ERRORS now degrades to
  `no_quorum` under `absolute_quorum` instead of silently proceeding.
- `pr_review`: new `errorPolicy` input (`standard` default | `absolute_quorum`).
  Under `absolute_quorum`, the Tier-3 verified-approve is gated on a complete,
  error-free panel with the contrarian approving; otherwise it degrades to
  `{ decision: 'abstain', verified: false, reason }` (the `no_quorum` analogue).
  Tier-1/Tier-2 genuine blockers still win.
- Telemetry: a module-level degraded-panel counter (`getDegradedPanelCount`) —
  the evidence base for a future default-flip.
