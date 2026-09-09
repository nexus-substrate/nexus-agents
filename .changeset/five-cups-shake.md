---
'nexus-agents': patch
---

fix(audit): bind pr_review records to the RAW diff and disclose what the sanitizer removed (#5385)

`reviewedDiffHash` is the Option-C authority binding: the pr_review producer
computes it, and the governor-review gate recomputes it from `git diff` and
requires a match. The producer hashed `input.prDiff` — but that string had
already been through the MCP middleware's sanitizer, which strips HTML comments
and XML-like tags. The gate hashes raw git bytes. Two different inputs to the
same function, so the hashes diverged whenever sanitization fired.

This was not a corner case. This repo's own governance-regeneration PRs carry
`<!-- GENERATED:FROM_AGENTS:START -->` markers, so the gate could never match a
record on exactly the PRs it exists to govern — blocking the #3831 warn→enforce
flip.

- The secure handler can now compute pre-sanitization hashes of declared fields
  (`rawHashFields`) and hands them to the tool as `ctx.sanitization.rawFieldHashes`.
  The handler receives only hashes, never the raw text, so nothing is unsanitized
  by construction.
- pr_review binds `reviewedDiffHash` to the raw bytes, so producer and gate agree.
- Records carry a hash-covered `sanitization` disclosure — `sanitizedDiffHash`
  (the once-sanitized full diff) plus BOTH of the middleware's counters. Binding raw bytes
  without saying so would assert "these bytes were reviewed" about bytes no
  voter saw. Absence of the block stays distinguishable from "a sanitizer ran
  and removed nothing". The field is deliberately NOT named for "what the voters
  read": #4140 coverage packing reduces the prompt further on an over-budget
  diff, and that separate reduction stays disclosed separately in the
  hash-covered summary, so an auditor can tell which reduction moved a hash.
- Both counters are carried, not just `commentsRemoved`. The sanitizer removes
  two things and that field counts one: HTML comments (#5258) are counted there,
  while XML-like injection tags (`<system>`, `<context>`, …) go through a
  separate counter. Carrying only the first made a tag strip indistinguishable
  from a genuine no-op, so a record could report "the sanitizer removed nothing"
  about an input a prompt-injection tag had just been taken out of — reachable
  today via a tag in `prTitle` with a clean diff. `fieldsModified === 0` is now
  the only state that licenses that message.
- The voter-facing note carries both counters too, with a deliberately sharper
  wording for the tag case — a stripped injection tag is not routine the way a
  template comment is. It describes the tag class without spelling a literal
  tag: the note is appended AFTER sanitization, so a literal would reach the
  model's prompt unsanitized, reintroducing the exact token just stripped
  through the text warning about it.

`buildPrReviewProposal`'s second parameter changes from a positional
`removedBeforeThisCall: number` to `removedBefore: { comments, fields }`. Both
counts are needed, and a union-typed parameter would let an old numeric caller
silently report `fields: 0` — the same under-count, reintroduced. Note that the
api-surface gate does NOT see this: it records `: typeof <name>` for every
exported function, so no function signature change is visible to it (#6061).

- The producer REFUSES (`raw-hash-absent`) when a sanitizer was in the path but
  supplied no pre-sanitization hash. That is the one state where the fallback
  would write a self-contradicting record: a binding over sanitized bytes the
  gate can never reproduce, carrying a disclosure that compares that hash to
  itself and reports the bytes untouched. Unreachable today; guarded because an
  audit sink must fail closed.
- The governor gate reads the disclosure and labels a pass whose reviewed text
  differs from the bound bytes as PARTIAL, mirroring the existing truncation
  caveat. Equal hashes with a non-zero counter get their own message rather than
  "removed nothing": the counter spans the whole args object while the hash
  covers only the truncated `prDiff`, so a sibling field or a span past the
  50k cap leaves the hashes equal with content genuinely stripped.

Record schema `1.2` → `1.3`. Clean break, as with `1.1` → `1.2`: the committed
`governance/pr-review-records.jsonl` is empty, so no record exists whose hash a
version literal would invalidate. Reading a `1.2` record as `1.3` would be the
unsafe move — its hash may bind sanitized bytes the gate can never reproduce.
