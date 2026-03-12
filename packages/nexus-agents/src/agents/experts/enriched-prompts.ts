/**
 * nexus-agents/agents - Enriched Expert Prompts
 *
 * Composes built-in expert system prompts with domain-specific knowledge
 * from the knowledge modules. Each function appends a concise knowledge
 * summary to the base system prompt for its expert domain.
 *
 * @module agents/experts/enriched-prompts
 * (Source: Epic #643 - Phase 5a: Expert Knowledge Base Enhancement)
 */

import { getArchitectureKnowledgePrompt } from './knowledge/architecture/index.js';
import { getSecurityKnowledgePrompt } from './knowledge/security/index.js';
import { getDevOpsKnowledgePrompt } from './knowledge/devops/index.js';
import { getResearchKnowledgePrompt } from './knowledge/research/index.js';
import { getCodeKnowledgePrompt } from './knowledge/code/index.js';
import { getTestingKnowledgePrompt } from './knowledge/testing/index.js';
import { getDocumentationKnowledgePrompt } from './knowledge/documentation/index.js';

/**
 * Enrich a base system prompt with domain knowledge.
 * Appends the knowledge prompt after the base prompt with a separator.
 *
 * @param basePrompt - The expert's base system prompt
 * @param knowledgePrompt - Formatted domain knowledge string
 * @returns Combined prompt with knowledge injected
 */
function enrichPrompt(basePrompt: string, knowledgePrompt: string): string {
  return `${basePrompt}\n\n${knowledgePrompt}`;
}

/**
 * Build an enriched architecture expert system prompt.
 *
 * @param basePrompt - The architecture expert's base system prompt
 * @returns System prompt enriched with architecture domain knowledge
 */
export function buildArchitecturePrompt(basePrompt: string): string {
  return enrichPrompt(basePrompt, getArchitectureKnowledgePrompt());
}

/**
 * Build an enriched security expert system prompt.
 *
 * @param basePrompt - The security expert's base system prompt
 * @returns System prompt enriched with security domain knowledge
 */
export function buildSecurityPrompt(basePrompt: string): string {
  return enrichPrompt(basePrompt, getSecurityKnowledgePrompt());
}

/**
 * Build an enriched DevOps expert system prompt.
 *
 * @param basePrompt - The DevOps expert's base system prompt
 * @returns System prompt enriched with DevOps domain knowledge
 */
export function buildDevOpsPrompt(basePrompt: string): string {
  return enrichPrompt(basePrompt, getDevOpsKnowledgePrompt());
}

/**
 * Build an enriched research expert system prompt.
 *
 * @param basePrompt - The research expert's base system prompt
 * @returns System prompt enriched with research domain knowledge
 */
export function buildResearchPrompt(basePrompt: string): string {
  return enrichPrompt(basePrompt, getResearchKnowledgePrompt());
}

/**
 * Build an enriched code expert system prompt.
 *
 * @param basePrompt - The code expert's base system prompt
 * @returns System prompt enriched with code domain knowledge
 */
export function buildCodePrompt(basePrompt: string): string {
  return enrichPrompt(basePrompt, getCodeKnowledgePrompt());
}

/**
 * Build an enriched testing expert system prompt.
 *
 * @param basePrompt - The testing expert's base system prompt
 * @returns System prompt enriched with testing domain knowledge
 */
export function buildTestingPrompt(basePrompt: string): string {
  return enrichPrompt(basePrompt, getTestingKnowledgePrompt());
}

/**
 * Build an enriched documentation expert system prompt.
 *
 * @param basePrompt - The documentation expert's base system prompt
 * @returns System prompt enriched with documentation domain knowledge
 */
export function buildDocumentationPrompt(basePrompt: string): string {
  return enrichPrompt(basePrompt, getDocumentationKnowledgePrompt());
}

const PM_KNOWLEDGE_SUMMARY = `## PM Domain Knowledge

### Requirements Engineering
- Use INVEST criteria for user stories (Independent, Negotiable, Valuable, Estimable, Small, Testable)
- Decompose epics into stories with clear acceptance criteria using Given/When/Then
- Prioritize with RICE scoring (Reach, Impact, Confidence, Effort)

### Stakeholder Management
- Map stakeholders by influence and interest (power/interest grid)
- Communicate at the appropriate level of abstraction for each audience
- Maintain a RACI matrix for cross-functional deliverables`;

/**
 * Build an enriched PM expert system prompt.
 *
 * @param basePrompt - The PM expert's base system prompt
 * @returns System prompt enriched with PM domain knowledge
 */
export function buildPmPrompt(basePrompt: string): string {
  return enrichPrompt(basePrompt, PM_KNOWLEDGE_SUMMARY);
}

const UX_KNOWLEDGE_SUMMARY = `## UX Domain Knowledge

### Usability Heuristics
- Nielsen's 10 heuristics: visibility of system status, match to real world, user control, consistency, error prevention, recognition over recall, flexibility, aesthetic design, error recovery, help/documentation
- Fitts's Law: larger and closer targets are faster to interact with
- Hick's Law: reduce choices to decrease decision time

### Accessibility Standards
- WCAG 2.1 AA: color contrast 4.5:1 for text, 3:1 for UI components
- Keyboard navigation: all interactive elements focusable and operable
- Screen reader: semantic HTML, ARIA labels, meaningful alt text

### OKLCH Color System
- oklch(L C H) — L: lightness 0-1, C: chroma 0-0.4, H: hue 0-360
- Generate M3 tonal palettes by varying L while keeping H constant
- Ensure WCAG AA by enforcing sufficient delta in L channel between text and surface
- Tailwind integration: \`color: oklch(var(--color-primary) / <alpha-value>)\`

### Material Design 3 Tokens
- M3 state layers: hover 8%, focus 12%, pressed 12% opacity overlays
- Elevation levels 0-5 via oklch L-channel manipulation (not pure drop-shadows)
- Typography scales: Display (57-45), Headline (36-24), Title (22-14), Label (14-11), Body (16-12)
- Fluid typography: clamp() for responsive scaling

### Astro + Svelte Architecture
- Astro (.astro) for static content, routing, layouts — zero JS by default
- Svelte (.svelte) only for interactive islands with explicit hydration directives
- client:load (critical interactivity), client:idle (deferred), client:visible (lazy)
- nano-stores for cross-island state management`;

/**
 * Build an enriched UX expert system prompt.
 *
 * @param basePrompt - The UX expert's base system prompt
 * @returns System prompt enriched with UX domain knowledge
 */
export function buildUxPrompt(basePrompt: string): string {
  return enrichPrompt(basePrompt, UX_KNOWLEDGE_SUMMARY);
}

const INFRASTRUCTURE_KNOWLEDGE_SUMMARY = `## Infrastructure Domain Knowledge

### Hardware Lifecycle
- Monitor SMART attributes and SEL for predictive failure detection
- Stagger firmware updates: test on one node, wait 48h, then fleet-wide
- Maintain multiple access paths: SSH key, SSH password, OOB/IPMI, VPN

### Operational Patterns
- Drain nodes before maintenance (Docker Swarm/Kubernetes)
- Isolate management traffic on dedicated VLAN
- Document physical topology: rack location, serial numbers, OOB IPs

### Container Security and Networking
- Scan images with Trivy (\`--severity CRITICAL,HIGH\`); pin specific tags, not :latest
- UFW FORWARD chain gotcha: \`ufw allow\` only affects INPUT — use \`ufw route allow\` for container ports
- Diagnose port conflicts: \`ss -tlnp | grep PORT\`; set SO_REUSEADDR to prevent restart crash loops`;

/**
 * Build an enriched infrastructure expert system prompt.
 *
 * @param basePrompt - The infrastructure expert's base system prompt
 * @returns System prompt enriched with infrastructure domain knowledge
 */
export function buildInfrastructurePrompt(basePrompt: string): string {
  return enrichPrompt(basePrompt, INFRASTRUCTURE_KNOWLEDGE_SUMMARY);
}
