---
'nexus-agents': patch
---

fix(review): stop ordering triangulated dedup by a value that is not confidence (#5119)

`pickBestFinding` decided which of two duplicate findings survived cross-CLI
dedup with `candidate.confidence > existing.confidence`. For a triangulated
finding, `confidence` is `0.7 + priority(cli)` — a constant keyed on the CLI's
name that never consults the model's output. So the comparison read as if it
weighed evidence while it only compared CLI names: a better finding from a
lower-priority CLI lost to a worse one, deterministically, with nothing in the
output saying so.

The tiebreak now reads the per-CLI priority directly. Behaviour is unchanged
today — the two were the same comparison — but they can no longer drift into
each other: if `confidence` ever becomes a real per-finding measurement, dedup
ordering will not silently change meaning along with it.

`CLI_REVIEW_BONUS` is renamed `CLI_REVIEW_PRIORITY` and documented as a source
prior rather than a "confidence bonus", and the assignment site says the value
is not a measurement. An unrecognized `expertId` now scores 0 explicitly, so a
finding from a non-CLI producer can never displace one from a configured CLI.

This is the labelling half of #5119 item 3. The remaining items — the
security-gate triage verdict (item 1) and `actualCostUsd` (item 2) — are
verified still open and stay on that issue.
