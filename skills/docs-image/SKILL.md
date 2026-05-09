---
name: docs-image
description: |
  Generate AI illustrations (hero, cover, conceptual, infographic) for
  nexus-agents docs via the nanobanana-mcp gateway. Use when the user
  needs a hero image, README cover, or conceptual illustration. NOT for
  precise architecture diagrams — those redirect to docs-mermaid. NOT
  for quantitative charts — those redirect to docs-chart. Triggers on
  "generate image", "blog image", "hero image", "cover image",
  "illustration".
allowed-tools: Read, Edit, Write, Bash, Grep, Glob
---

# AI Illustrations Skill

<!--
  CANONICAL SOURCES:
  - skills/docs-mermaid (precise component / sequence / state — for "show how X works")
  - skills/docs-chart   (quantitative SVG — for "compare these numbers")
  - skills/documentation-management (operating manual)

  Adapted from AgriciDaniel/claude-blog skills/blog-image (MIT, 694⭐)
  via nanobanana-mcp. Reframed for nexus-agents: dropped Product +
  Landscape modes (irrelevant for code project), defaulted to
  Infographic, added Mermaid-first guardrail in step 1.
-->

## When to apply

Use AI image generation in **three specific cases**:

1. **Hero / cover images** — README header, blog post cover, major
   architecture doc landing image
2. **Conceptual illustrations** — abstract / editorial mode for
   "what consensus voting feels like" — illustrative, not load-bearing
3. **Infographic-mode visualizations** — shape of an approach, layered
   process flows where "approximate shape" beats "exact byte path"

For everything else, redirect.

## Step 1 (CRITICAL) — Mermaid-first check

Before generating, ask: _"Is this a 'show how X works' question with
precise components / sequence / state?"_

If YES → recommend `docs-mermaid`. State the rule of thumb:
_"Mermaid wins for precise diagrams: it's text-based, diff-able, and
renders accurately. AI images are wrong for this — they look right
until you check the details."_

If NO and the request is genuinely illustrative ("show me what
consensus feels like", "hero for the README"), proceed to step 2.

This guardrail is the highest-priority rule in the skill. Skipping it
produces architecture diagrams that look plausible but are wrong in
detail.

## Step 2 — Select domain mode

| Mode                      | When to use                                      | Prompt emphasis                                |
| ------------------------- | ------------------------------------------------ | ---------------------------------------------- |
| **Infographic** (default) | Layered process shape, comparison panels         | Layout structure, hierarchy, accessible colors |
| **Editorial**             | Hero / blog cover with mood                      | Composition, lighting, publication references  |
| **Abstract**              | Pattern background, decorative section divider   | Color theory, mathematical forms, textures     |
| **UI/Web**                | Tech illustration with vector / flat-design feel | Clean lines, exact colors, icon-style          |

Defaulting to **Infographic** is correct for ~80% of nexus-agents use
cases — most requests are about explaining a process, not setting a
mood.

(Product / Landscape modes from upstream are intentionally omitted —
this is a code-governance project, not e-commerce or travel.)

## Step 3 — Construct the 6-component prompt

Build the prompt as a natural narrative paragraph using the
6-component reasoning brief:

1. **Subject** — who/what, with rich physical detail
2. **Action** — what's happening
3. **Context** — environment / setting
4. **Composition** — framing, perspective, focal point
5. **Lighting** — mood, time of day, light source
6. **Style** — visual treatment (Infographic / Editorial / etc.)

Never pass raw user text directly to the API. Always interpret +
enhance.

See `references/prompt-engineering.md` for full per-mode modifier
libraries and worked examples.

## Step 4 — Generate via nanobanana-mcp

```text
Tool: mcp__nanobanana__generate_image
Prompt: <constructed prompt from step 3>
Aspect ratio: 16:9 (hero / OG card) or 4:3 (inline)
Resolution: 1200x630 for OG, 1920x1080 for hero
```

If nanobanana-mcp is not configured:

1. Try calling `get_image_history` (lightweight, no side effects)
2. If it fails: inform the user _"Image generation requires the
   nanobanana-mcp server. See `references/prompt-engineering.md` for
   setup."_
3. When called internally (from a doc generation workflow): return
   silently — the calling workflow continues without the image.

## Operational considerations

- **Costs money per image** (Gemini Imagen pricing ≈ $0.039/image at
  time of writing). Always announce cost-per-call before generating
  more than one image.
- **Regenerate sparingly.** Iterate on the prompt before committing
  budget; one carefully-constructed prompt beats five quick attempts.
- **Save outputs to a documented location.** Hero images in
  `docs/architecture/images/`; blog covers in `<post-dir>/cover.png`.
  Never to `/tmp` or scratch dirs.

## Cross-references — when to redirect

This is the illustrative-images lane. Redirect when the request fits
elsewhere:

- **Sequence / state / flow / class / ER** → `docs-mermaid`
- **Bar / donut / line / lollipop chart** → `docs-chart`
- **Doc structure / placement** → `documentation-management`

When you redirect, state the rule of thumb so the user calibrates for
next time.

## What this skill does NOT do

- **Architecture diagrams.** Mermaid wins on accuracy + diff-ability.
- **Quantitative charts.** SVG wins on precision.
- **Image editing pipelines** beyond what nanobanana-mcp supports
  natively. Defer to next round if needed.
- **Local generation** (Stable Diffusion / etc.). Operator opts into
  Gemini via the MCP server.

## See also

- `references/prompt-engineering.md` — domain-mode modifier library +
  worked examples
- `references/setup-nanobanana.md` — MCP server setup walkthrough (TBD
  — file as a follow-up if operators ask)
