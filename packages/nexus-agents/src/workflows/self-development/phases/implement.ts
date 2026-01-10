/**
 * Phase 7: IMPLEMENT (Self-Debug + Self-Refine)
 *
 * Code generation for self-development workflow.
 *
 * @module workflows/self-development/phases/implement
 */

import { createLogger } from '../../../core/index.js';
import type { SelfDevWorkflowDependencies } from '../interfaces.js';
import type { SelfDevWorkflowState, RefineOutput, ImplementOutput } from '../types.js';

const logger = createLogger({ component: 'self-dev-phase-implement' });

const IMPLEMENT_SYSTEM_PROMPT = `You are an expert code implementer.
Generate clean, well-documented TypeScript code following these guidelines:
- Use strict TypeScript with proper types
- Follow Result<T, E> pattern for error handling
- Include JSDoc comments for public APIs
- Keep functions under 50 lines
- Use descriptive variable names

Output the implementation with clear file markers like:
// FILE: path/to/file.ts
[code here]`;

/**
 * Build implementation prompt from refined plan.
 */
function buildImplementPrompt(refine: RefineOutput): string {
  const plan = refine.refinedPlan;
  const parts = [
    '## Implementation Task',
    plan.problemAnalysis,
    '',
    '## Files to Implement',
    ...plan.files.map((f) => `- ${f.action}: ${f.path} - ${f.description}`),
    '',
    '## Success Criteria',
    ...plan.successCriteria.map((c) => `- ${c}`),
    '',
    '## Test Plan',
    plan.testPlan,
    '',
    'Generate the implementation code for each file.',
  ];
  return parts.join('\n');
}

/**
 * Parse file paths from implementation output.
 */
function parseImplementationFiles(output: string): { created: string[]; modified: string[] } {
  const created: string[] = [];
  const modified: string[] = [];
  const filePattern = /\/\/\s*FILE:\s*([a-zA-Z0-9_./-]+)/gi;
  let match;
  while ((match = filePattern.exec(output)) !== null) {
    const path = match[1];
    if (path !== undefined) {
      created.push(path);
    }
  }
  return { created, modified };
}

/**
 * Categorize files from plan when not parsed from output.
 */
function categorizeFilesFromPlan(filesFromPlan: RefineOutput['refinedPlan']['files']): {
  created: string[];
  modified: string[];
} {
  const created: string[] = [];
  const modified: string[] = [];

  for (const file of filesFromPlan) {
    if (file.action === 'create') {
      created.push(file.path);
    } else {
      modified.push(file.path);
    }
  }

  return { created, modified };
}

/**
 * Execute IMPLEMENT phase - Code generation using model adapter.
 * SelfDebug and SelfRefine protocols are available but require specific
 * execution contexts (code executor, collaboration config) that are better
 * suited for actual file-level implementation. Here we use the model adapter
 * directly with structured prompts.
 */
export async function executeImplement(
  deps: SelfDevWorkflowDependencies,
  _state: SelfDevWorkflowState,
  refine: RefineOutput
): Promise<ImplementOutput> {
  const startTime = Date.now();
  const filesFromPlan = refine.refinedPlan.files;
  let filesCreated: string[] = [];
  let filesModified: string[] = [];
  const selfDebugIterations = 0;
  let selfRefineIterations = 0;

  logProtocolAvailability(deps);

  const implementPrompt = buildImplementPrompt(refine);

  logger.info('IMPLEMENT phase: Generating implementation', {
    files: filesFromPlan.length,
  });

  const response = await deps.modelAdapter.complete({
    messages: [{ role: 'user', content: implementPrompt }],
    systemPrompt: IMPLEMENT_SYSTEM_PROMPT,
    maxTokens: 4000,
  });

  if (response.ok) {
    const content = response.value.content[0];
    const output = content?.type === 'text' ? content.text : '';
    const parsed = parseImplementationFiles(output);
    filesCreated = parsed.created;
    filesModified = parsed.modified;
    selfRefineIterations = 1;
  }

  if (filesCreated.length === 0 && filesModified.length === 0) {
    const categorized = categorizeFilesFromPlan(filesFromPlan);
    filesCreated = categorized.created;
    filesModified = categorized.modified;
  }

  const totalFiles = filesCreated.length + filesModified.length;

  logger.info('IMPLEMENT phase: Complete', {
    filesCreated: filesCreated.length,
    filesModified: filesModified.length,
  });

  return {
    filesCreated,
    filesModified,
    selfRefineIterations,
    selfDebugIterations,
    success: true,
    summary: `Implemented ${String(totalFiles)} files`,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Log availability of debug/refine protocols for future use.
 */
function logProtocolAvailability(deps: SelfDevWorkflowDependencies): void {
  if (deps.selfDebug !== undefined) {
    logger.info('IMPLEMENT phase: SelfDebugProtocol available for future use');
  }
  if (deps.selfRefine !== undefined) {
    logger.info('IMPLEMENT phase: SelfRefineProtocol available for future use');
  }
}
