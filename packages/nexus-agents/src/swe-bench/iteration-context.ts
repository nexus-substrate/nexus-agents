/**
 * nexus-agents/swe-bench - Cross-Iteration Context
 *
 * Accumulates structured context across SWE-bench retry iterations
 * so agents do not re-explore the codebase from scratch.
 *
 * @module swe-bench/iteration-context
 * (Source: Issue #1417 - Cross-Iteration Context)
 */

import type {
  IterationContext,
  ExploredFile,
  ApproachRecord,
  ApproachOutcome,
  FileRelevance,
} from './types.js';

/** Maximum number of approaches to retain in history. */
const MAX_APPROACH_HISTORY = 5;

/** Maximum chars for a hypothesis. */
const MAX_HYPOTHESIS_CHARS = 200;

/** Default max chars for formatted prompt context. */
const DEFAULT_MAX_CHARS = 2000;

// Bounded regex patterns (no unbounded .* or \s*)
const FILE_PATH_IN_BACKTICKS_RE =
  /`((?:src|lib|test|tests|pkg|cmd|internal)\/[a-zA-Z0-9_./-]{1,200})`/g;
const FILE_PATH_READING_RE =
  /(?:reading|read|opened|opening|file)\s{1,5}`?([a-zA-Z0-9_./-]{5,200}\.[a-z]{1,10})`?/gi;
const FILE_PATH_STANDALONE_RE =
  /(?:^|\s)((?:src|lib|test|tests)\/[a-zA-Z0-9_./-]{3,200}\.[a-z]{1,10})(?:\s|$|,|:)/gm;

const HYPOTHESIS_RE =
  /(?:the root cause is|the issue is|the problem is|this happens because)\s{1,3}([^.!?\n]{10,250})/i;

/**
 * Creates an empty cross-iteration context.
 */
export function createEmptyContext(): IterationContext {
  return {
    filesExplored: [],
    rootCauseHypothesis: null,
    approachHistory: [],
  };
}

/**
 * Assigns relevance based on context around file mention.
 */
function assignRelevance(path: string, response: string): FileRelevance {
  const lowerResponse = response.toLowerCase();
  const lowerPath = path.toLowerCase();
  const idx = lowerResponse.indexOf(lowerPath);
  if (idx === -1) return 'low';

  const surroundStart = Math.max(0, idx - 100);
  const surroundEnd = Math.min(lowerResponse.length, idx + path.length + 100);
  const surrounding = lowerResponse.slice(surroundStart, surroundEnd);

  if (/(?:root cause|bug|fix|patch|change|modify|edit)/i.test(surrounding)) {
    return 'high';
  }
  if (/(?:relevant|related|important|involved)/i.test(surrounding)) {
    return 'medium';
  }
  return 'low';
}

/**
 * Extracts file paths mentioned in an agent response.
 * Deduplicates by path.
 */
export function extractFilesFromResponse(response: string): ExploredFile[] {
  const seen = new Set<string>();
  const files: ExploredFile[] = [];

  const patterns = [FILE_PATH_IN_BACKTICKS_RE, FILE_PATH_READING_RE, FILE_PATH_STANDALONE_RE];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match = pattern.exec(response);
    while (match !== null) {
      const filePath = match[1];
      if (filePath !== undefined && filePath.length > 0 && !seen.has(filePath)) {
        seen.add(filePath);
        files.push({ path: filePath, relevance: assignRelevance(filePath, response) });
      }
      match = pattern.exec(response);
    }
  }

  return files;
}

/**
 * Extracts a root cause hypothesis from an agent response.
 * Returns null if none found. Truncates to 200 chars.
 */
export function extractHypothesis(response: string): string | null {
  HYPOTHESIS_RE.lastIndex = 0;
  const match = HYPOTHESIS_RE.exec(response);
  const captured = match?.[1];
  if (captured === undefined) return null;

  const raw = captured.trim();
  if (raw.length <= MAX_HYPOTHESIS_CHARS) return raw;
  return raw.slice(0, MAX_HYPOTHESIS_CHARS);
}

/**
 * Determines approach outcome from iteration results.
 */
function determineOutcome(hadPatch: boolean, patchApplied: boolean): ApproachOutcome {
  if (!hadPatch) return 'no_patch';
  if (!patchApplied) return 'patch_rejected';
  return 'success';
}

/**
 * Summarizes the approach from an agent response (first 120 chars).
 */
function summarizeApproach(response: string): string {
  const lines = response.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length >= 20 && !trimmed.startsWith('```') && !trimmed.startsWith('#')) {
      return trimmed.length > 120 ? trimmed.slice(0, 120) : trimmed;
    }
  }
  return 'Unstructured response';
}

/**
 * Extracts an approach record from agent response and iteration metadata.
 */
/** Extract a concise error hint from agent response for failed iterations. */
function extractErrorHint(response: string, maxLen: number = 200): string {
  // Look for error/traceback patterns in agent output
  const errorMatch = /(?:Error|Exception|Traceback|FAILED|AssertionError)[^\n]{0,200}/i.exec(
    response
  );
  if (errorMatch !== null) return errorMatch[0].slice(0, maxLen);
  // Look for "the test still fails" or similar
  const failMatch = /(?:still fails|test.*fail|doesn't work|incorrect)[^\n]{0,100}/i.exec(response);
  if (failMatch !== null) return failMatch[0].slice(0, maxLen);
  return '';
}

export function extractApproach(
  response: string,
  iteration: number,
  hadPatch: boolean,
  patchApplied: boolean
): ApproachRecord {
  const outcome = determineOutcome(hadPatch, patchApplied);
  const approach = summarizeApproach(response);

  const base: ApproachRecord = { iteration, approach, outcome };
  if (outcome === 'no_patch' || outcome === 'patch_rejected') {
    const hint = extractErrorHint(response);
    const summary =
      hint.length > 0
        ? `Iteration ${iteration.toString()}: ${outcome} — ${hint}`
        : `Iteration ${iteration.toString()}: ${outcome}`;
    return { ...base, errorSummary: summary };
  }
  return base;
}

/**
 * Merges new findings into existing context.
 * Deduplicates files. Keeps last MAX_APPROACH_HISTORY approaches.
 */
export function updateContext(
  prev: IterationContext,
  response: string,
  iteration: number,
  hadPatch: boolean,
  patchApplied: boolean
): IterationContext {
  const newFiles = extractFilesFromResponse(response);
  const existingPaths = new Set(prev.filesExplored.map((f) => f.path));
  const merged = [...prev.filesExplored];
  for (const file of newFiles) {
    if (!existingPaths.has(file.path)) {
      merged.push(file);
      existingPaths.add(file.path);
    }
  }

  const newHypothesis = extractHypothesis(response);
  const hypothesis = newHypothesis ?? prev.rootCauseHypothesis;

  const approach = extractApproach(response, iteration, hadPatch, patchApplied);
  const history = [...prev.approachHistory, approach].slice(-MAX_APPROACH_HISTORY);

  return {
    filesExplored: merged,
    rootCauseHypothesis: hypothesis,
    approachHistory: history,
  };
}

function formatFilesList(files: readonly ExploredFile[]): string[] {
  const parts: string[] = ['**Files explored:**'];
  const highFiles = files.filter((f) => f.relevance === 'high');
  const medFiles = files.filter((f) => f.relevance === 'medium');
  const lowFiles = files.filter((f) => f.relevance === 'low');
  for (const f of highFiles) parts.push(`- \`${f.path}\` (high relevance)`);
  for (const f of medFiles) parts.push(`- \`${f.path}\` (medium)`);
  if (lowFiles.length > 0) {
    parts.push(`- ${lowFiles.length.toString()} other files explored`);
  }
  parts.push('');
  return parts;
}

/**
 * Formats context as markdown for inclusion in a retry prompt.
 * Returns empty string for empty context.
 */
export function formatContextForPrompt(
  ctx: IterationContext,
  maxChars: number = DEFAULT_MAX_CHARS
): string {
  if (ctx.filesExplored.length === 0 && ctx.approachHistory.length === 0) {
    return '';
  }

  const parts: string[] = [];

  if (ctx.rootCauseHypothesis !== null) {
    parts.push(`**Root cause hypothesis:** ${ctx.rootCauseHypothesis}`, '');
  }

  if (ctx.filesExplored.length > 0) {
    parts.push(...formatFilesList(ctx.filesExplored));
  }

  if (ctx.approachHistory.length > 0) {
    parts.push('**Previous approaches:**');
    for (const a of ctx.approachHistory) {
      parts.push(`- Iteration ${a.iteration.toString()}: ${a.outcome} - ${a.approach}`);
    }
  }

  let result = parts.join('\n');
  if (result.length > maxChars) {
    result = result.slice(0, maxChars - 3) + '...';
  }
  return result;
}
