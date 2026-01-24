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
function shouldSkipUrl(url: string): boolean {
  return url.startsWith('mailto:') || url.startsWith('javascript:');
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
// Link Validation
// =============================================================================

/**
 * Validates an internal file link.
 */
async function validateInternalLink(
  url: string,
  sourceFile: string
): Promise<{ valid: boolean; error?: string }> {
  // Remove anchor portion for file check
  const [filePath, anchor] = url.split('#');
  if (filePath === undefined || filePath === '') {
    // Pure anchor link, would need content parsing
    return { valid: true };
  }

  // Resolve relative to source file
  const resolvedPath = path.resolve(path.dirname(sourceFile), filePath);

  try {
    await fs.access(resolvedPath);
    // TODO: If anchor present, validate heading exists
    if (anchor !== undefined) {
      // For now, just check file exists
    }
    return { valid: true };
  } catch {
    return { valid: false, error: `File not found: ${resolvedPath}` };
  }
}

/**
 * Validates an external HTTP link.
 */
async function validateExternalLink(
  url: string,
  timeoutMs = 5000
): Promise<{ valid: boolean; error?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'User-Agent': 'nexus-agents-link-validator/1.0',
      },
      redirect: 'follow',
    });

    clearTimeout(timeout);

    if (response.ok) {
      return { valid: true };
    }

    // Some servers don't support HEAD, try GET
    if (response.status === 405) {
      const getController = new AbortController();
      const getTimeout = setTimeout(() => {
        getController.abort();
      }, timeoutMs);

      const getResponse = await fetch(url, {
        method: 'GET',
        signal: getController.signal,
        headers: {
          'User-Agent': 'nexus-agents-link-validator/1.0',
        },
        redirect: 'follow',
      });

      clearTimeout(getTimeout);

      if (getResponse.ok) {
        return { valid: true };
      }
      return { valid: false, error: `HTTP ${String(getResponse.status)}` };
    }

    return { valid: false, error: `HTTP ${String(response.status)}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('abort')) {
      return { valid: false, error: 'Timeout' };
    }
    return { valid: false, error: message };
  }
}

/**
 * Validates an anchor link within a file.
 */
async function validateAnchorLink(
  anchor: string,
  sourceFile: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const content = await fs.readFile(sourceFile, 'utf-8');
    const headingId = anchor.slice(1); // Remove leading #

    // Check for headings that would create this anchor
    const headingRegex = /^#{1,6}\s+(.+)$/gm;
    let match: RegExpExecArray | null;
    while ((match = headingRegex.exec(content)) !== null) {
      const heading = match[1];
      if (heading === undefined) continue;
      // Convert heading to GitHub-style anchor
      const expectedAnchor = heading
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-');
      if (expectedAnchor === headingId) {
        return { valid: true };
      }
    }

    return { valid: false, error: `Anchor not found: ${anchor}` };
  } catch {
    return { valid: false, error: 'Failed to read file for anchor check' };
  }
}

/**
 * Validates a single link.
 */
async function validateLink(
  link: FoundLink,
  sourceFile: string
): Promise<{ valid: boolean; error?: string }> {
  switch (link.type) {
    case 'internal':
      return validateInternalLink(link.url, sourceFile);
    case 'external':
      return validateExternalLink(link.url);
    case 'anchor':
      return validateAnchorLink(link.url, sourceFile);
  }
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
