---
'nexus-agents': patch
---

Fix the pr_review budget/hash unit mismatch that let a partial review record as complete (#5818)

`packDiffForReview`'s fast path compared `prDiff.length` — UTF-16 code units —
against a budget the rest of the module spends in UTF-8 bytes (`DiffFile.bytes`
is documented as "the budgeting unit", and `securityFirstPack` packs "into
`budget` UTF-8 bytes"). The reviewed-diff hash truncates on
`Buffer.byteLength` too.

So a diff carrying multibyte content could sit under the budget by code units
while `reviewedDiffHash` bound only a prefix of it. The packer returned
`coverage: undefined`, meaning the record asserted a COMPLETE review over
content the binding never attested. Measured: a 20,068-character diff
(60,068 bytes) reported complete coverage, and appending an entire extra file
past the cap left the hash byte-identical.

The fast path now measures UTF-8 bytes, so the existing partial-coverage
disclosure — a voter-visible NOTE plus a hash-covered stamp in the record
summary — fires on exactly the diffs whose hash is truncated. Byte-measuring is
never looser than code-unit measuring, so no diff that packed before stops
packing; only non-ASCII diffs near the cap newly (and correctly) report partial.

Ratified by a 7-voter panel at supermajority (6 approve / 1 reject, option A
unanimous among approvers).
