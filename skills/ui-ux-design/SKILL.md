---
name: ui-ux-design
description: |
  Generate design systems and implement UX/UI for software products using
  Astro, Svelte, Tailwind CSS, Material Design 3, and OKLCH color system.
  Covers style selection, color palettes, typography, layout patterns,
  accessibility, and frontend code generation. Triggers on "design system",
  "UI design", "color palette", "typography", "landing page design",
  "dashboard design", "style guide", "component design", "frontend".
allowed-tools: Read, Grep, Glob, WebSearch, Task, Edit, Write, Bash
context: fork
---

# UI/UX Front-End Engineer Skill

<!-- CANONICAL SOURCES:
  - CLAUDE.md Canonical Paths
  - Epic #946 (UI UX Pro Max Integration)
  - Issue #1539 (Frontend engineering capabilities)
  - Methodology adapted from github.com/nextlevelbuilder/ui-ux-pro-max-skill
-->

## Target Stack

- **SSG**: Astro (zero-JS default, Svelte islands for interactivity)
- **Components**: Svelte with TypeScript
- **Styling**: Tailwind CSS with OKLCH color functions
- **Design System**: Material Design 3 (M3)
- **Color Space**: OKLCH (perceptually uniform)

## Architectural Directives

### Astro + Svelte Islands

- **Zero-JS by Default**: Use `.astro` for static content, routing, layouts
- **Svelte Islands**: Use `.svelte` ONLY for interactive components
- **Hydration directives** (pick the lightest that works):
  - `client:load` — critical interactivity (navigation, forms)
  - `client:idle` — deferred (analytics, non-critical widgets)
  - `client:visible` — lazy (below-fold interactive content)
- **State**: Svelte `$stores` + nano-stores for cross-island state

### Component Structure

```
src/
  layouts/         # Astro layouts (BaseLayout.astro, etc.)
  pages/           # Astro pages (file-based routing)
  components/
    astro/         # Static Astro components
    svelte/        # Interactive Svelte islands
  styles/
    tokens.css     # M3 design tokens (OKLCH custom properties)
    global.css     # Base styles, resets
  lib/
    stores/        # Svelte/nano-stores for shared state
```

## Color System: OKLCH

**NEVER use hex, rgb, or hsl.** All colors MUST use `oklch()`.

### OKLCH Reference

```
oklch(L C H)
L = lightness (0 = black, 1 = white)
C = chroma (0 = gray, ~0.4 = max saturation)
H = hue angle (0-360)
```

### Tailwind Integration

```css
/* tokens.css */
:root {
  --color-primary: 0.55 0.2 250; /* oklch components */
  --color-on-primary: 1 0 0;
  --color-primary-container: 0.85 0.08 250;
  --color-on-primary-container: 0.2 0.1 250;
  --color-surface: 0.98 0.005 250;
  --color-on-surface: 0.15 0.02 250;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-primary: 0.78 0.15 250;
    --color-surface: 0.15 0.01 250;
    --color-on-surface: 0.9 0.01 250;
  }
}
```

```js
// tailwind.config.mjs
export default {
  theme: {
    extend: {
      colors: {
        primary: 'oklch(var(--color-primary) / <alpha-value>)',
        'on-primary': 'oklch(var(--color-on-primary) / <alpha-value>)',
        'primary-container': 'oklch(var(--color-primary-container) / <alpha-value>)',
        surface: 'oklch(var(--color-surface) / <alpha-value>)',
        'on-surface': 'oklch(var(--color-on-surface) / <alpha-value>)',
      },
    },
  },
};
```

### M3 Tonal Palettes

Generate by varying L while keeping H constant:

| Token                | L    | C    | H   |
| -------------------- | ---- | ---- | --- |
| primary              | 0.55 | 0.20 | 250 |
| on-primary           | 1.00 | 0    | 0   |
| primary-container    | 0.85 | 0.08 | 250 |
| on-primary-container | 0.20 | 0.10 | 250 |

### WCAG AA Contrast

Ensure sufficient L-channel delta between text and background:

- **Normal text** (4.5:1): `|L_text - L_bg| >= 0.45` (approximate)
- **Large text** (3:1): `|L_text - L_bg| >= 0.35`
- Always verify computed contrast ratios — OKLCH deltas are approximate guides

## Material Design 3 Rules

### State Layers

```css
/* M3 state layer overlays */
.interactive {
  position: relative;
}
.interactive::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: oklch(var(--color-on-surface) / 0);
  transition: background 200ms cubic-bezier(0.2, 0, 0, 1);
  pointer-events: none;
}
.interactive:hover::before {
  background: oklch(var(--color-on-surface) / 0.08);
}
.interactive:focus-visible::before {
  background: oklch(var(--color-on-surface) / 0.12);
}
.interactive:active::before {
  background: oklch(var(--color-on-surface) / 0.12);
}
```

### Elevation

Use surface tonal elevation (oklch L-channel), not pure drop-shadows:

| Level | L adjustment | Shadow                       |
| ----- | ------------ | ---------------------------- |
| 0     | +0.00        | none                         |
| 1     | +0.05        | 0 1px 2px oklch(0 0 0/0.15)  |
| 2     | +0.08        | 0 2px 4px oklch(0 0 0/0.15)  |
| 3     | +0.11        | 0 4px 8px oklch(0 0 0/0.15)  |
| 4     | +0.12        | 0 6px 12px oklch(0 0 0/0.15) |
| 5     | +0.14        | 0 8px 16px oklch(0 0 0/0.15) |

### Typography Scale

Use M3 type scale with fluid clamp():

```css
.display-large {
  font-size: clamp(2.5rem, 5vw, 3.5625rem);
  line-height: 1.12;
}
.headline-large {
  font-size: clamp(1.75rem, 3vw, 2rem);
  line-height: 1.25;
}
.title-large {
  font-size: clamp(1.25rem, 2vw, 1.375rem);
  line-height: 1.27;
}
.body-large {
  font-size: 1rem;
  line-height: 1.5;
  letter-spacing: 0.03em;
}
.label-large {
  font-size: 0.875rem;
  line-height: 1.43;
  letter-spacing: 0.01em;
}
```

### Touch Targets

All clickable targets: minimum 48x48px (M3 standard, overrides 44px default).

## Design Workflow

### Step 1: Analyze Requirements

| Dimension        | Examples                                         |
| ---------------- | ------------------------------------------------ |
| **Product type** | SaaS, e-commerce, portfolio, dashboard, landing  |
| **Industry**     | healthcare, fintech, gaming, education, devtools |
| **Style mood**   | minimal, playful, professional, elegant, bold    |
| **Tech stack**   | Astro+Svelte+Tailwind (default), React, Vue      |
| **Audience**     | developers, consumers, enterprise, creative pros |

### Step 2: Generate Design Tokens

Produce OKLCH-based design tokens with M3 role mappings:

```markdown
## Design Tokens

### Colors (OKLCH)

- Primary: oklch(0.55 0.2 250) — brand identity
- Secondary: oklch(0.5 0.15 300) — supporting elements
- Tertiary: oklch(0.6 0.18 150) — accent/highlight
- Error: oklch(0.5 0.2 25) — destructive actions
- Surface: oklch(0.98 0.005 250) — backgrounds
- On-Surface: oklch(0.15 0.02 250) — text on backgrounds

### Typography

- Heading: Inter (geometric, readable at all sizes)
- Body: Inter (consistent with heading)
- Mono: JetBrains Mono (code blocks)

### Spacing (4px base)

- xs: 0.25rem, sm: 0.5rem, md: 1rem, lg: 1.5rem, xl: 2rem, 2xl: 3rem

### Shape (M3 rounded)

- sm: 0.5rem, md: 0.75rem, lg: 1rem, xl: 1.75rem, full: 9999px
```

### Step 3: Apply Industry Reasoning

- **Developer tools**: Dark mode preference, monospace accents, technical aesthetic, high information density
- **SaaS/B2B**: Professional palette, clear hierarchy, metric dashboards, trust signals
- **E-commerce**: Product-focused, high-contrast CTAs, social proof, urgency patterns
- **Healthcare**: Calming colors, high accessibility, clear hierarchy, trust
- **Fintech**: Conservative palette, data-dense layouts, security indicators

### Step 4: Generate Implementation

When producing code:

- Astro components for static content (layouts, pages, static sections)
- Svelte components ONLY for interactivity (with explicit hydration directive)
- TypeScript strict mode in all `<script lang="ts">` blocks
- Tailwind utilities with OKLCH custom properties
- SVG icons from Lucide or Heroicons (never emoji)

## Pre-Delivery Checklist

Every output MUST satisfy:

- [ ] **OKLCH only** — no hex, rgb, or hsl color values
- [ ] **No emoji icons** — use SVG (Heroicons, Lucide, Phosphor)
- [ ] **Interactive affordance** — `cursor-pointer` on clickable elements
- [ ] **Hover/focus states** — 150-300ms transitions, M3 state layers
- [ ] **Color contrast** — 4.5:1 text, 3:1 UI (WCAG AA via oklch L-delta)
- [ ] **Responsive** — 375px, 768px, 1024px, 1440px breakpoints
- [ ] **Motion safety** — respect `prefers-reduced-motion`
- [ ] **Semantic HTML** — proper heading hierarchy, landmarks, ARIA
- [ ] **Touch targets** — 48x48px minimum (M3)
- [ ] **Zero-JS default** — Astro static unless Svelte island needed
- [ ] **No innerHTML with user input** — XSS prevention
- [ ] **Loading states** — skeleton screens or spinners for async content

## Security in Generated Code

- No `innerHTML` or `{@html}` with user input (XSS)
- Sanitize user-provided content before rendering
- CSP-compatible patterns (no inline event handlers)
- Validate form inputs client-side AND server-side
- No sensitive data in client-side state or URLs
