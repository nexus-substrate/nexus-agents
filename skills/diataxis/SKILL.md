---
name: diataxis
description: |
  Classify, audit, restructure or generate a docs page by Diátaxis type
  (tutorial, how-to, reference, explanation). Every verdict carries a type,
  a confidence and quoted evidence. Owns the `diataxis:` / `audience:`
  frontmatter contract that scripts/check-diataxis-frontmatter.ts enforces.
  Restructure moves content and never deletes it. Use when the user says
  "diataxis", "classify this doc", "what kind of doc is this", "doc type",
  "split this doc", "restructure docs", "is this a tutorial".
allowed-tools: Read, Edit, Write, Bash, Grep, Glob, WebFetch
---

# Diátaxis Skill

<!--
  CANONICAL SOURCES:
  - https://diataxis.fr/  ← the framework. Link to its pages; do not copy
    its text (CC BY-SA 4.0).
  - docs/ops/diataxis-none-kinds.json  ← the ONE list of page kinds that may
    declare `diataxis: none`
  - scripts/check-diataxis-frontmatter.ts  ← the gate for the contract below
  - .rules/docs-rubric.md  ← quality scoring; this skill does not score
-->

Diátaxis sorts documentation by what the reader is doing at the moment they
open the page. A page that serves one need does it well. A page that serves two
usually does both badly, because the two needs ask for opposite writing. This
skill says which need a page serves, finds the passages that serve a different
one, and moves those passages to where they belong.

It does not score quality. Quality is the 100-point rubric in
`.rules/docs-rubric.md`, applied by `docs-review`.

## The compass

Two questions place any page, or any single sentence
([diataxis.fr/compass](https://diataxis.fr/compass/)):

1. Does it guide **action** (doing) or inform **cognition** (knowing)?
2. Does it serve **acquisition** (learning the skill) or **application**
   (using a skill the reader already has at work)?

|               | Acquisition (learning) | Application (working) |
| ------------- | ---------------------- | --------------------- |
| **Action**    | tutorial               | how-to                |
| **Cognition** | explanation            | reference             |

Apply the questions sentence by sentence, not only page by page. A how-to that
stops to explain a design choice has a sentence of explanation inside it. Each
such sentence counts as evidence in a verdict.

## The frontmatter contract

Every page under `docs/` (except the generated `docs/api/`) declares:

```yaml
---
diataxis: how-to # tutorial | how-to | reference | explanation | none
audience: user # user | project
---
```

- **One scalar value per key.** A list, an empty key or an unknown value fails.
  If a page needs two values, it is two pages: restructure it.
- **`none`** is allowed only on the page kinds named in
  `docs/ops/diataxis-none-kinds.json`: index and landing pages, ADRs,
  changelogs, research notes and archive. Do not add a kind to get one page past
  the gate. Change that file only when a whole class of pages is not
  reader-facing documentation.
- **`audience: user`** means someone using nexus-agents. **`audience: project`**
  means someone working on nexus-agents itself: maintainers, contributors, and
  the agents that work on this repo.
- **Declared beats inferred.** A declared type is what the author says the page
  should be. A classify verdict is what the page is now. When they disagree,
  report the disagreement. Do not silently rewrite the declaration to match the
  content, because the content may be what is wrong.

The gate is a ratchet. The count of pages missing either key may not grow past
`docs/ops/diataxis-frontmatter-baseline.json`. When a PR lowers the count, run
`pnpm exec tsx scripts/check-diataxis-frontmatter.ts --update-baseline` so the
gain sticks. Zero pages scanned is a failure reported as `unmeasured`, not a
pass.

## Modes

Pick one mode per request. Each mode builds on the one before it.

### classify (read-only)

Return one verdict per page:

```yaml
path: docs/guides/SETUP.md
declared: how-to # or "missing"
type: tutorial # what the content is now
confidence: medium # high | medium | low
evidence:
  - line: 12
    quote: "In this lesson you'll build your first pipeline"
    signal: acquisition + action
  - line: 40
    quote: 'Run `pnpm install`, then check that the output matches below'
    signal: guided steps with expected output
```

- **Quoted evidence is required.** Quote the line. Do not summarize it. A
  verdict without a quote is an opinion, and a reviewer cannot check it.
- **Confidence** is `high` when nearly every quoted signal points one way,
  `medium` when one type dominates but others appear, and `low` when the page
  splits or is too short to tell. Low confidence is a valid answer. Do not round
  it up.

### audit (read-only)

Classify the page, then walk the checklist for its declared type, or its
inferred type if it declares none. Report each mixed-mode passage as
`{line range, foreign type, quote}`. Report frontmatter errors from the gate as
they are. The output is a finding list. Make no edits.

### restructure (edits)

Move each mixed-mode passage to a page of the right type, then link back to it
from the old location.

- **Move, never delete.** Every sentence that leaves a page arrives somewhere
  else. If no destination page exists yet, write the passage into a new page of
  the right type. Do not drop it because it was misplaced. A diff that removes
  more lines than it adds elsewhere needs a stated reason for each removed
  line.
- **No empty scaffolding.** Do not create blank `tutorials/`, `how-to/`,
  `reference/` and `explanation/` sections in advance. A page or section exists
  once there is content for it
  ([diataxis.fr/how-to-use-diataxis](https://diataxis.fr/how-to-use-diataxis/)).
- **Grow incrementally.** Make one page or one move per change, ship it, then
  pick the next one. Do not plan a whole-tree reorganization and land it at
  once.
- Set `diataxis:` and `audience:` on every page you touch.

### generate (writes)

Write a new page of one declared type. Set the frontmatter first, write to that
type's checklist, and link to the other types rather than absorbing them.
Classify the result before handing it back. If the verdict differs from the
declared type, the page is not done.

## Checklists per type

Each list is what the type needs and what it must not contain. Each list links
to the diataxis.fr page that explains the type in depth.

### Tutorial: learning by doing ([diataxis.fr/tutorials](https://diataxis.fr/tutorials/))

- [ ] The author owns the reader's success. The steps work as written on a
      clean setup, and someone has run them.
- [ ] The reader gets a visible result early, and again after most steps.
- [ ] Expected output is shown, so the reader can tell they are on track.
      Likely mistakes and their symptoms are named.
- [ ] There is one path. No "alternatively", no option menus.
- [ ] Explanation is a sentence at most, plus a link. The reader learns by
      doing it, not by reading about it.
- [ ] Each step is concrete. The general pattern shows up in the reader's
      results, not in the prose.

### How-to guide: getting a task done ([diataxis.fr/how-to-guides](https://diataxis.fr/how-to-guides/))

- [ ] The title names the goal: "How to rotate the signing key", not
      "Signing keys".
- [ ] It assumes a competent reader who already knows what they want.
- [ ] Steps follow the order the work happens in. Real-world branches
      ("if you use npm instead…") are fine when they serve the goal.
- [ ] No teaching and no background. Link to the explanation page.
- [ ] Option tables are not copied in. Link to the reference page.

### Reference: looking something up ([diataxis.fr/reference](https://diataxis.fr/reference/))

- [ ] It describes and nothing else: no instructions, no opinion, no history.
- [ ] Its structure follows the structure of the thing it describes (one
      section per command, tool, env var or schema field).
- [ ] Entries use the same format, so a reader can scan them.
- [ ] Examples show usage briefly without becoming a procedure.
- [ ] It is accurate and complete for what it covers. If it can be generated
      from code, it is, and the page says so.

### Explanation: understanding why ([diataxis.fr/explanation](https://diataxis.fr/explanation/))

- [ ] It talks about a bounded topic. "About the audit hash chain" is a good
      title shape.
- [ ] It gives context: the design decisions, constraints, history and
      trade-offs.
- [ ] It connects the topic to neighbouring topics.
- [ ] It is allowed a point of view and weighs alternatives.
- [ ] Instructions and specs appear only as links.

## Mixed-mode anti-patterns

These are the patterns an audit reports most often. Each one names the passage
type that crept in and where it should go.

| Pattern                                            | Foreign content | Move it to                     |
| -------------------------------------------------- | --------------- | ------------------------------ |
| A tutorial step stops for a design digression      | explanation     | an explanation page, then link |
| A how-to opens with "background" sections          | explanation     | an explanation page            |
| A how-to pastes the full option or flag table      | reference       | the reference page             |
| A reference entry says "first, do X; then Y"       | how-to          | a how-to guide                 |
| A reference page argues why the design is good     | explanation     | an explanation page            |
| An explanation ends with a step-by-step procedure  | how-to          | a how-to guide                 |
| A "getting started" page offers five install paths | how-to options  | one tutorial path + a how-to   |
| A README tries to be all four                      | everything      | a landing page that links      |

## How this repo's doc skills use it

- **`docs-review`**: the audit dimension. It runs `diataxis` in audit mode
  alongside the rubric, and reports a mixed-mode passage or a declared/inferred
  mismatch as a Structure finding. The rubric weights stay in
  `.rules/docs-rubric.md`.
- **`docs-rewrite`**: restructure mode. When the audit finds a mixed-mode
  passage, the rewrite plan lists each move (from, to, link-back) before any
  edit. Move-never-delete applies inside its Phase 4.
- **`documentation-management`**: the "declare frontmatter" step for every new
  or touched page, and the `Diátaxis Frontmatter` job in `docs-check.yml`.

## What this skill does NOT do

- **Score quality.** That is `.rules/docs-rubric.md` via `docs-review`.
- **Classify the whole tree in one pass.** Bulk classification is #7198. Do it
  incrementally, as described above.
- **Edit `docs/api/`.** That tree is generated. Fix its source instead.

## Credits

Diátaxis is Daniele Procida's framework, published at
[diataxis.fr](https://diataxis.fr/) under CC BY-SA 4.0. This file links to it
and is written in its own words. Two ideas come from other agent skills; their
text is not reused:

- [keithpatton/diataxis-agent-skill](https://github.com/keithpatton/diataxis-agent-skill):
  separate modes, and verdicts that carry evidence.
- [canonical/copilot-collections](https://github.com/canonical/copilot-collections)
  (`documentation-diataxis`): keep the declared type and the inferred type
  apart, and report when they differ.
