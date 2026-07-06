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
type LineResult = 'start' | 'startEnd' | 'end' | 'stop' | 'skip' | 'content';

/** True for a self-contained block comment that is not a JSDoc header (e.g. `/* eslint-disable *\/`). */
function isPlainBlockComment(trimmed: string): boolean {
  return trimmed.startsWith('/*') && trimmed.endsWith('*/');
}

/** Classifies a line encountered before any JSDoc block has been entered. */
function classifyOutsideComment(trimmed: string): LineResult {
  if (isPlainBlockComment(trimmed)) return 'skip';
  if (trimmed.length > 0 && !trimmed.startsWith('//')) return 'stop';
  return 'skip';
}

/** Classifies a line encountered inside an open JSDoc block. */
function classifyInsideComment(trimmed: string): LineResult {
  if (trimmed.endsWith('*/')) return 'end';
  if (trimmed.startsWith('* @') || trimmed.startsWith('@')) return 'skip';
  return 'content';
}

/** Determines how to handle a line during JSDoc extraction. */
function classifyJsDocLine(trimmed: string, inComment: boolean): LineResult {
  if (trimmed.startsWith('/**')) {
    // Single-line JSDoc header, e.g. `/** Utils. */` — opens and closes on
    // the same line, so it must not leave `inComment` dangling true.
    return trimmed.endsWith('*/') ? 'startEnd' : 'start';
  }
  return inComment ? classifyInsideComment(trimmed) : classifyOutsideComment(trimmed);
}

/** Extracts content from a JSDoc comment line (strips leading * and whitespace). */
function extractJsDocLineContent(trimmed: string): string {
  return trimmed.startsWith('*') ? trimmed.slice(1).trim() : trimmed;
}

/** Extracts the inner text of a single-line JSDoc header like `/** text *\/`. */
function extractInlineJsDocContent(trimmed: string): string {
  return trimmed.slice(3, -2).trim();
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
    if (result === 'startEnd') {
      const inline = extractInlineJsDocContent(trimmed);
      if (inline.length > 0) description.push(inline);
      break;
    }
    if (result === 'end' || result === 'stop') break;
    if (result === 'skip') continue;

    const content = extractJsDocLineContent(trimmed);
    if (content.length > 0) description.push(content);
  }

  if (description.length === 0) return undefined;
  return truncateDescription(description.join(' '));
}
