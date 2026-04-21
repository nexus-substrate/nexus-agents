/**
 * Research Registry CSV Import Command
 *
 * Bulk imports research entries from a CSV file into the registry.
 * Supports papers (added to papers.yaml) and sources (added to sources.yaml).
 *
 * CSV columns: title, url, type (paper|repo|tool|blog), topic, description
 *
 * @module cli/research-import-command
 * @see Issue #1599
 */

import * as fs from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Result } from '../core/result.js';
import { loadPapersRegistry, savePapersRegistry } from './research-helpers-io.js';
import type { PaperEntry } from './research-types.js';
import {
  loadSourcesRegistry,
  saveSourcesRegistry,
  type SourceEntry,
} from './research-helpers-sources-io.js';

// =============================================================================
// TYPES
// =============================================================================

/** Valid entry types in the CSV. */
export type CsvEntryType = 'paper' | 'repo' | 'tool' | 'blog';

const VALID_TYPES: readonly CsvEntryType[] = ['paper', 'repo', 'tool', 'blog'];

/** A single parsed CSV row. */
export interface CsvRow {
  readonly title: string;
  readonly url: string;
  readonly type: CsvEntryType;
  readonly topic: string;
  readonly description: string;
}

/** Import options. */
export interface ResearchImportOptions {
  readonly csvPath: string;
  readonly dryRun?: boolean;
  readonly rootDir?: string;
}

/** Per-row import outcome. */
export interface RowOutcome {
  readonly row: number;
  readonly title: string;
  readonly status: 'added' | 'skipped' | 'error';
  readonly reason?: string;
}

/** Import result summary. */
export interface ImportResult {
  readonly added: number;
  readonly skipped: number;
  readonly errors: number;
  readonly outcomes: readonly RowOutcome[];
  readonly message: string;
}

// =============================================================================
// CSV PARSING
// =============================================================================

/**
 * Parse a single CSV line with basic quote handling.
 * Handles double-quoted fields containing commas.
 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        const next = line[i + 1];
        if (next === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/** Validate a URL string (basic check). */
function isValidUrl(value: string): boolean {
  return /^https?:\/\/.+/.test(value);
}

/** Validate entry type. */
function isValidType(value: string): value is CsvEntryType {
  return (VALID_TYPES as readonly string[]).includes(value);
}

/** Validate a single CSV data row. Returns a CsvRow or an error string. */
function validateRow(
  fields: string[],
  colIndex: Record<string, number>,
  rowNum: number
): CsvRow | string {
  const title = fields[colIndex['title'] as number] ?? '';
  const url = fields[colIndex['url'] as number] ?? '';
  const rawType = (fields[colIndex['type'] as number] ?? '').toLowerCase();
  const topic = fields[colIndex['topic'] as number] ?? '';
  const description = fields[colIndex['description'] as number] ?? '';

  if (title === '') return `Row ${String(rowNum)}: missing title`;
  if (!isValidUrl(url)) return `Row ${String(rowNum)}: invalid URL "${url}"`;
  if (!isValidType(rawType)) {
    return `Row ${String(rowNum)}: invalid type "${rawType}" (expected: ${VALID_TYPES.join(', ')})`;
  }
  if (topic === '') return `Row ${String(rowNum)}: missing topic`;
  return { title, url, type: rawType, topic, description };
}

/** Parse and validate CSV header. Returns column index map or error. */
function parseHeader(headerLine: string): Result<Record<string, number>, { message: string }> {
  const header = parseCsvLine(headerLine).map((h) => h.toLowerCase());
  const required = ['title', 'url', 'type', 'topic', 'description'];
  const missing = required.filter((col) => !header.includes(col));
  if (missing.length > 0) {
    return { ok: false, error: { message: `Missing CSV columns: ${missing.join(', ')}` } };
  }
  const colIndex = Object.fromEntries(required.map((col) => [col, header.indexOf(col)]));
  return { ok: true, value: colIndex };
}

/**
 * Parse CSV content into validated rows.
 * First line must be header: title,url,type,topic,description
 */
export function parseCsvContent(content: string): Result<CsvRow[], { message: string }> {
  const lines = content.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) {
    return {
      ok: false,
      error: { message: 'CSV must have a header row and at least one data row' },
    };
  }

  const headerResult = parseHeader(lines[0] as string);
  if (!headerResult.ok) return headerResult;

  const rows: CsvRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i] as string);
    const result = validateRow(fields, headerResult.value, i + 1);
    if (typeof result === 'string') {
      errors.push(result);
    } else {
      rows.push(result);
    }
  }

  if (errors.length > 0 && rows.length === 0) {
    return { ok: false, error: { message: errors.join('\n') } };
  }

  return { ok: true, value: rows };
}

// =============================================================================
// REGISTRY OPERATIONS
// =============================================================================

/** Generate a URL-safe ID from a title. */
export function generateIdFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

/** Map CSV type to sources.yaml type. */
function mapToSourceType(csvType: CsvEntryType): SourceEntry['type'] {
  switch (csvType) {
    case 'repo':
      return 'open_source_repo';
    case 'tool':
      return 'code_analysis';
    case 'blog':
      return 'research_blog';
    default:
      return 'code_analysis';
  }
}

/**
 * Execute the CSV import into the research registry.
 */
export async function executeImport(options: ResearchImportOptions): Promise<ImportResult> {
  const csvPath = resolve(options.csvPath);

  let content: string;
  try {
    content = await fs.readFile(csvPath, 'utf-8');
  } catch {
    return buildResult(
      [],
      [{ row: 0, title: '', status: 'error', reason: `Cannot read file: ${csvPath}` }]
    );
  }

  const parseResult = parseCsvContent(content);
  if (!parseResult.ok) {
    return buildResult(
      [],
      [{ row: 0, title: '', status: 'error', reason: parseResult.error.message }]
    );
  }

  const rows = parseResult.value;
  const outcomes: RowOutcome[] = [];
  const rootDir = options.rootDir;

  // Separate papers from sources
  const paperRows = rows.filter((r) => r.type === 'paper');
  const sourceRows = rows.filter((r) => r.type !== 'paper');

  // Process papers
  if (paperRows.length > 0) {
    await processPaperRows(paperRows, outcomes, options.dryRun === true, rootDir);
  }

  // Process sources
  if (sourceRows.length > 0) {
    await processSourceRows(sourceRows, outcomes, options.dryRun === true, rootDir);
  }

  return buildResult(rows, outcomes);
}

/** Build a PaperEntry from a CSV row. */
function buildPaperEntry(row: CsvRow): PaperEntry {
  return {
    title: row.title,
    url: row.url,
    source: 'preprint' as const,
    arxiv_id: '',
    publication_date: '',
    venue: null,
    reviewed_date: '',
    reviewed_in: '',
    topics: [row.topic],
    summary: row.description,
    relevance: 'medium' as const,
    implementation_status: 'not-started' as const,
    tags: [],
    authors: [],
    key_findings: [],
    techniques_extracted: [],
    related_issues: [],
  };
}

/** Collect new paper entries, skipping duplicates. */
function collectNewPapers(
  rows: readonly CsvRow[],
  existingUrls: Set<string>,
  existingTitles: Set<string>,
  outcomes: RowOutcome[]
): Record<string, PaperEntry> {
  const newPapers: Record<string, PaperEntry> = {};
  for (const row of rows) {
    if (existingUrls.has(row.url) || existingTitles.has(row.title.toLowerCase())) {
      outcomes.push({ row: 0, title: row.title, status: 'skipped', reason: 'Already exists' });
      continue;
    }
    newPapers[generateIdFromTitle(row.title)] = buildPaperEntry(row);
    existingTitles.add(row.title.toLowerCase());
    outcomes.push({ row: 0, title: row.title, status: 'added' });
  }
  return newPapers;
}

/** Process paper-type rows into papers.yaml. */
async function processPaperRows(
  rows: readonly CsvRow[],
  outcomes: RowOutcome[],
  dryRun: boolean,
  rootDir?: string
): Promise<void> {
  const loadResult = await loadPapersRegistry(rootDir);
  if (!loadResult.ok) {
    for (const row of rows) {
      outcomes.push({
        row: 0,
        title: row.title,
        status: 'error',
        reason: 'Failed to load papers registry',
      });
    }
    return;
  }

  const registry = loadResult.value;
  const existingUrls = new Set(
    Object.values(registry.papers)
      .map((p) => p.url)
      .filter(Boolean)
  );
  const existingTitles = new Set(Object.values(registry.papers).map((p) => p.title.toLowerCase()));
  const newPapers = collectNewPapers(rows, existingUrls, existingTitles, outcomes);

  if (!dryRun && Object.keys(newPapers).length > 0) {
    const updated = { ...registry, papers: { ...registry.papers, ...newPapers } };
    await savePapersRegistry(updated, rootDir);
  }
}

/** Process source-type rows into sources.yaml. */
async function processSourceRows(
  rows: readonly CsvRow[],
  outcomes: RowOutcome[],
  dryRun: boolean,
  rootDir?: string
): Promise<void> {
  const loadResult = await loadSourcesRegistry(rootDir);
  if (!loadResult.ok) {
    for (const row of rows) {
      outcomes.push({
        row: 0,
        title: row.title,
        status: 'error',
        reason: 'Failed to load sources registry',
      });
    }
    return;
  }

  const registry = loadResult.value;
  const existingUrls = new Set(Object.values(registry.sources).map((s) => s.url));
  const newSources: Record<string, SourceEntry> = {};

  for (const row of rows) {
    if (existingUrls.has(row.url)) {
      outcomes.push({ row: 0, title: row.title, status: 'skipped', reason: 'Already exists' });
      continue;
    }

    const sourceId = generateIdFromTitle(row.title);
    const today = new Date().toISOString().slice(0, 10);
    newSources[sourceId] = {
      name: row.title,
      type: mapToSourceType(row.type),
      url: row.url,
      topics: [row.topic],
      reviewed_date: today,
    };
    existingUrls.add(row.url);
    outcomes.push({ row: 0, title: row.title, status: 'added' });
  }

  if (!dryRun && Object.keys(newSources).length > 0) {
    const updated = {
      ...registry,
      sources: { ...registry.sources, ...newSources },
    };
    await saveSourcesRegistry(updated, rootDir);
  }
}

/** Build final import result from outcomes. */
function buildResult(_rows: readonly CsvRow[], outcomes: readonly RowOutcome[]): ImportResult {
  const added = outcomes.filter((o) => o.status === 'added').length;
  const skipped = outcomes.filter((o) => o.status === 'skipped').length;
  const errors = outcomes.filter((o) => o.status === 'error').length;

  const lines: string[] = [
    `Import complete: ${String(added)} added, ${String(skipped)} skipped, ${String(errors)} errors`,
  ];
  for (const o of outcomes) {
    const suffix = o.reason !== undefined ? ` (${o.reason})` : '';
    lines.push(`  [${o.status}] ${o.title}${suffix}`);
  }

  return { added, skipped, errors, outcomes, message: lines.join('\n') };
}

// =============================================================================
// CLI HANDLER
// =============================================================================

/**
 * Handle the `research import <csv-file>` subcommand.
 */
export async function handleImportCommand(
  args: string[],
  options: Record<string, unknown>
): Promise<string> {
  const csvPath = args[0];
  if (csvPath === undefined || csvPath === '') {
    return 'Error: CSV file path is required. Usage: nexus-agents research import <csv-file> [--dryRun]';
  }

  const dryRun = options['dryRun'] === true;
  const result = await executeImport({ csvPath, dryRun });

  if (dryRun) {
    return `[DRY RUN] ${result.message}`;
  }
  return result.message;
}
