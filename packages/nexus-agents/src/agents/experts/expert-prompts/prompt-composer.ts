/**
 * nexus-agents/agents - Prompt Composer
 *
 * Composes expert base prompts with domain-specific knowledge sections.
 * Sorts knowledge sections by priority and appends them under a
 * structured heading for consistent prompt assembly.
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
 * Composes base expert prompts with optional domain knowledge sections.
 *
 * Knowledge sections are sorted by priority (higher first, default 0)
 * and appended under a `## Domain Knowledge` heading.
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

    const sorted = [...knowledgeSections].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    const formattedSections = sorted
      .map((section) => `### ${section.title}\n${section.content}`)
      .join('\n\n');

    return `${basePrompt}\n\n## Domain Knowledge\n\n${formattedSections}`;
  }
}
