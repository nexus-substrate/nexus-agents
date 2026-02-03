/**
 * Diataxis Documentation Framework Knowledge Module
 *
 * Covers the four documentation types (tutorials, how-to guides, reference,
 * explanation), ADR templates, API documentation patterns, and changelog formats.
 *
 * @module agents/experts/knowledge/documentation/diataxis
 * @see https://diataxis.fr/
 * (Source: Epic #643 / Issue #648 - Phase 1d)
 */

import type { KnowledgeModule } from '../types.js';

export const DIATAXIS_MODULE: KnowledgeModule = {
  id: 'documentation-diataxis',
  domain: 'documentation',
  title: 'Diataxis Documentation Framework',
  tags: ['diataxis', 'documentation', 'adr', 'openapi', 'changelog', 'readme'],
  sections: [
    {
      title: 'Tutorials (Learning-Oriented)',
      content: [
        'PURPOSE: Teach a beginner by guiding them through a complete experience',
        'AUDIENCE: Newcomers who need to learn by doing',
        'FORMAT: Step-by-step instructions with concrete outcomes',
        'RULES:',
        '  - Start with a working result the user can achieve in < 15 minutes',
        '  - Explain WHAT to do, not WHY (save that for Explanation docs)',
        '  - Every step must produce a visible, verifiable result',
        '  - Never assume prior knowledge; define every term on first use',
        '  - Provide exact commands, exact file contents, exact expected output',
        'ANTI-PATTERNS: Offering choices, explaining alternatives, teaching theory',
        'EXAMPLE TITLE: "Build your first REST API in 10 minutes"',
      ].join('\n'),
      priority: 10,
    },
    {
      title: 'How-To Guides (Task-Oriented)',
      content: [
        'PURPOSE: Help a practitioner accomplish a specific real-world goal',
        'AUDIENCE: Users who know the basics but need to solve a particular problem',
        'FORMAT: Practical steps focused on achieving a goal',
        'RULES:',
        '  - Title as a verb phrase: "How to configure SSL" not "SSL Configuration"',
        '  - Assume the reader has basic competence with the system',
        '  - Focus on the task, not on teaching concepts',
        '  - Provide just enough context to complete the task',
        '  - Include troubleshooting tips for common failures',
        'ANTI-PATTERNS: Teaching from scratch, exhaustive reference details',
        'EXAMPLE TITLE: "How to migrate from v2 to v3"',
      ].join('\n'),
      priority: 10,
    },
    {
      title: 'Reference (Information-Oriented)',
      content: [
        'PURPOSE: Describe the system precisely for lookup and verification',
        'AUDIENCE: Users who know what they need and want accurate details',
        'FORMAT: Structured, consistent, complete — organized by the code, not by user tasks',
        'RULES:',
        '  - Mirror the structure of the codebase (one page per module/class/endpoint)',
        '  - Be consistent: same format for every entry (name, type, default, description)',
        '  - Be precise: exact types, exact defaults, exact constraints',
        '  - Be complete: document every public API, parameter, return value, error',
        '  - Use tables for parameters, code blocks for examples',
        'ANTI-PATTERNS: Tutorials mixed in, opinions, explanations of design choices',
        'EXAMPLE TITLE: "Configuration Reference" or "API Endpoint Reference"',
      ].join('\n'),
      priority: 9,
    },
    {
      title: 'Explanation (Understanding-Oriented)',
      content: [
        'PURPOSE: Provide context, reasoning, and background for deeper understanding',
        'AUDIENCE: Users who want to understand WHY, not just HOW',
        'FORMAT: Discursive prose exploring concepts, trade-offs, and alternatives',
        'RULES:',
        '  - Explain reasoning behind design decisions',
        '  - Compare alternatives and state why one was chosen',
        '  - Connect concepts to broader principles and patterns',
        '  - Admit trade-offs honestly; state what was sacrificed and why',
        '  - Link to related tutorials, how-tos, and references',
        'ANTI-PATTERNS: Step-by-step instructions, API listings, beginner hand-holding',
        'EXAMPLE TITLE: "Why we chose event sourcing over CRUD"',
      ].join('\n'),
      priority: 9,
    },
    {
      title: 'Documentation Type Decision Tree',
      content: [
        'Q1: Is the reader trying to LEARN the system? → Tutorial',
        'Q2: Is the reader trying to ACCOMPLISH a specific task? → How-To Guide',
        'Q3: Is the reader trying to LOOK UP specific information? → Reference',
        'Q4: Is the reader trying to UNDERSTAND why something works this way? → Explanation',
        'RULE: Never mix types in one document — split into separate docs',
        'RULE: Link between types (tutorial links to reference, how-to links to explanation)',
        'AUDIT: For each doc, ask "what is the reader DOING?" — if mixed, split it',
      ].join('\n'),
      priority: 8,
    },
    {
      title: 'ADR (Architecture Decision Record) Template',
      content: [
        'FILE: docs/decisions/NNNN-title-with-dashes.md',
        'SECTIONS:',
        '  # Title: Short noun phrase (e.g., "Use PostgreSQL for primary storage")',
        '  ## Status: Proposed | Accepted | Deprecated | Superseded by [ADR-NNNN]',
        '  ## Context: What forces are at play? What is the problem?',
        '  ## Decision: What is the change that we are proposing/doing?',
        '  ## Consequences: What are the trade-offs? Both positive and negative.',
        'RULES:',
        '  - One decision per ADR; do not bundle multiple decisions',
        '  - Write in present tense: "We use X" not "We will use X"',
        '  - Never delete ADRs; supersede them with new ones',
        '  - Number sequentially; never reuse numbers',
      ].join('\n'),
      priority: 8,
    },
    {
      title: 'API Documentation Patterns',
      content: [
        'OPENAPI (REST): Use OpenAPI 3.1 spec as source of truth',
        '  REQUIRE: operationId, summary, description, request/response schemas, error codes',
        '  GENERATE: Docs from spec (Redoc, Swagger UI) — never hand-write API docs',
        'ASYNCAPI (Events): Use AsyncAPI 3.0 for event-driven APIs',
        '  REQUIRE: channel, message schema, payload examples, bindings',
        'PATTERN: Include runnable examples (curl, SDK snippets) for every endpoint',
        'PATTERN: Document error responses with codes, messages, and recovery actions',
        'PATTERN: Version API docs alongside API code in the same repository',
      ].join('\n'),
      priority: 7,
    },
    {
      title: 'Changelog and README Patterns',
      content: [
        'CHANGELOG (Keep a Changelog format):',
        '  SECTIONS: Added, Changed, Deprecated, Removed, Fixed, Security',
        '  RULES: Newest first, one entry per change, link to PR/issue',
        '  FORMAT: ## [version] - YYYY-MM-DD',
        'README STRUCTURE:',
        '  1. Project name + one-line description (what it does)',
        '  2. Quick start (install + first use in < 5 commands)',
        '  3. Key features (bulleted, concise)',
        '  4. Requirements / prerequisites',
        '  5. Installation (detailed)',
        '  6. Usage examples (common scenarios)',
        '  7. Configuration reference (or link to full reference)',
        '  8. Contributing (or link to CONTRIBUTING.md)',
        '  9. License',
      ].join('\n'),
      priority: 7,
    },
  ],
} as const;
