---
name: ui-ux-design
description: |
  Generate design systems and UI/UX recommendations for software products.
  Covers style selection, color palettes, typography, layout patterns,
  accessibility, and stack-specific guidelines. Triggers on "design system",
  "UI design", "color palette", "typography", "landing page design",
  "dashboard design", "style guide", "component design".
allowed-tools: Read, Grep, Glob, WebSearch, Task
context: fork
---

# UI/UX Design Skill

<!-- CANONICAL SOURCES:
  - CLAUDE.md Canonical Paths
  - Epic #946 (UI UX Pro Max Integration)
  - Methodology adapted from github.com/nextlevelbuilder/ui-ux-pro-max-skill
-->

## Design Workflow

Follow these steps as guidance — skip steps when the user provides sufficient context.

### Step 1: Analyze Requirements

Extract from the user's request:

| Dimension        | Examples                                         |
| ---------------- | ------------------------------------------------ |
| **Product type** | SaaS, e-commerce, portfolio, dashboard, landing  |
| **Industry**     | healthcare, fintech, gaming, education, beauty   |
| **Style mood**   | minimal, playful, professional, elegant, bold    |
| **Tech stack**   | React, Vue, Next.js, HTML+Tailwind, shadcn/ui    |
| **Audience**     | developers, consumers, enterprise, creative pros |

If any dimension is unclear, ask before proceeding.

### Step 2: Generate Design System

Produce a structured design system with these sections:

```markdown
## Design System: [Project Name]

### Pattern & Layout

- Page structure (e.g., Hero + Features + Social Proof + CTA)
- Grid system and spacing scale
- Responsive breakpoints: 375px, 768px, 1024px, 1440px

### Style Direction

- Primary style (e.g., Glassmorphism, Minimalism, Soft UI)
- Visual characteristics (shadows, borders, gradients, effects)
- Animation approach (subtle transitions 150-300ms, ease-out)

### Color Palette

- Primary, secondary, accent colors with hex values
- Semantic colors: success, warning, error, info
- Light/dark mode considerations
- Contrast ratios: 4.5:1 minimum for text (WCAG AA)

### Typography

- Heading font + body font pairing with rationale
- Type scale (base size, heading hierarchy)
- Line height and letter spacing guidelines
- Google Fonts import if applicable

### Component Patterns

- Button styles (primary, secondary, ghost, destructive)
- Form elements (inputs, selects, checkboxes)
- Card patterns and content containers
- Navigation patterns (top bar, sidebar, mobile drawer)
```

### Step 3: Apply Industry Reasoning

Consider industry-specific constraints:

- **SaaS/B2B**: Professional palette, clear hierarchy, metric dashboards, trust signals
- **E-commerce**: Product-focused, high-contrast CTAs, social proof, urgency patterns
- **Healthcare**: Calming colors, high accessibility, clear information hierarchy, trust
- **Fintech**: Conservative palette, data-dense layouts, security indicators, precision
- **Creative/Portfolio**: Bold typography, whitespace, visual storytelling, personality
- **Developer tools**: Dark mode preference, monospace accents, technical aesthetic
- **Beauty/Wellness**: Soft palettes, organic shapes, elegant typography, aspirational imagery

Identify anti-patterns to avoid per industry (e.g., neon colors for healthcare, playful fonts for fintech).

### Step 4: Generate Implementation

When producing code, apply stack-specific best practices:

**React/Next.js**: Component composition, CSS modules or Tailwind, responsive hooks
**Vue/Nuxt**: Composition API, scoped styles, slot patterns
**HTML+Tailwind**: Utility-first, responsive prefixes, custom theme config
**shadcn/ui**: Use existing components, extend via variants, consistent tokens

## Pre-Delivery Checklist

Every design output MUST satisfy:

- [ ] **No emoji icons** — use SVG icon libraries (Heroicons, Lucide, Phosphor)
- [ ] **Interactive affordance** — `cursor-pointer` on all clickable elements
- [ ] **Hover states** — smooth transitions (150-300ms) on interactive elements
- [ ] **Focus states** — visible outlines for keyboard navigation (WCAG 2.4.7)
- [ ] **Color contrast** — 4.5:1 text, 3:1 UI components (WCAG AA)
- [ ] **Responsive** — tested at 375px, 768px, 1024px, 1440px
- [ ] **Motion safety** — respect `prefers-reduced-motion`
- [ ] **Semantic HTML** — proper heading hierarchy, landmark regions, ARIA labels
- [ ] **Loading states** — skeleton screens or spinners for async content
- [ ] **Error states** — clear, actionable error messages with recovery paths

## Security in Generated Code

When generating frontend code:

- [ ] No `innerHTML` or `dangerouslySetInnerHTML` with user input (XSS)
- [ ] Sanitize any user-provided content before rendering
- [ ] Use CSP-compatible patterns (no inline event handlers)
- [ ] Validate form inputs client-side AND server-side
- [ ] No sensitive data in client-side state or URLs

## Hierarchical Design System Pattern

For multi-page projects, use a Master + Overrides structure:

```
design-system/
  MASTER.md          # Global source of truth (all defaults)
  pages/
    dashboard.md     # Only deviations from MASTER
    checkout.md      # Only deviations from MASTER
```

**Rule**: Page overrides contain ONLY what differs from MASTER. When building a page:

1. Check `pages/[page].md` first — if exists, its rules override MASTER
2. If no page override exists, use MASTER exclusively
3. Never duplicate MASTER content in page files

## Output Format

```markdown
## Design Recommendation

### Requirements Summary

[1-2 sentences restating what the user needs]

### Design System

[Structured system per Step 2]

### Industry Considerations

[Reasoning from Step 3]

### Implementation Notes

[Stack-specific guidance from Step 4]

### Checklist Status

[Pre-delivery checklist results]
```

## When to Use

- User wants visual design guidance for a software product
- Creating or refining a component library or design system
- Evaluating color, typography, or layout choices
- Building landing pages, dashboards, or product interfaces
- Reviewing UI consistency and accessibility compliance
