/**
 * nexus-agents/agents - Prompt Composer
 *
 * Composes expert base prompts with domain-specific knowledge sections,
 * task context, and output constraints. Supports both simple composition
 * (base + knowledge) and full context-aware assembly for worker dispatch.
 */

/**
 * A section of domain knowledge to inject into an expert prompt.
 */
export interface KnowledgeSection {
  readonly title: string;
  readonly content: string;
  readonly priority?: number;
}

/**
 * Input for building a task context block.
 */
export interface TaskContextInput {
  readonly taskDescription: string;
  readonly taskType: string;
  readonly relevantFiles?: readonly string[];
  readonly codingConventions?: readonly string[];
}

/**
 * Input for building an output constraints block.
 */
export interface OutputConstraintsInput {
  readonly maxOutputChars?: number;
  readonly format?: string;
  readonly requiredSections?: readonly string[];
}

/**
 * Input for composing a prompt with full context.
 */
export interface ComposeWithContextInput {
  readonly basePrompt: string;
  readonly taskContext?: string;
  readonly outputConstraints?: string;
  readonly knowledgeSections?: readonly KnowledgeSection[];
}

const MAX_TASK_DESCRIPTION_LENGTH = 500;
const MAX_RELEVANT_FILES = 20;
const DEFAULT_MAX_OUTPUT_CHARS = 4000;

/**
 * Injection tag patterns to strip from task context.
 * Matches: <system>, <human>, <assistant>, <img ...>, HTML comments.
 */
const INJECTION_PATTERNS = [
  /<\/?(?:system|human|assistant|instructions)(?:\s[^>]*)?>[\s\S]*?(?:<\/(?:system|human|assistant|instructions)>|$)/gi,
  /<img\b[^>]*>/gi,
  /<!--[\s\S]*?-->/g,
];

/** Matches path traversal sequences like ../../../etc/passwd */
const PATH_TRAVERSAL_PATTERN = /(?:\.\.\/){2,}[^\s]*/g;

/**
 * Sanitize task context input by stripping injection patterns.
 * Removes XML-like tags, HTML img tags, HTML comments, and path traversal.
 *
 * @param input - Raw task context string
 * @returns Sanitized string safe for prompt injection
 */
export function sanitizeTaskContext(input: string): string {
  let sanitized = input;
  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }
  sanitized = sanitized.replace(PATH_TRAVERSAL_PATTERN, '[path-removed]');
  return sanitized.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Build a formatted task context block for prompt assembly.
 *
 * @param input - Task context input with description, type, files, conventions
 * @returns Formatted task context section string
 */
export function buildTaskContextBlock(input: TaskContextInput): string {
  const desc =
    input.taskDescription.length > MAX_TASK_DESCRIPTION_LENGTH
      ? input.taskDescription.slice(0, MAX_TASK_DESCRIPTION_LENGTH)
      : input.taskDescription;

  const lines: string[] = [
    '## Task Context',
    '',
    `**Task Type:** ${input.taskType}`,
    '',
    `**Description:** ${desc}`,
  ];

  if (input.relevantFiles && input.relevantFiles.length > 0) {
    const files = input.relevantFiles.slice(0, MAX_RELEVANT_FILES);
    lines.push('', '**Relevant Files:**');
    for (const file of files) {
      lines.push(`- ${file}`);
    }
  }

  if (input.codingConventions && input.codingConventions.length > 0) {
    lines.push('', '**Coding Conventions:**');
    for (const convention of input.codingConventions) {
      lines.push(`- ${convention}`);
    }
  }

  return lines.join('\n');
}

/**
 * Build a formatted output constraints block for prompt assembly.
 *
 * @param input - Output constraints with max chars, format, required sections
 * @returns Formatted output constraints section string
 */
export function buildOutputConstraintsBlock(input: OutputConstraintsInput): string {
  const maxChars = input.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;

  const lines: string[] = [
    '## Output Constraints',
    '',
    `**Maximum Output:** ${String(maxChars)} characters`,
  ];

  if (input.format !== undefined && input.format !== '') {
    lines.push(`**Format:** ${input.format}`);
  }

  if (input.requiredSections && input.requiredSections.length > 0) {
    lines.push('', '**Required Sections:**');
    for (const section of input.requiredSections) {
      lines.push(`- ${section}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format knowledge sections sorted by priority.
 */
function formatKnowledgeSections(sections: readonly KnowledgeSection[]): string {
  const sorted = [...sections].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  return sorted.map((section) => `### ${section.title}\n${section.content}`).join('\n\n');
}

/**
 * Composes base expert prompts with optional domain knowledge sections,
 * task context, and output constraints.
 */
export class PromptComposer {
  /**
   * Compose a base prompt with optional knowledge sections.
   *
   * @param basePrompt - The expert's base system prompt
   * @param knowledgeSections - Optional domain knowledge to append
   * @returns The fully assembled prompt string
   */
  compose(basePrompt: string, knowledgeSections?: readonly KnowledgeSection[]): string {
    if (!knowledgeSections || knowledgeSections.length === 0) {
      return basePrompt;
    }

    const formattedSections = formatKnowledgeSections(knowledgeSections);
    return `${basePrompt}\n\n## Domain Knowledge\n\n${formattedSections}`;
  }

  /**
   * Compose a prompt with full context: base + task context + output constraints + knowledge.
   *
   * @param input - Full composition input with all optional blocks
   * @returns The fully assembled prompt string
   */
  composeWithContext(input: ComposeWithContextInput): string {
    const parts: string[] = [input.basePrompt];

    if (input.taskContext !== undefined && input.taskContext !== '') {
      parts.push(input.taskContext);
    }

    if (input.knowledgeSections !== undefined && input.knowledgeSections.length > 0) {
      const formatted = formatKnowledgeSections(input.knowledgeSections);
      parts.push(`## Domain Knowledge\n\n${formatted}`);
    }

    if (input.outputConstraints !== undefined && input.outputConstraints !== '') {
      parts.push(input.outputConstraints);
    }

    return parts.join('\n\n');
  }
}
