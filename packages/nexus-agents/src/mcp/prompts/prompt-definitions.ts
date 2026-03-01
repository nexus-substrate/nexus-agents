/**
 * nexus-agents/mcp - Prompt Template Definitions
 *
 * Declarative prompt templates for MCP clients.
 * Each definition specifies a name, description, Zod args schema,
 * and a function that builds the prompt messages from validated args.
 *
 * (Source: MCP Protocol 2025-11-25)
 */

import { z } from 'zod';

/**
 * A single message in a prompt template.
 */
export interface PromptMessage {
  readonly role: 'user' | 'assistant';
  readonly content: { readonly type: 'text'; readonly text: string };
}

/**
 * Declarative definition of an MCP prompt template.
 *
 * - `argsSchema`: Zod shape passed to `server.registerPrompt`
 * - `buildMessages`: produces the message array from validated args
 */
export interface PromptDefinition {
  readonly name: string;
  readonly description: string;
  readonly argsSchema: Record<string, z.ZodType>;
  readonly buildMessages: (args: Record<string, string | undefined>) => readonly PromptMessage[];
}

// ---------------------------------------------------------------------------
// Individual prompt builders (kept under 50 lines each)
// ---------------------------------------------------------------------------

function buildOrchestrateMessages(
  args: Record<string, string | undefined>
): readonly PromptMessage[] {
  const task = args['task'] ?? '';
  const engine = args['engine'];
  const engineNote = engine !== undefined && engine !== '' ? `\nPreferred engine: ${engine}` : '';

  return [
    {
      role: 'user',
      content: {
        type: 'text',
        text: [
          'You are a task orchestrator for nexus-agents.',
          'Break the task into subtasks, assign expert agents, and coordinate execution.',
          'Return a structured plan with: subtask descriptions, assigned expert roles,',
          'dependencies between subtasks, and expected outputs.',
          engineNote,
        ].join('\n'),
      },
    },
    {
      role: 'user',
      content: { type: 'text', text: `Task: ${task}` },
    },
  ] as const;
}

function buildSecurityReviewMessages(
  args: Record<string, string | undefined>
): readonly PromptMessage[] {
  const target = args['target'] ?? '';

  return [
    {
      role: 'user',
      content: {
        type: 'text',
        text: [
          'You are a security auditor. Review the target for vulnerabilities.',
          'Check for: injection flaws, auth issues, data exposure, path traversal,',
          'insecure dependencies, secrets in code, missing input validation,',
          'and rate-limiting gaps.',
          'Classify each finding by severity (critical/high/medium/low) and provide remediation.',
        ].join('\n'),
      },
    },
    {
      role: 'user',
      content: { type: 'text', text: `Target: ${target}` },
    },
  ] as const;
}

function buildCodeReviewMessages(
  args: Record<string, string | undefined>
): readonly PromptMessage[] {
  const target = args['target'] ?? '';

  return [
    {
      role: 'user',
      content: {
        type: 'text',
        text: [
          'You are a code reviewer. Analyze the target for quality and correctness.',
          'Evaluate: error handling, type safety, test coverage, naming clarity,',
          'function size, DRY violations, YAGNI violations, and performance concerns.',
          'Provide actionable feedback with file paths and line references.',
        ].join('\n'),
      },
    },
    {
      role: 'user',
      content: { type: 'text', text: `Target: ${target}` },
    },
  ] as const;
}

function buildResearchSurveyMessages(
  args: Record<string, string | undefined>
): readonly PromptMessage[] {
  const topic = args['topic'] ?? '';
  const maxResults = args['maxResults'];
  const limitNote =
    maxResults !== undefined && maxResults !== '' ? `\nReturn at most ${maxResults} results.` : '';

  return [
    {
      role: 'user',
      content: {
        type: 'text',
        text: [
          'You are a research analyst. Survey the topic using available sources.',
          'Methodology: search arXiv and related repositories, assess relevance,',
          'identify key papers and implementations, note gaps in coverage.',
          'Structure your findings as: summary, key sources, and open questions.',
          limitNote,
        ].join('\n'),
      },
    },
    {
      role: 'user',
      content: { type: 'text', text: `Topic: ${topic}` },
    },
  ] as const;
}

// ---------------------------------------------------------------------------
// Prompt registry
// ---------------------------------------------------------------------------

/**
 * All registered MCP prompt templates.
 *
 * Each entry provides a Zod args schema for validation and a message builder.
 */
export const PROMPT_DEFINITIONS: readonly PromptDefinition[] = [
  {
    name: 'orchestrate-task',
    description: 'Break a task into subtasks and coordinate expert agents for execution.',
    argsSchema: {
      task: z.string().describe('The task to orchestrate'),
      engine: z.string().optional().describe('Preferred orchestration engine'),
    },
    buildMessages: buildOrchestrateMessages,
  },
  {
    name: 'security-review',
    description: 'Run a security audit checklist against a codebase or component.',
    argsSchema: {
      target: z.string().describe('The codebase, file, or component to audit'),
    },
    buildMessages: buildSecurityReviewMessages,
  },
  {
    name: 'code-review',
    description: 'Review code for quality, correctness, and adherence to standards.',
    argsSchema: {
      target: z.string().describe('The code, file, or PR to review'),
    },
    buildMessages: buildCodeReviewMessages,
  },
  {
    name: 'research-survey',
    description: 'Survey a research topic for key papers, implementations, and gaps.',
    argsSchema: {
      topic: z.string().describe('The research topic to survey'),
      maxResults: z.string().optional().describe('Maximum number of results to return'),
    },
    buildMessages: buildResearchSurveyMessages,
  },
] as const;
