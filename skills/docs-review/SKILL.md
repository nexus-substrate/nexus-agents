---
name: docs-review
description: |
  Score a technical doc (RFC, ADR, README, CLAUDE.md, blog-style post)
  against the 5-category 100-point rubric in .rules/docs-rubric.md.
  Read-only audit. Surfaces top issues by severity. Defers to existing
  user-level skills (blog-llm-tells, blog-factcheck, blog-overlap,
  blog-argument-shape, blog-pre-publish) for prose-quality dimensions
  rather than re-deriving them. Use when the user says "review docs",
  "audit docs", "score this doc", "doc quality", "docs review".
allowed-tools: Read, Grep, Glob, Bash
---

# Docs Review Skill

<!--
  CANONICAL SOURCES:
  - .rules/docs-rubric.md  ← the rubric this skill applies
  - skills/docs-rewrite (active rewrite counterpart; coming next)
  - skills/documentation-management (operating manual)

  User-level skills this skill DEFERS to (does not duplicate):
  - blog-pre-publish — orchestrator running blog-overlap + blog-factcheck
    + blog-llm-tells + blog-argument-shape + blog-nda-check
  - blog-argument-shape — thesis / falsifiability / evidence inventory
  - blog-llm-tells — AI-tell scrubbing
  - blog-factcheck — citation verification
  - blog-overlap — refinement-vs-duplicate detection

  Anti-sprawl: this skill is the *technical-doc-flavoured* read-only
  audit. The user-level blog-* skills already do the prose-quality
  lenses; this skill calls them and adds the technical-doc-specific
  dimensions (heading hierarchy, code-block validity, cross-doc
  consistency, spec/RFC alignment, frontmatter, anti-sprawl).
-->

## When to apply

Use when scoring an existing technical doc — RFC, ADR, README,
CLAUDE.md, architecture doc, blog-style technical post. Read-only;
produces a punch list, not a rewrite. The active counterpart is
`docs-rewrite` which runs review → research → rewrite → validate.

Trigger keywords: review docs · audit docs · score this doc · doc
quality · docs review · doc audit.

## Inputs

- A single file path, OR
- A URL the operator wants reviewed (fetched + reviewed in-place), OR
- A directory (batch mode — score every doc, sort by score)

## Workflow

### Step 1 — Read the doc + extract structural facts

Mechanical extraction (no judgment yet):

- Heading structure (H1 / H2 / H3 with hierarchy)
- Paragraph count + word counts per paragraph
- Sentence-length distribution (for burstiness analysis below)
- Citations present (any inline `(source, year)` form)
- Info-gain markers (`[ORIGINAL DATA]` / `[PERSONAL EXPERIENCE]` /
  `[UNIQUE INSIGHT]`)
- Code blocks with language tag
- Internal `./other-doc.md` and `#anchor` references
- Frontmatter (title / description / tier / keywords)

Cite the file paths + line numbers wherever you observe a problem.

### Step 2 — Run the deferred-to user-level skills

The rubric **defers** the prose-quality lenses to existing user-level
skills. Run them and quote their findings into the score, **don't
re-derive them inline**:

| Rubric category                             | Defer to                         | Quote                                         |
| ------------------------------------------- | -------------------------------- | --------------------------------------------- |
| Argument Strength § thesis + falsifiability | `blog-argument-shape`            | "Thesis: <quote>. Falsifiability: <verdict>." |
| Source / Evidence § citations verified      | `blog-factcheck`                 | The skill's punch list, as-is.                |
| Content Quality § AI-tell scan              | `blog-llm-tells`                 | The skill's findings, as-is.                  |
| Structure § cross-doc consistency           | `blog-overlap` (when applicable) | STRONG / MODERATE / WEAK                      |

If `blog-pre-publish` is available, run it as a single invocation —
that's the orchestrator that bundles the four. Quote its consolidated
punch list.

### Step 3 — Score the technical-doc-specific dimensions

These have no analog in the user-level skills; this is where
`docs-review` adds value:

**Argument Strength (20 pts) — partial:** "Locatable thesis" `[M]` +
"Close revisits the thesis" `[J]` + "One claim per doc" `[J]` are
scored here even though the deeper lenses defer. (4 + 3 + 2 = 9 pts of
the 20 from the skill alone; the remaining 11 come from
`blog-argument-shape`.)

**Source / Evidence (25 pts) — partial:** "Inline citations on every
claim" `[M]`, "Year + URL + retrieval date" `[M]`, "Code/spec links
resolve" `[M]`, "First-hand evidence flagged" `[M]` are mechanical
checks (12 pts). The remaining 13 come from `blog-factcheck` + tier
verification (manual judgment).

**Content Quality (25 pts) — partial:** "Answer-first H2s" `[M]`,
"Sentence discipline" `[M]`, "Paragraph discipline" `[M]`, "H2
cadence" `[M]`, "Glossary / first-use definitions" `[M]` (18 pts) are
mechanical. AI-tell scan defers to `blog-llm-tells` (4 pts). "No
unsupported assertion" is judgment (3 pts).

**Structure (20 pts) — fully scored here:** heading hierarchy, code
blocks valid, internal links resolve, summary box / TL;DR,
frontmatter on tier-1/2 docs (per CLAUDE.md `FRONTMATTER_REQUIRED_FILES`
gate), spec/RFC alignment, file-size + sprawl. Cross-doc consistency
defers to `blog-overlap`.

**Audience Fit (10 pts) — fully scored here:** persona-appropriate
readability band (advisory), reader's prior knowledge stated, length
matches purpose, examples for the audience.

### Step 4 — Surface top 10 issues

Don't dump every observation. Bin into Critical / High / Medium / Low
and surface only the top 10. Reviewers won't act on a 47-item punch
list.

For each issue, output:

- **Severity:** Critical / High / Medium / Low
- **File:line** (or section)
- **Category:** Argument / Source / Content / Structure / Audience
- **Observation:** what's wrong (mechanical: cite the rule; judgment:
  state the criterion)
- **Recommendation:** what to do

### Step 5 — Output the score

```text
# Docs Review: <filename>

**Score: 78 / 100** (prior baseline: 71 / 100; +7)

| Category          | Score   | Top issues |
| ----------------- | ------- | ---------- |
| Argument Strength | 16 / 20 | thesis is hedged (first paragraph has 3 questions) |
| Source / Evidence | 19 / 25 | 2 unverified citations (per blog-factcheck) |
| Content Quality   | 21 / 25 | passive voice 14% (target ≤ 10%) |
| Structure         | 15 / 20 | code-block in §3.2 missing language tag |
| Audience Fit      |  7 / 10 | Flesch 22 (band 30-50 for technical docs) — too dense |

## Top 10 issues
1. [Critical] file.md:42 — Argument: thesis is buried under 3 hedging questions.
   Recommend: hoist a single declarative claim to the first paragraph.
2. [High] file.md:128 — Source: "studies show 80% improvement" has no citation.
   Recommend: add (source, year) or remove the claim.
... (8 more)
```

## What this skill does NOT do

- **Edit the file.** Read-only by design. For active rewrite, use
  `docs-rewrite`.
- **Re-implement AI-tell detection / fact-checking / argument-shape
  analysis.** Those defer to user-level skills.
- **SEO scoring / schema validation.** Out of scope for code-governance
  docs; rubric explicitly excludes.
- **Score every dimension equally.** Argument Strength weights 20%;
  Source/Evidence 25%; Structure (the technical-doc-specific category)
  20%. Don't dilute by treating all dimensions identically.

## See also

- `.rules/docs-rubric.md` — the canonical rubric this skill applies
- `skills/docs-rewrite` — the active rewrite counterpart (uses the
  same rubric for audit + validate)
- `skills/documentation-management` — operating manual for doc work
- User-level `blog-pre-publish` — orchestrator for the prose-quality
  lenses
