/**
 * Spec Parser — parses markdown specifications into typed structures.
 *
 * Entry point for autonomous implementation: specs are the deliverable.
 * Extracts structured data from markdown sections, issue references,
 * and file references.
 *
 * @module orchestration/spec-parser
 * (Source: Issue #847 — Phase 2 of AI Software Factory Epic #843)
 */

import type { Result } from '../core/index.js';
import { ok, err } from '../core/index.js';
import type {
  ParsedSpec,
  SpecParseError,
  IssueReference,
  FileReference,
} from './spec-parser-types.js';

/** Regex for GitHub issue/PR references: #123 */
const ISSUE_REF_PATTERN = /(?:^|[^&])#(\d+)/g;

/** Regex for file path references: `src/foo.ts` or `src/foo.ts:42` */
const FILE_REF_PATTERN = /`([a-zA-Z0-9_./-]+\.[a-zA-Z]+(?::(\d+))?)`/g;

/** Section heading pattern: ## Section Name or # Section Name */
const HEADING_PATTERN = /^(#{1,3})\s+(\S[^\n]{0,500})$/;

/**
 * Parses a markdown specification into a typed ParsedSpec structure.
 *
 * Extracts title, overview, requirements, acceptance criteria, constraints,
 * and references from a well-structured markdown document.
 */
export function parseSpec(markdown: string): Result<ParsedSpec, SpecParseError> {
  if (markdown.trim().length === 0) {
    return err({ message: 'Spec is empty' });
  }

  const lines = markdown.split('\n');
  const title = extractTitle(lines);
  if (title === undefined) {
    return err({ message: 'No title heading found (expected # or ## heading)' });
  }

  const sections = extractSections(lines);
  const overview = extractOverview(sections);
  const requirements = extractListItems(sections, ['requirements']);
  const criteria = extractListItems(sections, ['acceptance criteria', 'acceptance_criteria']);
  const constraints = extractListItems(sections, ['constraints', 'limitations']);

  const missingSections = detectMissingSections(overview, requirements, criteria);
  const issueReferences = extractIssueReferences(markdown);
  const fileReferences = extractFileReferences(markdown);

  return ok({
    title,
    overview,
    requirements,
    acceptanceCriteria: criteria,
    constraints,
    issueReferences,
    fileReferences,
    missingSections,
    rawMarkdown: markdown,
  });
}

/** Extracts the first H1 or H2 heading as the title. */
function extractTitle(lines: string[]): string | undefined {
  for (const line of lines) {
    const match = HEADING_PATTERN.exec(line.trim());
    if (match !== null) {
      const level = match[1];
      const text = match[2]?.trim();
      if ((level === '#' || level === '##') && text !== undefined && text.length > 0) {
        return text;
      }
    }
  }
  return undefined;
}

/** Parses markdown into a map of section heading → content lines. */
function extractSections(lines: string[]): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  let currentSection = '_preamble';
  sections.set(currentSection, []);

  for (const line of lines) {
    const match = HEADING_PATTERN.exec(line.trim());
    if (match?.[2] !== undefined) {
      // Skip H1 headings — they are document titles, not content sections
      if (match[1] === '#') continue;
      currentSection = match[2].trim().toLowerCase();
      if (!sections.has(currentSection)) {
        sections.set(currentSection, []);
      }
      continue;
    }
    const sectionLines = sections.get(currentSection);
    if (sectionLines !== undefined) {
      sectionLines.push(line);
    }
  }

  return sections;
}

/** Gets overview text from matching sections. */
function extractOverview(sections: Map<string, string[]>): string {
  const keys = ['overview', 'goal', 'description', 'summary'];
  for (const key of keys) {
    const content = sections.get(key);
    if (content !== undefined && content.length > 0) {
      return joinNonEmpty(content);
    }
  }
  // Fall back to preamble (text before first heading)
  const preamble = sections.get('_preamble');
  if (preamble !== undefined) return joinNonEmpty(preamble);
  return '';
}

/** Extracts list items (- or * or [ ]) from matching sections. */
function extractListItems(sections: Map<string, string[]>, keys: string[]): string[] {
  const items: string[] = [];
  for (const key of keys) {
    const content = sections.get(key);
    if (content === undefined) continue;
    for (const line of content) {
      const trimmed = line.trim();
      // Match: - item, * item, - [ ] item, - [x] item, 1. item
      const listMatch = /^(?:[-*]|\d+\.)\s+(?:\[[ x]]\s+)?(\S[^\n]{0,500})$/.exec(trimmed);
      if (listMatch?.[1] !== undefined) {
        items.push(listMatch[1].trim());
      }
    }
  }
  return items;
}

/** Detects which recommended sections are missing. */
function detectMissingSections(
  overview: string,
  requirements: string[],
  criteria: string[]
): string[] {
  const missing: string[] = [];
  if (overview.length === 0) missing.push('overview');
  if (requirements.length === 0) missing.push('requirements');
  if (criteria.length === 0) missing.push('acceptance criteria');
  return missing;
}

/** Extracts #123-style issue references. */
function extractIssueReferences(markdown: string): IssueReference[] {
  const refs: IssueReference[] = [];
  const seen = new Set<number>();
  let match: RegExpExecArray | null;
  // Reset lastIndex for global regex
  ISSUE_REF_PATTERN.lastIndex = 0;
  while ((match = ISSUE_REF_PATTERN.exec(markdown)) !== null) {
    const num = parseInt(match[1] ?? '0', 10);
    if (num > 0 && !seen.has(num)) {
      seen.add(num);
      refs.push({ number: num, raw: `#${String(num)}` });
    }
  }
  return refs;
}

/** Extracts `file/path.ext` and `file/path.ext:42` references. */
function extractFileReferences(markdown: string): FileReference[] {
  const refs: FileReference[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  FILE_REF_PATTERN.lastIndex = 0;
  while ((match = FILE_REF_PATTERN.exec(markdown)) !== null) {
    const path = match[1];
    if (path === undefined || seen.has(path)) continue;
    seen.add(path);
    const lineStr = match[2];
    const line = lineStr !== undefined ? parseInt(lineStr, 10) : undefined;
    refs.push(line !== undefined ? { path, line } : { path });
  }
  return refs;
}

/** Joins non-empty lines with newlines, trimming result. */
function joinNonEmpty(lines: string[]): string {
  return lines
    .map((l) => l.trimEnd())
    .join('\n')
    .trim();
}
