/**
 * nexus-agents/cli - Link Validator
 *
 * Validates markdown links in documentation files.
 * Checks internal file links, external HTTP links, and anchor references.
 *
 * @module cli/index-command-link-validator
 * (Source: Issue #396)
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// Re-export types for backward compatibility
export type {
  LinkType,
  LinkResult,
  FoundLink,
  FileValidationResult,
  BrokenLink,
  LinkValidationSummary,
  LinkValidationResult,
} from './index-command-link-types.js';

// Import types for internal use
import type {
  LinkType,
  FoundLink,
  BrokenLink,
  FileValidationResult,
  LinkValidationResult,
} from './index-command-link-types.js';

// Import validation helpers
import { validateLink } from './index-command-link-validation-helpers.js';

// Re-export validation helpers for backward compatibility
export {
  validateInternalLink,
  validateExternalLink,
  validateAnchorLink,
  validateLink,
} from './index-command-link-validation-helpers.js';

// =============================================================================
// Link Extraction
// =============================================================================

/** Regex for inline markdown links: [text](url) */
const INLINE_LINK_REGEX = /\[([^\]]*)\]\(([^)]+)\)/g;

/** Regex for reference-style links: [text][ref] */
const REFERENCE_LINK_REGEX = /\[([^\]]+)\]\[([^\]]*)\]/g;

/** Regex for reference definitions: [ref]: url */
const REFERENCE_DEF_REGEX = /^\[([^\]]+)\]:\s*(.+)$/gm;

/**
 * Recursively finds all markdown files in a directory.
 */
async function findMarkdownFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip node_modules and dist
      if (entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }

      if (entry.isDirectory()) {
        const nested = await findMarkdownFiles(fullPath);
        files.push(...nested);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist or isn't readable
  }

  return files;
}

/**
 * Determines the type of a link URL.
 */
function getLinkType(url: string): LinkType {
  if (url.startsWith('#')) {
    return 'anchor';
  }
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return 'external';
  }
  return 'internal';
}

/**
 * Checks if a URL should be skipped (mailto:, javascript:).
 */
/** Dangerous URL schemes that should not be followed. */
const DANGEROUS_SCHEME_REGEX =
  /^[\s\x00-\x1f\x7f]*(mailto|javascript|data|file|ftp)[\s\x00-\x1f\x7f]*:/i;

function shouldSkipUrl(url: string): boolean {
  // Use regex with embedded control-char tolerance to satisfy CodeQL
  // incomplete-url-scheme-check (CWE-79) (#1496).
  return DANGEROUS_SCHEME_REGEX.test(url);
}

/**
 * Builds a reference map from markdown reference definitions.
 */
function buildReferenceMap(content: string): Map<string, string> {
  const references = new Map<string, string>();
  let match: RegExpExecArray | null;
  while ((match = REFERENCE_DEF_REGEX.exec(content)) !== null) {
    const refKey = match[1];
    const refUrl = match[2];
    if (refKey !== undefined && refUrl !== undefined) {
      references.set(refKey.toLowerCase(), refUrl);
    }
  }
  return references;
}

/**
 * Extracts inline links from a single line.
 */
function extractInlineLinks(line: string, lineNum: number): FoundLink[] {
  const links: FoundLink[] = [];
  let inlineMatch: RegExpExecArray | null;
  const inlineRegex = new RegExp(INLINE_LINK_REGEX.source, 'g');
  while ((inlineMatch = inlineRegex.exec(line)) !== null) {
    const url = inlineMatch[2];
    const text = inlineMatch[1];
    if (url === undefined || text === undefined || shouldSkipUrl(url)) continue;
    links.push({
      url,
      type: getLinkType(url),
      line: lineNum,
      column: inlineMatch.index + 1,
      text,
    });
  }
  return links;
}

/**
 * Extracts reference links from a single line.
 */
function extractRefLinks(
  line: string,
  lineNum: number,
  references: Map<string, string>
): FoundLink[] {
  const links: FoundLink[] = [];
  let refMatch: RegExpExecArray | null;
  const refRegex = new RegExp(REFERENCE_LINK_REGEX.source, 'g');
  while ((refMatch = refRegex.exec(line)) !== null) {
    const refText = refMatch[1];
    const refId = refMatch[2];
    if (refText === undefined) continue;
    const refKey = (refId ?? refText).toLowerCase();
    const url = references.get(refKey);
    if (url !== undefined) {
      links.push({
        url,
        type: getLinkType(url),
        line: lineNum,
        column: refMatch.index + 1,
        text: refText,
      });
    }
  }
  return links;
}

/**
 * Extracts all links from markdown content.
 */
export function extractLinks(content: string): FoundLink[] {
  const links: FoundLink[] = [];
  const lines = content.split('\n');
  const references = buildReferenceMap(content);

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    if (line === undefined) continue;
    links.push(...extractInlineLinks(line, lineNum + 1));
    links.push(...extractRefLinks(line, lineNum + 1, references));
  }

  return links;
}

// =============================================================================
// Main Validation Function
// =============================================================================

/** Options for link validation. */
export interface ValidateLinkOptions {
  /** Base directory to search for markdown files. */
  readonly baseDir?: string;
  /** Whether to check external links. */
  readonly checkExternal?: boolean;
}

/** Mutable counters for link statistics. */
interface LinkCounters {
  totalLinks: number;
  brokenLinks: number;
  byType: {
    internal: { total: number; broken: number };
    external: { total: number; broken: number };
    anchor: { total: number; broken: number };
  };
}

/**
 * Validates all links in a single file.
 */
async function validateFileLinks(
  filePath: string,
  checkExternal: boolean,
  counters: LinkCounters
): Promise<FileValidationResult | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const links = extractLinks(content);
    const brokenLinksInFile: BrokenLink[] = [];

    for (const link of links) {
      counters.totalLinks++;
      counters.byType[link.type].total++;
      if (link.type === 'external' && !checkExternal) continue;

      const result = await validateLink(link, filePath);
      if (!result.valid) {
        counters.brokenLinks++;
        counters.byType[link.type].broken++;
        brokenLinksInFile.push({ ...link, error: result.error ?? 'Unknown error' });
      }
    }

    return { filePath, links, brokenLinks: brokenLinksInFile };
  } catch {
    return null;
  }
}

/**
 * Validates all links in markdown files.
 */
export async function validateLinks(
  options: ValidateLinkOptions = {}
): Promise<LinkValidationResult> {
  const files = await findMarkdownFiles(options.baseDir ?? 'docs');
  const counters: LinkCounters = {
    totalLinks: 0,
    brokenLinks: 0,
    byType: {
      internal: { total: 0, broken: 0 },
      external: { total: 0, broken: 0 },
      anchor: { total: 0, broken: 0 },
    },
  };

  const results: FileValidationResult[] = [];
  for (const filePath of files) {
    const result = await validateFileLinks(filePath, options.checkExternal ?? true, counters);
    if (result !== null) results.push(result);
  }

  return {
    files: results,
    summary: {
      totalFiles: files.length,
      totalLinks: counters.totalLinks,
      brokenLinks: counters.brokenLinks,
      byType: counters.byType,
    },
  };
}

// Re-export formatters for backward compatibility
export {
  formatLinkValidationTable,
  formatLinkValidationJson,
} from './index-command-link-formatters.js';
