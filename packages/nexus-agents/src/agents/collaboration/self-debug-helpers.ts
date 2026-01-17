/**
 * Self-Debug Protocol Helpers
 *
 * Helper functions for error parsing and prompt building.
 * (Source: Issue #131, arXiv:2304.05128)
 */

import { escapeRegex, validatePattern } from '../../core/safe-regex.js';
import type {
  ParsedError,
  ErrorExplanation,
  CodeFix,
  ErrorPattern,
  ExecutionResult,
  DebugIteration,
  SelfDebugResult,
} from './self-debug-types.js';

/** Extract group from regex match. */
export function extractGroup(match: RegExpMatchArray, index?: number): string | undefined {
  return index !== undefined ? match[index] : undefined;
}

/** Extract numeric group from regex match. */
export function extractGroupNum(match: RegExpMatchArray, index?: number): number | undefined {
  const value = extractGroup(match, index);
  return value !== undefined ? parseInt(value, 10) : undefined;
}

/** Extract section from text.
 * Note: sectionName is escaped to prevent ReDoS (Issue #341).
 */
export function extractSection(text: string, sectionName: string): string | undefined {
  // Escape the section name to prevent ReDoS attacks (Issue #341)
  const escapedName = escapeRegex(sectionName);
  const regex = new RegExp(`${escapedName}[:\\s]+([^\\n]+)`, 'i');
  const match = text.match(regex);
  return match?.[1]?.trim();
}

/** Extract numbered list from text. */
export function extractList(text: string): string[] {
  const matches = text.match(/^\d+\.\s+(.+)$/gm);
  return matches !== null ? matches.map((m) => m.replace(/^\d+\.\s+/, '')) : [];
}

/** Create a parsed error from regex match. */
export function createParsedError(
  match: RegExpMatchArray,
  pattern: ErrorPattern,
  errorId: number
): ParsedError {
  const message = extractGroup(match, pattern.groups.message);
  return {
    id: `error-${String(errorId)}`,
    category: pattern.category,
    severity: 'error',
    message: message !== undefined && message.length > 0 ? message : match[0],
    code: extractGroup(match, pattern.groups.code),
    location: {
      file: extractGroup(match, pattern.groups.file),
      line: extractGroupNum(match, pattern.groups.line),
      column: extractGroupNum(match, pattern.groups.column),
    },
    rawError: match[0],
  };
}

/** Build explanation prompt. */
export function buildExplanationPrompt(code: string, error: ParsedError): string {
  const lineNum = error.location?.line;
  const location = lineNum !== undefined ? ` at line ${String(lineNum)}` : '';
  return `Explain this ${error.category} error${location} in the following code.

Error: ${error.message}

Code:
\`\`\`
${code}
\`\`\`

Provide: 1. A brief summary, 2. The root cause, 3. 2-3 fix strategies`;
}

/** Build fix prompt. */
export function buildFixPrompt(
  code: string,
  error: ParsedError,
  explanation?: ErrorExplanation
): string {
  const explanationSection =
    explanation !== undefined
      ? `\nExplanation: ${explanation.summary}\nRoot Cause: ${explanation.rootCause}\n`
      : '';
  return `Fix this ${error.category} error in the code.

Error: ${error.message}
${explanationSection}
Code:
\`\`\`
${code}
\`\`\`

Provide ONLY the fixed code, no explanations.`;
}

/** Parse explanation from agent output. */
export function parseExplanation(errorId: string, output: string): ErrorExplanation {
  const rootCause = extractSection(output, 'root cause');
  return {
    errorId,
    summary: output.slice(0, 200),
    details: output,
    rootCause: rootCause !== undefined && rootCause.length > 0 ? rootCause : 'Unknown',
    fixStrategies: extractList(output),
    confidence: 0.7,
  };
}

/** Parse fix from agent output. */
export function parseFix(errorId: string, originalCode: string, output: string): CodeFix {
  const codeMatch = output.match(/```(?:\w+)?\n([\s\S]*?)```/);
  const extracted = codeMatch?.[1]?.trim();
  const fixedCode = extracted !== undefined && extracted.length > 0 ? extracted : output;
  return { errorId, originalCode, fixedCode, explanation: 'Generated fix', confidence: 0.7 };
}

/** Apply a code fix to the original code. */
export function applyFix(code: string, fix: CodeFix): string {
  const hasLocation = fix.location?.line !== undefined;
  const hasOriginal = fix.originalCode.length > 0;
  const hasFixed = fix.fixedCode.length > 0;
  if (hasLocation && hasOriginal && hasFixed) return code.replace(fix.originalCode, fix.fixedCode);
  return hasFixed ? fix.fixedCode : code;
}

/** Options for building iteration record. */
export interface IterationBuildOpts {
  readonly iteration: number;
  readonly code: string;
  readonly execution: ExecutionResult;
  readonly errors: ParsedError[];
  readonly explanations: ErrorExplanation[];
  readonly fixes: CodeFix[];
  readonly appliedFix: CodeFix | undefined;
  readonly startTime: number;
}

/** Options for building final result. */
export interface ResultBuildOpts {
  readonly success: boolean;
  readonly code: string;
  readonly execution: ExecutionResult;
  readonly history: DebugIteration[];
  readonly errorsFixed: ParsedError[];
  readonly stopReason: SelfDebugResult['stopReason'];
}

/** Build a debug iteration record. */
export function buildIteration(opts: IterationBuildOpts): DebugIteration {
  return {
    iteration: opts.iteration,
    codeSnapshot: opts.code,
    executionResult: opts.execution,
    errorsDetected: opts.errors,
    explanations: opts.explanations,
    proposedFixes: opts.fixes,
    appliedFix: opts.appliedFix,
    durationMs: Date.now() - opts.startTime,
  };
}

/** Build the final SelfDebugResult. */
export function buildResult(opts: ResultBuildOpts): SelfDebugResult {
  return {
    success: opts.success,
    finalCode: opts.code,
    finalExecution: opts.execution,
    totalIterations: opts.history.length,
    totalDurationMs: opts.history.reduce((sum, h) => sum + h.durationMs, 0),
    errorsFixed: opts.errorsFixed,
    errorsRemaining: opts.execution.errors,
    history: opts.history,
    stopReason: opts.stopReason,
  };
}

/** Type for code executor function. */
export type CodeExecutor = (code: string) => Promise<ExecutionResult>;

/** Execute code with error handling. */
export async function executeCode(executor: CodeExecutor, code: string): Promise<ExecutionResult> {
  try {
    return await executor(code);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, exitCode: 1, stdout: '', stderr: message, durationMs: 0, errors: [] };
  }
}

/** Parse errors from execution result using error patterns.
 * Validates patterns to prevent ReDoS (Issue #341).
 */
export function parseErrorsFromOutput(
  result: ExecutionResult,
  patterns: readonly ErrorPattern[]
): ParsedError[] {
  if (result.errors.length > 0) return [...result.errors];
  const errors: ParsedError[] = [];
  const output = result.stderr.length > 0 ? result.stderr : result.stdout;
  let errorId = 0;
  for (const pattern of patterns) {
    // Validate pattern to prevent ReDoS attacks (Issue #341)
    // ErrorPattern.pattern is already a RegExp, so we validate its source
    const patternSource = pattern.pattern.source;
    const validation = validatePattern(patternSource);
    if (!validation.ok) {
      // Skip dangerous patterns
      continue;
    }
    // Use the original RegExp with global+multiline flags
    const regex = new RegExp(pattern.pattern.source, 'gm');
    const matches = output.matchAll(regex);
    for (const match of matches) {
      errors.push(createParsedError(match, pattern, ++errorId));
    }
  }
  return errors;
}

/** Create a synthetic error when no pattern matches but execution failed. */
export function createSyntheticError(execution: ExecutionResult, iterNum: number): ParsedError {
  const stderr =
    execution.stderr.length > 0
      ? execution.stderr
      : execution.stdout.length > 0
        ? execution.stdout
        : 'Unknown error';
  return {
    id: `error-synthetic-${String(iterNum)}`,
    category: 'unknown',
    severity: 'error',
    message: stderr.slice(0, 500),
    rawError: stderr,
  };
}
