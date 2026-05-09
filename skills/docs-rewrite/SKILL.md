---
name: docs-rewrite
description: |
  Improve an existing technical doc in-place via a phased Audit →
  Research → Rewrite → Validate workflow. Calls docs-review for audit
  and validate; never re-derives scoring. Applies answer-first H2s,
  citation capsules, and info-gain markers per .rules/docs-rubric.md.
  Use when the user says "rewrite docs", "improve this doc", "optimize
  doc", "docs rewrite".
allowed-tools: Read, Edit, Write, Bash, Grep, Glob, WebFetch
---

# Docs Rewrite Skill

<!--
  CANONICAL SOURCES:
  - .rules/docs-rubric.md  ← the rubric this workflow consults
  - skills/docs-review     ← read-only audit; this skill calls it twice
                              (audit baseline + validate after rewrite)
  - skills/documentation-management (operating manual)

  User-level skills this workflow consumes (via docs-review):
  - blog-pre-publish, blog-argument-shape, blog-llm-tells,
    blog-factcheck, blog-overlap

  Anti-sprawl: docs-rewrite ALWAYS calls docs-review for the audit and
  validate phases. It does NOT re-implement scoring. The two skills are
  deliberately complementary: review = read-only score, rewrite =
  score → fix → re-score.
-->

## When to apply

Use when actively improving an existing technical doc — RFC, ADR,
README, CLAUDE.md, architecture doc, blog-style technical post. The
workflow modifies the file in place; it's not a read-only audit. For
audit-only, use `docs-review` directly.

Trigger keywords: rewrite docs · improve this doc · optimize doc ·
docs rewrite · refresh doc · improve docs.

## Workflow (Audit → Research → Rewrite → Validate)

### Phase 1 — Audit (read-only)

Call `docs-review` against the target file. Capture:

- The baseline score (e.g., 71/100)
- The top 10 issues by severity
- Specific problem locations (file:line)

Do not edit yet. Present the audit summary to the operator.

### Phase 2 — Plan-mode gate (mandatory)

Before any file edits, present a section-by-section rewrite plan:

```text
# Rewrite plan: <file>

Baseline: 71 / 100

§ Introduction (lines 1-25)
  - Issue: thesis is hedged (3 questions in first paragraph)
  - Plan: hoist the central claim to the first sentence; convert
    questions to declarative statements

§ Section 2 (lines 30-89)
  - Issue: 4 unsourced assertions (per blog-factcheck)
  - Plan: find Tier 1-3 sources for each, or remove

§ Section 3 (lines 95-150)
  - Issue: paragraphs > 150 words (lines 102, 134)
  - Plan: split each into 2-3 paragraphs of 40-80 words

§ Conclusion (lines 200-220)
  - Issue: doesn't restate the thesis
  - Plan: add a 60-word citation capsule that names what was
    demonstrated and what remains open
```

**Wait for explicit operator approval before proceeding to Phase 3.**

This gate is the single most important rule in the workflow. Skipping
it produces rewrites that diverge from operator intent — and rewrites
are by definition destructive of the existing doc's voice.

### Phase 3 — Research (when claims need sources)

For any unsourced claim flagged by `blog-factcheck`:

1. Search for a Tier 1-3 source supporting the claim. Use the tier
   ladder in `.rules/docs-rubric.md`:
   - Tier 1: RFCs, language/runtime specs, official vendor docs,
     peer-reviewed papers
   - Tier 2: Established benchmarks (SWE-bench, HumanEval), NIST
     publications, named-engineer first-hand post-mortems
   - Tier 3: Quality engineering trade press (LWN, ACM Queue, USENIX),
     well-maintained open-source READMEs
2. If no Tier 1-3 source exists, either:
   - Remove the claim, OR
   - Reframe as `[ORIGINAL DATA]` / `[PERSONAL EXPERIENCE]` /
     `[UNIQUE INSIGHT]` (only when genuinely first-hand)
3. Wrap any fetched external content per
   `.rules/untrusted-input.md` fence convention before quoting.

### Phase 4 — Rewrite (apply changes in declared order)

Apply changes in the exact order from the plan. Per the rubric, prefer
these patterns:

- **Answer-first H2s** — every H2's opening paragraph (40-60 words)
  names what the section delivers and includes one concrete claim
  with evidence.
- **Citation capsules** — 40-60 word self-contained passages per
  section. Each is independently quotable; if you can't quote it
  alone, the section's structure is wrong.
- **Info-gain markers** — flag genuinely first-hand value with
  `[ORIGINAL DATA]` / `[PERSONAL EXPERIENCE]` / `[UNIQUE INSIGHT]`.
  Don't apply these to synthesis of public knowledge — they're
  reserved for what's not findable elsewhere.
- **Paragraph + sentence discipline** — paragraphs 40-80 words (hard
  ceiling 150); sentences 15-22 words; ≤ 25% over 25.
- **H2 cadence** — an H2 every 200-400 words.

### Phase 5 — Validate (re-call docs-review)

Run `docs-review` again on the rewritten file. Compare:

- New score vs. baseline
- Top-10 issues vs. baseline issues (which were resolved?)
- Any newly-introduced issues (regressions)

**Reject the rewrite if the new score is lower than the baseline.**
This is non-negotiable: if the rewrite made the doc worse by the
rubric, revert and re-plan. The validate gate is the rubric's purpose.

Output:

```text
# Rewrite complete: <file>

Score: 71 → 87 (+16) ✅

Issues resolved (from baseline top-10):
  - thesis is hedged → resolved (line 3)
  - 2 unsourced assertions → resolved (added Tier 1-2 citations)
  - § 3 paragraph > 150 words → resolved (split into 3)

Issues newly introduced: none.

Three new top issues (post-rewrite):
  1. [Medium] line 142 — H2 cadence: 480 words between §3.2 and §3.3
  2. [Low] line 88 — Year missing on Linux kernel cite
  3. [Low] line 219 — Conclusion could include one info-gain marker
```

## What this skill does NOT do

- **Re-implement scoring.** Calls `docs-review`. Always.
- **Skip the plan-mode gate.** Even when the operator says "just
  rewrite it" — present the plan first; an operator who wants to skip
  can approve in one line.
- **Greenfield doc creation.** That's `documentation-management`'s
  outline + write workflow. This skill improves _existing_ docs.
- **Multi-doc batch rewrites** in one invocation. Handle one doc per
  invocation; batch is a separate workflow if it earns its keep.
- **Edit code or comments.** Code changes go through
  `code-simplification` or other code-focused skills.
- **Override `docs-review`'s reject.** If validate says the score
  regressed, revert. Don't reason around it.

## See also

- `skills/docs-review` — the read-only audit counterpart this skill
  calls
- `.rules/docs-rubric.md` — the canonical rubric
- `.rules/untrusted-input.md` — fence convention for any external
  content quoted into the doc
- `skills/documentation-management` — operating manual for doc work
