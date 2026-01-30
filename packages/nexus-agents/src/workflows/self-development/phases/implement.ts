/**
 * Phase 7: IMPLEMENT (Self-Debug + Self-Refine)
 *
 * Code generation for self-development workflow.
 *
 * @module workflows/self-development/phases/implement
 */

import { createLogger, getTimeProvider } from '../../../core/index.js';
import type { SelfDevWorkflowDependencies } from '../interfaces.js';
import type { SelfDevWorkflowState, RefineOutput, ImplementOutput } from '../types.js';
import { checkFailFast } from './shared.js';

const logger = createLogger({ component: 'self-dev-phase-implement' });

/**
 * Error thrown when implementation cannot proceed due to model failure.
 * (Source: Issue #504 - Fail-safe implementation)
 */
export class ImplementUnavailableError extends Error {
  constructor(reason: string) {
    super(
      `IMPLEMENT phase cannot proceed: ${reason}. ` +
        'To use placeholder fallback (NOT RECOMMENDED), set ' +
        'config.phases.implement.allowPlaceholderFallback = true'
    );
    this.name = 'ImplementUnavailableError';
  }
}

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
 * Build successful implementation output from model response.
 */
function buildSuccessOutput(
  output: string,
  filesFromPlan: RefineOutput['refinedPlan']['files'],
  startTime: number
): ImplementOutput {
  const parsed = parseImplementationFiles(output);
  let filesCreated = parsed.created;
  let filesModified = parsed.modified;

  // If no files parsed from output, use files from plan
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
    selfRefineIterations: 1,
    selfDebugIterations: 0,
    success: true,
    summary: `Implemented ${String(totalFiles)} files`,
    durationMs: getTimeProvider().now() - startTime,
  };
}

/**
 * Build fallback output when model fails (NOT RECOMMENDED).
 */
function buildFallbackOutput(
  errorMessage: string,
  filesFromPlan: RefineOutput['refinedPlan']['files'],
  startTime: number
): ImplementOutput {
  logger.warn('IMPLEMENT phase: Model call failed, using placeholder fallback (NOT RECOMMENDED)', {
    error: errorMessage,
  });

  const categorized = categorizeFilesFromPlan(filesFromPlan);

  return {
    filesCreated: categorized.created,
    filesModified: categorized.modified,
    selfRefineIterations: 0,
    selfDebugIterations: 0,
    success: false,
    summary: `Implementation failed: ${errorMessage}. Placeholder file list from plan.`,
    durationMs: getTimeProvider().now() - startTime,
  };
}

/**
 * Execute IMPLEMENT phase - Code generation using model adapter.
 *
 * By default, this phase FAILS if the model call fails to prevent workflows
 * from proceeding with false success flags.
 * (Source: Issue #504 - Fail-safe implementation)
 */
export async function executeImplement(
  deps: SelfDevWorkflowDependencies,
  state: SelfDevWorkflowState,
  refine: RefineOutput
): Promise<ImplementOutput> {
  const startTime = getTimeProvider().now();
  const filesFromPlan = refine.refinedPlan.files;
  const phaseConfig = state.config.phases?.implement;
  const allowPlaceholderFallback = phaseConfig?.allowPlaceholderFallback === true;

  // Fail-fast check before falling back (Issue #455)
  checkFailFast(state.config.failFast, deps.modelAdapter, 'IMPLEMENT', 'ModelAdapter');
  logProtocolAvailability(deps);

  logger.info('IMPLEMENT phase: Generating implementation', { files: filesFromPlan.length });

  const response = await deps.modelAdapter.complete({
    messages: [{ role: 'user', content: buildImplementPrompt(refine) }],
    systemPrompt: IMPLEMENT_SYSTEM_PROMPT,
    maxTokens: 4000,
  });

  if (response.ok) {
    const content = response.value.content[0];
    const output = content?.type === 'text' ? content.text : '';
    return buildSuccessOutput(output, filesFromPlan, startTime);
  }

  // Model call failed - fail unless placeholder fallback explicitly allowed
  if (!allowPlaceholderFallback) {
    throw new ImplementUnavailableError(`Model call failed: ${response.error.message}`);
  }

  return buildFallbackOutput(response.error.message, filesFromPlan, startTime);
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
