# Documentation Quality Rubric

<!-- CANONICAL SOURCE: epic #2458 (claude-blog absorption); ships via #2459 -->

Quality scorecard for technical docs (RFCs, ADRs, README, CLAUDE.md, architecture
docs, blog-style technical posts). Auto-loaded by `docs-review` and
`docs-rewrite`; cited by `documentation-management` and `self-critique`.

Adapted from
[`AgriciDaniel/claude-blog`'s blog-reviewer 5-category 100-point system](https://github.com/AgriciDaniel/claude-blog/blob/main/agents/blog-reviewer.md)
(MIT). Reframed for engineering docs: dropped SEO / schema / image / multilingual
dimensions; added Argument Strength and tightened Audience Fit.

## How to use

1. **Score the doc** against the 5 categories below. Total is 100.
2. For each dimension, treat its tag literally:
   - **`[M]` mechanical** — a script or grep can verify it. Cite the rule that
     fails.
   - **`[J]` judgment** — needs an LLM or human reader. State the criterion +
     the observation, then assign points.
3. **Defer, don't duplicate.** The user-level skills `blog-llm-tells`,
   `blog-factcheck`, `blog-overlap`, `blog-argument-shape`, and the
   `blog-pre-publish` orchestrator already implement most of the prose-quality
   lenses. When a dimension below says _"defer to skill X"_, run the skill and
   quote its findings into the rubric output. Do **not** re-derive thesis
   detection, AI-tell scrubbing, or citation verification inline.
4. **Surface top 10 issues only.** Critical / High / Medium / Low. Anti-bloat:
   reviewers will not act on a 47-item punch list.
5. **Reject if score regresses** when used as a validate gate (e.g. inside
   `docs-rewrite`).

## Categories (100 points)

### 1. Argument Strength — 20 pts

The single highest-leverage dimension for _"making a strong, well thought out
point"_ (the founding ask of this rubric). Scores the case the doc is making,
not the prose around it.

| Dim                                | Pts | Tag   | How to score                                                                                                                                                                          |
| ---------------------------------- | --- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Locatable thesis                   | 4   | `[M]` | First 200 words contain one declarative claim. Grep for question marks in the first paragraph; >1 means the thesis is hedged.                                                         |
| Falsifiable claim (not a bromide)  | 6   | `[J]` | **Defer to `blog-argument-shape`**. Quote its falsifiability verdict; assign 6 if "falsifiable", 3 if "vague but defensible", 0 if "bromide".                                         |
| Evidence inventory supports thesis | 5   | `[J]` | **Defer to `blog-argument-shape`**. The skill inventories citations / code blocks / first-hand observations / counterfactuals; reviewer judges whether they actually back the thesis. |
| Close revisits the thesis          | 3   | `[J]` | Final section restates the claim and (a) what was demonstrated or (b) what remains open. Drift away from the thesis costs points.                                                     |
| One claim per doc                  | 2   | `[J]` | A single doc making three claims earns 0 here. Recommend splitting.                                                                                                                   |

### 2. Source / Evidence — 25 pts

| Dim                             | Pts | Tag   | How to score                                                                                                                                                   |
| ------------------------------- | --- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inline citations on every claim | 5   | `[M]` | Every numeric or factual claim has a `(source, year)` style inline reference. Defer to `blog-factcheck` for verification; this dim is just _presence_.         |
| Citations verified              | 6   | `[J]` | **Defer to `blog-factcheck`**. Quote its punch list. Each verified-cited claim contributes; each unverified or fabricated cite is -1 per occurrence.           |
| Tier 1-3 sources only           | 4   | `[J]` | Apply the tier table below. Tier 4-5 sources cost points.                                                                                                      |
| Year + URL + retrieval date     | 3   | `[M]` | Each external citation includes year in prose, URL with title, and ideally a retrieval date in a Sources block.                                                |
| Code/spec links resolve         | 3   | `[M]` | Every linked file path or spec URL exists. CI-checkable via existing markdown link-check.                                                                      |
| First-hand evidence flagged     | 2   | `[M]` | Use the info-gain markers `[ORIGINAL DATA]` / `[PERSONAL EXPERIENCE]` / `[UNIQUE INSIGHT]` to distinguish first-hand value from synthesis of public knowledge. |
| Counterfactuals named           | 2   | `[J]` | Where the doc takes a position, the strongest opposing case is at least named. Strawmen cost points.                                                           |

**Source tiers (technical-doc adaptation):**

| Tier            | What counts                                                  | Examples                                                                                                        |
| --------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Tier 1          | Authoritative primary sources                                | RFCs, language/runtime specs, official vendor docs (Anthropic, MDN, IETF), .gov standards, peer-reviewed papers |
| Tier 2          | Established benchmarks + first-hand engineering writeups     | SWE-bench, HumanEval, NIST publications, named engineer's first-hand post-mortems with reproducible details     |
| Tier 3          | Quality engineering trade press + maintained projects        | LWN, ACM Queue, USENIX papers, well-maintained open-source READMEs, conference talks                            |
| Tier 4 (avoid)  | Generic listicles, content-mill SEO                          | "Top 10" posts without first-hand detail                                                                        |
| Tier 5 (reject) | Unsourced roundups, AI-generated explainers, affiliate sites | —                                                                                                               |

### 3. Content Quality — 25 pts

| Dim                              | Pts | Tag   | How to score                                                                                                                                                                                                                  |
| -------------------------------- | --- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Answer-first H2s                 | 5   | `[M]` | Each H2's opening paragraph (40-60 words) names what the section delivers + at least one concrete claim with evidence. The `blog-pre-publish` orchestrator will catch the AI-tells; this dim measures _structure_, not voice. |
| Sentence discipline              | 4   | `[M]` | Average sentence length 15-22 words; ≤25% of sentences exceed 25 words.                                                                                                                                                       |
| Paragraph discipline             | 4   | `[M]` | Paragraphs 40-100 words; hard ceiling 150.                                                                                                                                                                                    |
| H2 cadence                       | 3   | `[M]` | An H2 every 200-400 words. Long stretches without an H2 cost points.                                                                                                                                                          |
| AI-tell scan clean               | 4   | `[J]` | **Defer to `blog-llm-tells`**. Quote its findings. Each Critical or High AI-tell costs -1 to a floor of 0.                                                                                                                    |
| Glossary / first-use definitions | 2   | `[M]` | Acronyms expanded on first use. Internal terms (e.g., "the catfish role") link to their definition.                                                                                                                           |
| No unsupported assertion         | 3   | `[J]` | Every "X is faster than Y" / "most teams do Z" claim has either a citation or an `[ORIGINAL DATA]` marker.                                                                                                                    |

### 4. Structure — 20 pts

This is the _technical-doc-specific_ category — the part that has no analog in
the upstream blog rubric.

| Dim                          | Pts | Tag   | How to score                                                                                                                                                                                      |
| ---------------------------- | --- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Heading hierarchy            | 3   | `[M]` | Exactly one H1; no skips (H2→H4); no H6+.                                                                                                                                                         |
| Code blocks valid            | 3   | `[M]` | Fenced with language tag; syntax parses; no truncated examples.                                                                                                                                   |
| Cross-doc consistency        | 4   | `[J]` | Doesn't contradict canonical paths in CLAUDE.md or `.rules/governance.md`. **Defer to `blog-overlap`** if there's an existing doc on the same topic — refine vs. duplicate.                       |
| Internal links resolve       | 2   | `[M]` | All `./other-doc.md` and `#anchor` references work.                                                                                                                                               |
| Summary box / TL;DR          | 2   | `[J]` | Long docs (>800 words) have a `Key Takeaways` block in the first screen.                                                                                                                          |
| Frontmatter on tier-1/2 docs | 1   | `[M]` | If listed in `FRONTMATTER_REQUIRED_FILES` (in `scripts/generate-docs.ts`), validate that `title` / `description` / `tier` / `keywords` are present. Don't reinvent — call the existing `--check`. |
| Spec / RFC alignment         | 3   | `[J]` | Where the doc cites Anthropic API behavior, governance rules, or RFC fields, the cited fields exist as described.                                                                                 |
| File size + sprawl           | 2   | `[J]` | Per CLAUDE.md anti-sprawl: doesn't create a parallel `enhanced_*` / `v2_*` doc when an existing canonical doc could be extended.                                                                  |

### 5. Audience Fit — 10 pts

| Dim                             | Pts | Tag   | How to score                                                                                                                                                           |
| ------------------------------- | --- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persona-appropriate readability | 4   | `[M]` | Target Flesch reading-ease band per audience. **Advisory, not pass/fail** — the contrarian voter's concern about subjective readability scores being unstable is real. |
| Reader's prior knowledge stated | 3   | `[J]` | First paragraph says what the reader needs to already know. "Assumes familiarity with X" is a feature.                                                                 |
| Length matches purpose          | 2   | `[J]` | A README isn't a 4000-word essay; a post-mortem isn't 200 words.                                                                                                       |
| Examples for the audience       | 1   | `[J]` | At least one worked example calibrated to the stated audience.                                                                                                         |

**Persona-based readability bands (advisory):**

| Audience                                    | Flesch Reading Ease | Notes                                           |
| ------------------------------------------- | ------------------- | ----------------------------------------------- |
| Operator-facing CLI docs / first-run README | 60-80               | Wide audience, low prior context                |
| Engineer-facing how-to / tutorial           | 50-60               | Day-job knowledge assumed                       |
| Architecture docs / RFCs / ADRs             | 30-50               | Specialist audience; precision over readability |
| CLAUDE.md-style governance                  | 40-60               | Read by both humans and other agents            |

A doc scoring outside its band loses 1 point per band-step away. Anything more
aggressive than that produces too many false positives — the contrarian was
right that hard-coded readability bands are unstable.

## How to invoke as a validate gate

`docs-rewrite` runs the rubric BEFORE editing (capture baseline) and AFTER
editing (capture delta). If the delta is negative, the rewrite is rejected
with the specific dimensions that regressed. This is the literal inverse of
the contrarian voter's concern about subjective scoring instability: the
delta on a single doc with the same scorer in the same session is stable,
even when absolute scores aren't comparable across docs.

## Cross-references

- `blog-pre-publish` (user-level) — orchestrates blog-overlap + blog-factcheck +
  blog-llm-tells + blog-argument-shape. Run this BEFORE the rubric for any doc
  that's substantially prose; the rubric's prose dimensions defer to its output.
- `blog-argument-shape` (user-level) — thesis / falsifiability / evidence
  inventory. Required for category 1.
- `blog-llm-tells` (user-level) — AI-tell scrubbing. Required for cat 3.
- `blog-factcheck` (user-level) — citation verification. Required for cat 2.
- `blog-overlap` (user-level) — refinement-vs-duplicate detection. Required for
  cat 4 cross-doc consistency.
- `documentation-management` (project) — the operating manual for doc work
  in nexus-agents; this rubric is one of the artifacts it consults.
- `self-critique` (project) — pre-emit 5-dim scoring. Cite this rubric for the
  prose-quality dimensions; don't re-derive the same checks.

## What this rubric explicitly does NOT cover

- SEO scoring, schema markup, JSON-LD — this is a code-governance project.
- Image / chart / audio generation.
- Localization, translation, multilingual publishing.
- Editorial calendars, content cannibalization detection (covered by
  `blog-overlap` for the blog use case).
- Funnel / conversion / BOFU analysis.
