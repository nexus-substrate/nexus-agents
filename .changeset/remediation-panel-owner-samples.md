---
'nexus-agents': patch
---

Review remediation soak selections in batches with a live consensus panel, then
check a reproducible random owner sample before sign-off. Readiness now reports
human, panel and sampled owner judgments separately and requires at least ten
owner sample judgments with no disagreements, while preserving legacy human
reviews and panel vote provenance.

Panel proposals include signal identity, classification, title, description,
evidence and selected plan steps, plus a hash binding the exact stored line.
Earlier vote reasons and results stay outside the proposal. Each panel review
pins the absolute ledger path used by persistence. Evidence must match that
ledger's vote decision, proposal hash/text and self-hash; missing, unreadable or
malformed ledgers make the panel unverifiable. Duplicate soak references are
skipped and reported, and batches parse one soak snapshot.

Owner agreement requires at least ten fully measured sample refs drawn strictly
after the latest current panel judgment. Disagreements across all draws persist
until an agreeing owner-sample mark on the same ref is made by its named owner;
human primary reviews cannot clear them. Damaged review/sample stores block
readiness and refuse appends. Panel IDs never satisfy named-evaluator, and owner
annotations require explicit sign-off. Owner agreement is n/a only with zero
panel rows and zero owner-sample rows in the raw store. Unverifiable or evicted
panels block owner agreement and judged coverage; human-only review remains supported.
