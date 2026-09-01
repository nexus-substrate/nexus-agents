---
'nexus-agents': patch
---

fix(security): validate SARIF at the trust boundary instead of casting it

`sarif-parser.ts` did `JSON.parse(json) as SarifLog` on stdout from an external
subprocess (semgrep, via `runSemgrep`). The cast made every field a claim rather
than a fact, and the claims reached the ship gate.

The consequential one was severity. `resolveSeverity` did
`SARIF_LEVEL_MAP[level] ?? 'medium'`. SARIF 2.1.0 defines exactly four levels
and all four are mapped, so that arm fired only for a level we did not
understand — and `'medium'` is below `BLOCKING_SEVERITIES` in
`pipeline/security-gate.ts`. So "we could not read this severity" silently
became "this does not block", and `agent-executor` recorded security as passed
for a finding the scanner had reported.

An unmapped level now fails closed to `'high'` and is named in
`SarifParseResult.errors`, so the record says the severity was assigned rather
than measured. The four spec levels are unaffected.

Type validation covers the rest of the boundary. Verified against main, the
parser previously emitted findings carrying `startLine: "9"` (a string),
`rule: 99` (a number) and an object `message` — each violating
`SecurityFindingSchema`, which has existed since #1682 and was never applied.
Results and rules are validated individually rather than inside the envelope
schema, so one unreadable result is skipped and disclosed while the rest of the
scan is still reported; discarding the whole scan on one bad result would turn a
partial read into a clean pass.

A document that is not a SARIF log at all (a top-level array, string or number)
used to read `.runs` off it, get `undefined`, and report `'No runs in SARIF'` —
which an operator reads as "the scanner ran and found nothing". Those two states
are now distinguishable.

`SecurityFindingSchema` is deliberately NOT re-applied to the constructed
finding: once the input is validated the output is correct by construction, so a
runtime output check could not fail. It is used as the oracle in the tests
instead, where it can.
