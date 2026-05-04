/**
 * nexus-agents/mcp - Compare Data Feeds Tool
 *
 * Diff two upstream data feeds (YAML or JSON) along configurable axes:
 * coverage (which entries exist in A, B, both) and per-field comparison
 * for matched entries.
 *
 * Use case: aegis-boot maintains a local catalog of bootable images and
 * cross-checks against upstream feeds (e.g., netboot.xyz/endpoints.yml).
 * This tool surfaces "what's new in A?", "what does B have that A
 * doesn't?", and "what fields differ between A and B for entries that
 * exist in both?".
 *
 * **v1 scope: file paths only.** URL-fetch mode is deferred — fetching
 * arbitrary user-supplied URLs needs an SSRF design pass. For now,
 * users curl the remote feed to a local file and pass the path.
 *
 * @module mcp/tools/compare-data-feeds
 * (Source: Issue #2297, child of #2293)
 */

import { z } from 'zod';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as yaml from 'yaml';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger, formatZodError } from '../../core/index.js';
import { withToolError } from '../middleware/tool-error-handler.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import {
  toolError,
  toolSuccessStructured,
  type ToolResult,
  type BaseMcpToolDeps,
} from './tool-result.js';

// =============================================================================
// Schemas
// =============================================================================

export const CompareDataFeedsInputSchema = z.object({
  feedAPath: z
    .string()
    .min(1)
    .max(1000)
    .describe('Filesystem path to feed A (YAML or JSON, auto-detected by extension)'),
  feedBPath: z.string().min(1).max(1000).describe('Filesystem path to feed B'),
  keyPath: z
    .string()
    .min(1)
    .max(200)
    .describe(
      'Dotted path to the entry key, e.g. "id" or "name". Each entry must have this field.'
    ),
  compareFields: z
    .array(z.string().min(1).max(200))
    .max(20)
    .optional()
    .describe(
      'Optional dotted field paths to compare across matched entries (e.g. ["license", "sha256"])'
    ),
});

export type CompareDataFeedsInput = z.infer<typeof CompareDataFeedsInputSchema>;

export interface FieldDifference {
  readonly key: string;
  readonly field: string;
  readonly valueA: unknown;
  readonly valueB: unknown;
}

export interface CompareDataFeedsResponse {
  readonly feedAPath: string;
  readonly feedBPath: string;
  readonly keyPath: string;
  readonly counts: {
    readonly entriesInA: number;
    readonly entriesInB: number;
    readonly onlyInA: number;
    readonly onlyInB: number;
    readonly inBoth: number;
    readonly fieldDifferences: number;
  };
  readonly coverage: {
    readonly onlyInA: readonly string[];
    readonly onlyInB: readonly string[];
    readonly inBoth: readonly string[];
  };
  readonly fieldDifferences: readonly FieldDifference[];
  readonly summary: string;
}

export type CompareDataFeedsDeps = BaseMcpToolDeps;

// =============================================================================
// Parsing + diffing (pure functions — fully testable without fs)
// =============================================================================

/** Read a value from a JS object via dotted path. Returns undefined if absent. */
export function readDottedPath(obj: unknown, dottedPath: string): unknown {
  const parts = dottedPath.split('.');
  let cursor: unknown = obj;
  for (const part of parts) {
    if (cursor === null || cursor === undefined) return undefined;
    if (typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

/** Parse YAML or JSON content; throws DiagnosticError on parse failure. */
export function parseFeedContent(content: string, sourcePath: string): unknown {
  const ext = path.extname(sourcePath).toLowerCase();
  if (ext === '.json') {
    return JSON.parse(content);
  }
  // Default to YAML for .yaml/.yml/anything else.
  return yaml.parse(content);
}

/** Normalise a parsed feed to an array of entries. Accepts top-level array
 * or top-level object with a single array-valued field. */
export function asEntryArray(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed !== null && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    const arrayValues = Object.values(obj).filter((v): v is unknown[] => Array.isArray(v));
    if (arrayValues.length === 1) {
      const first = arrayValues[0];
      if (first !== undefined) return first;
    }
  }
  throw new Error(
    'Feed must be a top-level array, or an object with exactly one array-valued field. ' +
      'Top-level objects with multiple array fields are ambiguous; flatten the feed first.'
  );
}

/** Build a key→entry map. Skips entries missing the key field but records
 * their indices so the caller can warn. */
export function indexByKey(
  entries: readonly unknown[],
  keyPath: string
): { readonly index: ReadonlyMap<string, unknown>; readonly missingKeyAt: readonly number[] } {
  const index = new Map<string, unknown>();
  const missingKeyAt: number[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const key = readDottedPath(entry, keyPath);
    if (key === undefined || key === null) {
      missingKeyAt.push(i);
      continue;
    }
    // Coerce to string for the map key. Reject non-primitives so we don't
    // get "[object Object]" silently — the caller passed the wrong key path.
    if (typeof key === 'object') {
      missingKeyAt.push(i);
      continue;
    }
    // Narrow to primitives that have a meaningful String() coercion. After
    // the typeof-object guard above, key is string | number | bigint | boolean.
    const keyStr =
      typeof key === 'string'
        ? key
        : typeof key === 'number'
          ? String(key)
          : typeof key === 'bigint'
            ? key.toString()
            : typeof key === 'boolean'
              ? String(key)
              : '';
    if (keyStr === '') {
      missingKeyAt.push(i);
      continue;
    }
    index.set(keyStr, entry);
  }
  return { index, missingKeyAt };
}

interface DiffResult {
  readonly onlyInA: string[];
  readonly onlyInB: string[];
  readonly inBoth: string[];
}

/** Membership diff. */
export function membershipDiff(
  indexA: ReadonlyMap<string, unknown>,
  indexB: ReadonlyMap<string, unknown>
): DiffResult {
  const onlyInA: string[] = [];
  const onlyInB: string[] = [];
  const inBoth: string[] = [];
  for (const key of indexA.keys()) {
    if (indexB.has(key)) inBoth.push(key);
    else onlyInA.push(key);
  }
  for (const key of indexB.keys()) {
    if (!indexA.has(key)) onlyInB.push(key);
  }
  onlyInA.sort();
  onlyInB.sort();
  inBoth.sort();
  return { onlyInA, onlyInB, inBoth };
}

/** For each in-both key, compare the requested fields and report differences. */
export function compareFields(
  inBothKeys: readonly string[],
  indexA: ReadonlyMap<string, unknown>,
  indexB: ReadonlyMap<string, unknown>,
  fields: readonly string[]
): FieldDifference[] {
  const out: FieldDifference[] = [];
  for (const key of inBothKeys) {
    const a = indexA.get(key);
    const b = indexB.get(key);
    for (const field of fields) {
      const valueA = readDottedPath(a, field);
      const valueB = readDottedPath(b, field);
      if (!deepEqual(valueA, valueB)) {
        out.push({ key, field, valueA, valueB });
      }
    }
  }
  return out;
}

function deepEqualArrays(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => deepEqual(v, b[i]));
}

function deepEqualObjects(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  if (!aKeys.every((k, i) => k === bKeys[i])) return false;
  return aKeys.every((k) => deepEqual(a[k], b[k]));
}

/** Tight deep equality for the feed-diff use case (JSON-shaped values). */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) return deepEqualArrays(a, b);
  return deepEqualObjects(a as Record<string, unknown>, b as Record<string, unknown>);
}

function buildSummary(
  feedAPath: string,
  feedBPath: string,
  diff: DiffResult,
  fieldDiffs: readonly FieldDifference[],
  fields: readonly string[]
): string {
  const lines: string[] = [];
  lines.push(`Feed A: ${feedAPath} (${String(diff.onlyInA.length)} only-in-A)`);
  lines.push(`Feed B: ${feedBPath} (${String(diff.onlyInB.length)} only-in-B)`);
  lines.push(`In both: ${String(diff.inBoth.length)} entries`);
  if (fields.length > 0) {
    lines.push(
      `Field comparison across ${String(fields.length)} field(s) found ${String(fieldDiffs.length)} differences in ${String(diff.inBoth.length)} matched entries`
    );
  }
  return lines.join('\n');
}

// =============================================================================
// File loading + handler glue
// =============================================================================

function loadFeed(feedPath: string): unknown[] {
  const resolved = path.resolve(feedPath);
  const cwdRoot = path.resolve('.');
  if (!resolved.startsWith(cwdRoot)) {
    throw new Error(`Path traversal denied: ${feedPath} must be within ${cwdRoot}`);
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`Feed file not found: ${resolved}`);
  }
  const content = fs.readFileSync(resolved, 'utf-8');
  const parsed = parseFeedContent(content, resolved);
  return asEntryArray(parsed);
}

function executeCompare(input: CompareDataFeedsInput): CompareDataFeedsResponse {
  const entriesA = loadFeed(input.feedAPath);
  const entriesB = loadFeed(input.feedBPath);
  const indexA = indexByKey(entriesA, input.keyPath).index;
  const indexB = indexByKey(entriesB, input.keyPath).index;
  const diff = membershipDiff(indexA, indexB);
  const fields = input.compareFields ?? [];
  const fieldDiffs = compareFields(diff.inBoth, indexA, indexB, fields);

  return {
    feedAPath: input.feedAPath,
    feedBPath: input.feedBPath,
    keyPath: input.keyPath,
    counts: {
      entriesInA: indexA.size,
      entriesInB: indexB.size,
      onlyInA: diff.onlyInA.length,
      onlyInB: diff.onlyInB.length,
      inBoth: diff.inBoth.length,
      fieldDifferences: fieldDiffs.length,
    },
    coverage: {
      onlyInA: diff.onlyInA,
      onlyInB: diff.onlyInB,
      inBoth: diff.inBoth,
    },
    fieldDifferences: fieldDiffs,
    summary: buildSummary(input.feedAPath, input.feedBPath, diff, fieldDiffs, fields),
  };
}

function createCompareDataFeedsHandler(deps: CompareDataFeedsDeps) {
  return async (args: unknown, ctx: HandlerContext): Promise<ToolResult> => {
    const validation = CompareDataFeedsInputSchema.safeParse(args);
    if (!validation.success) {
      return toolError(`Validation error: ${formatZodError(validation.error)}`);
    }
    const logger = deps.logger ?? createLogger({ tool: 'compare_data_feeds' });
    ctx.logger.debug('Comparing data feeds', {
      feedAPath: validation.data.feedAPath,
      feedBPath: validation.data.feedBPath,
    });
    return withToolError('Compare data feeds failed', logger, () => {
      const result = executeCompare(validation.data);
      return Promise.resolve(toolSuccessStructured(result as unknown as Record<string, unknown>));
    });
  };
}

// =============================================================================
// Registration
// =============================================================================

const COMPARE_OUTPUT_SCHEMA = {
  feedAPath: z.string(),
  feedBPath: z.string(),
  keyPath: z.string(),
  counts: z.object({
    entriesInA: z.number(),
    entriesInB: z.number(),
    onlyInA: z.number(),
    onlyInB: z.number(),
    inBoth: z.number(),
    fieldDifferences: z.number(),
  }),
  coverage: z.object({
    onlyInA: z.array(z.string()),
    onlyInB: z.array(z.string()),
    inBoth: z.array(z.string()),
  }),
  fieldDifferences: z.array(z.unknown()),
  summary: z.string(),
};

const COMPARE_DESCRIPTION =
  'Diff two upstream data feeds (YAML or JSON files) along coverage and per-field axes. ' +
  'Returns which entries exist in A, B, both, plus optional field-level diffs across matched entries. ' +
  'v1 takes file paths only (no URL fetch — that needs an SSRF design pass). ' +
  'Both feeds must be a top-level array OR a top-level object with exactly one array field.';

export function registerCompareDataFeedsTool(server: McpServer, deps: CompareDataFeedsDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'compare_data_feeds' });
  const secureHandler = createSecureHandler(createCompareDataFeedsHandler(deps), {
    toolName: 'compare_data_feeds',
    rateLimiter: deps.rateLimiter,
    logger,
  });
  const timeoutMs = getToolTimeout('compare_data_feeds', deps.security);
  const wrappedHandler = wrapToolWithTimeout('compare_data_feeds', secureHandler, {
    timeoutMs,
    logger,
  });
  server.registerTool(
    'compare_data_feeds',
    {
      description: COMPARE_DESCRIPTION,
      inputSchema: CompareDataFeedsInputSchema.shape,
      outputSchema: COMPARE_OUTPUT_SCHEMA,
    },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered compare_data_feeds tool');
}
