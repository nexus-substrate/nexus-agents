/**
 * Self-Debug Protocol Helpers
 *
 * Helper functions for error parsing and prompt building.
 * (Source: Issue #131, arXiv:2304.05128)
 */

import type { ParsedError, ErrorExplanation, CodeFix, ErrorPattern } from './self-debug-types.js';

/** Extract group from regex match. */
export function extractGroup(match: RegExpMatchArray, index?: number): string | undefined {
  return index !== undefined ? match[index] : undefined;
}

/** Extract numeric group from regex match. */
export function extractGroupNum(match: RegExpMatchArray, index?: number): number | undefined {
  const value = extractGroup(match, index);
  return value !== undefined ? parseInt(value, 10) : undefined;
}

/** Extract section from text. */
export function extractSection(text: string, sectionName: string): string | undefined {
  const regex = new RegExp(`${sectionName}[:\\s]+([^\\n]+)`, 'i');
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
