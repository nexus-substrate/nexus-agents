# Prompt Engineering — Domain Mode Modifier Library

Reference for the 6-component prompt structure (Subject + Action +
Context + Composition + Lighting + Style) and per-mode modifier
catalog.

## 6-component reasoning brief

Every prompt is a paragraph (not a keyword list) covering:

1. **Subject** — who/what, with rich physical detail (textures, materials, scale)
2. **Action** — what's happening
3. **Context** — environment / setting / surrounding elements
4. **Composition** — framing (close-up / wide shot), perspective, focal point
5. **Lighting** — mood, time of day, source direction
6. **Style** — visual treatment, references

Bad prompt: `"AI agents communicating in a network, infographic style"`

Good prompt: `"A horizontal layered diagram showing distinct rectangular nodes connected by directional arrows, each node labelled with a clean sans-serif font; the layout reads left-to-right with three tiers stacked vertically; uniform overhead lighting with no harsh shadows; flat-design infographic style with the orange / sky-blue / purple / green palette; transparent background; small caption legend in the lower right"`

## Per-mode modifier libraries

### Infographic (default for nexus-agents)

**When:** layered process shape, comparison panels, flow-of-thinking
visualizations — any time the message is "the structure of an
approach."

Stock modifiers to mix in:

- "horizontal layered diagram"
- "left-to-right reading order"
- "rectangular nodes with rounded corners"
- "directional arrows with clean line weight"
- "flat-design treatment, no gradients"
- "uniform overhead lighting, no harsh shadows"
- "annotation labels in clean sans-serif (Inter, Helvetica)"
- "transparent or pale-grey background"
- "color palette: orange (#f97316) primary / sky-blue (#38bdf8) secondary / purple (#a78bfa) tertiary / green (#22c55e) accent"

Avoid: photorealism, dramatic lighting, ornate decoration, hand-drawn
sketchy lines.

### Editorial

**When:** README hero, blog post cover — any time the message is
_tone_ or _mood_ rather than structure.

Stock modifiers:

- "editorial photography composition"
- "rule-of-thirds framing"
- "shallow depth of field"
- "natural soft lighting from camera-left"
- "muted color palette with one accent"
- "magazine-quality production"
- "negative space at top-right for headline overlay"

### Abstract

**When:** decorative section divider, background pattern, conceptual
illustration without specific subject.

Stock modifiers:

- "abstract geometric composition"
- "fibonacci spiral / golden ratio layout"
- "color theory: complementary palette"
- "subtle gradient transitions"
- "no recognizable objects"
- "wallpaper-style repeat-friendly composition"

### UI/Web

**When:** small icon-style illustration to accompany a feature, hero
panel for a doc section, vector-art treatment.

Stock modifiers:

- "flat vector illustration"
- "isometric perspective at 30 degrees"
- "icon-style with simplified silhouettes"
- "exact-match color palette (orange / sky / purple / green)"
- "consistent line weight 2px"
- "no anti-aliasing artifacts"
- "transparent background"

## Worked examples

### Example 1 — Infographic for "How consensus voting works"

```
A horizontal three-tier infographic reading left-to-right, with the
first tier showing a single rectangular node labelled "Proposal" in
clean sans-serif; the middle tier showing four uniformly-sized nodes
labelled "Architect", "Security", "DevEx", "Scope Steward" connected
to the proposal by directional arrows; the right tier showing a single
larger node labelled "Outcome (approved / rejected / quorum failed)";
all nodes have rounded corners and use orange (#f97316) for the
proposal, sky-blue (#38bdf8) for voters, and purple (#a78bfa) for the
outcome; uniform overhead lighting with no harsh shadows; flat-design
treatment; transparent background; small "Source: nexus-agents
consensus engine" caption in the lower-right at 35% opacity.
```

### Example 2 — Editorial hero for the README

```
An editorial photograph of an open laptop on a clean wood desk in soft
morning light from camera-left; the laptop screen displays an abstract
flowing pattern in orange and sky-blue that suggests connectivity
without showing specific UI; the desk has a single small green
houseplant in the upper-right corner of the frame; rule-of-thirds
composition with negative space across the top half for headline
overlay; shallow depth of field with the laptop sharp and the desk
edges softly blurred; muted natural color palette with the screen's
orange as the only accent; magazine-quality production.
```

### Example 3 — Abstract section divider

```
An abstract geometric composition of overlapping translucent
rectangles in orange (#f97316), sky-blue (#38bdf8), purple (#a78bfa),
and green (#22c55e), arranged in a fibonacci-spiral layout; subtle
gradient transitions between adjacent rectangles where they overlap;
no specific subject, no objects, no people; uniform soft lighting; the
composition is wallpaper-friendly and reads cleanly when tiled
horizontally; aspect ratio 8:1 for use as a section divider; 1200px
wide; transparent background where rectangles aren't covering it.
```

## Setup walkthrough — nanobanana-mcp

Operators who want to use `docs-image` need the nanobanana-mcp server
configured. Quick steps:

```bash
# 1. Install
npm install -g @ycse/nanobanana-mcp

# 2. Get a Gemini API key
# https://aistudio.google.com/apikey

# 3. Add to your MCP config (~/.config/claude/claude_desktop_config.json
#    or whatever your harness uses):
{
  "mcpServers": {
    "nanobanana": {
      "command": "nanobanana-mcp",
      "env": { "GEMINI_API_KEY": "..." }
    }
  }
}

# 4. Restart your harness; nanobanana-mcp tools should appear.
```

Cost reminder: ≈ $0.039/image at time of writing. Per-call announce
your cost estimate before generating multiple images.

## Anti-patterns

- **Defaulting to Editorial mode** when the request is about process
  structure. That's Infographic.
- **Skipping step 1 (Mermaid-first check).** Generating an architecture
  diagram by AI produces something that looks plausible but is wrong
  in detail. Use Mermaid.
- **Passing raw user text to the API.** Always construct the
  6-component prompt; never just forward "make me an image of X".
- **Burning budget on iterations** before fixing the prompt. Read the
  failure mode of the last output, adjust the prompt, then retry. Two
  good prompts beat ten quick ones.
- **Saving to scratch directories.** Outputs go in
  `docs/architecture/images/`, `<post-dir>/cover.png`, etc. — places
  the doc references can find them.
