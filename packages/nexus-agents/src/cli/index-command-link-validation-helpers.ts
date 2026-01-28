/**
 * nexus-agents/cli - Link Validation Helpers
 *
 * Helper functions for validating different types of markdown links:
 * - Internal file links
 * - External HTTP links
 * - Anchor references
 *
 * @module cli/index-command-link-validation-helpers
 * (Source: Issue #396)
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { FoundLink } from './index-command-link-types.js';

/** Result of validating a single link. */
export interface LinkValidationHelperResult {
  readonly valid: boolean;
  readonly error?: string;
}

/**
 * Validates an internal file link.
 *
 * Resolves the path relative to the source file and checks if the target exists.
 * Anchor portions are noted but file-level validation takes precedence.
 */
export async function validateInternalLink(
  url: string,
  sourceFile: string
): Promise<LinkValidationHelperResult> {
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
    // If anchor present, validate heading exists in target file (Issue #450)
    if (anchor !== undefined && anchor !== '') {
      const anchorResult = await validateAnchorInFile(anchor, resolvedPath);
      if (!anchorResult.valid) {
        return anchorResult;
      }
    }
    return { valid: true };
  } catch {
    return { valid: false, error: `File not found: ${resolvedPath}` };
  }
}

/**
 * Validates an external HTTP link.
 *
 * Uses HEAD request first, falls back to GET if HEAD returns 405.
 * Includes timeout handling and proper abort controller cleanup.
 */
export async function validateExternalLink(
  url: string,
  timeoutMs = 5000
): Promise<LinkValidationHelperResult> {
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
      return await validateExternalLinkWithGet(url, timeoutMs);
    }

    return { valid: false, error: `HTTP ${String(response.status)}` };
  } catch (err) {
    return handleFetchError(err);
  }
}

/**
 * Fallback GET request for servers that don't support HEAD.
 */
async function validateExternalLinkWithGet(
  url: string,
  timeoutMs: number
): Promise<LinkValidationHelperResult> {
  const getController = new AbortController();
  const getTimeout = setTimeout(() => {
    getController.abort();
  }, timeoutMs);

  try {
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
  } catch (err) {
    clearTimeout(getTimeout);
    return handleFetchError(err);
  }
}

/**
 * Handles fetch errors, distinguishing timeouts from other errors.
 */
function handleFetchError(err: unknown): LinkValidationHelperResult {
  const message = err instanceof Error ? err.message : 'Unknown error';
  if (message.includes('abort')) {
    return { valid: false, error: 'Timeout' };
  }
  return { valid: false, error: message };
}

/**
 * Converts a heading text to GitHub-style anchor ID.
 * Matches GitHub's algorithm: lowercase, remove special chars, spaces to hyphens.
 */
function headingToAnchor(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');
}

/**
 * Validates an anchor exists in a target file.
 * Used by validateInternalLink for links like file.md#section.
 * (Source: Issue #450)
 */
async function validateAnchorInFile(
  anchor: string,
  targetFile: string
): Promise<LinkValidationHelperResult> {
  try {
    const content = await fs.readFile(targetFile, 'utf-8');
    const headingRegex = /^#{1,6}\s+(.+)$/gm;
    let match: RegExpExecArray | null;

    while ((match = headingRegex.exec(content)) !== null) {
      const heading = match[1];
      if (heading !== undefined && headingToAnchor(heading) === anchor) {
        return { valid: true };
      }
    }

    return { valid: false, error: `Anchor '#${anchor}' not found in ${path.basename(targetFile)}` };
  } catch {
    return { valid: false, error: `Failed to read ${path.basename(targetFile)} for anchor check` };
  }
}

/**
 * Validates an anchor link within a file.
 *
 * Reads the file content and searches for headings that would
 * produce the expected GitHub-style anchor ID.
 */
export async function validateAnchorLink(
  anchor: string,
  sourceFile: string
): Promise<LinkValidationHelperResult> {
  const headingId = anchor.slice(1); // Remove leading #
  return validateAnchorInFile(headingId, sourceFile);
}

/**
 * Validates a single link based on its type.
 *
 * Routes to the appropriate validation function based on link type.
 */
export async function validateLink(
  link: FoundLink,
  sourceFile: string
): Promise<LinkValidationHelperResult> {
  switch (link.type) {
    case 'internal':
      return validateInternalLink(link.url, sourceFile);
    case 'external':
      return validateExternalLink(link.url);
    case 'anchor':
      return validateAnchorLink(link.url, sourceFile);
  }
}
