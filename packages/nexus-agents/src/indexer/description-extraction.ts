/**
 * nexus-agents/indexer - Description Extraction
 *
 * JSDoc comment and description extraction utilities.
 *
 * (Source: Issue #240)
 */

import type { SourceFile } from 'ts-morph';
import { truncateSentence } from '../utils/text-utils.js';

/** Result of processing a single line in JSDoc extraction. */
type LineResult = 'start' | 'end' | 'stop' | 'skip' | 'content';

/** Determines how to handle a line during JSDoc extraction. */
function classifyJsDocLine(trimmed: string, inComment: boolean): LineResult {
  if (trimmed.startsWith('/**')) return 'start';
  if (trimmed.endsWith('*/')) return 'end';
  if (!inComment && trimmed.length > 0 && !trimmed.startsWith('//')) return 'stop';
  if (!inComment) return 'skip';
  if (trimmed.startsWith('* @') || trimmed.startsWith('@')) return 'skip';
  return 'content';
}

/** Extracts content from a JSDoc comment line (strips leading * and whitespace). */
function extractJsDocLineContent(trimmed: string): string {
  return trimmed.startsWith('*') ? trimmed.slice(1).trim() : trimmed;
}

/**
 * Truncates text to first sentence or max 150 chars.
 * Uses truncateSentence from utils/text-utils.ts.
 */
function truncateDescription(full: string): string {
  return truncateSentence(full, 150);
}

/**
 * Extracts a description from the file's leading comment or JSDoc.
 */
export function extractDescription(sourceFile: SourceFile): string | undefined {
  const lines = sourceFile.getFullText().split('\n');
  let inComment = false;
  const description: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const result = classifyJsDocLine(trimmed, inComment);

    if (result === 'start') {
      inComment = true;
      continue;
    }
    if (result === 'end' || result === 'stop') break;
    if (result === 'skip') continue;

    const content = extractJsDocLineContent(trimmed);
    if (content.length > 0) description.push(content);
  }

  if (description.length === 0) return undefined;
  return truncateDescription(description.join(' '));
}
