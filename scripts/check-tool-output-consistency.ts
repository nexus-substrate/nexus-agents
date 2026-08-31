#!/usr/bin/env npx tsx
/* eslint-disable no-console */
/**
 * Tool-Output Consistency Lint (#2653, Epic B — reframed).
 *
 * #2653 originally proposed a runtime PostToolUse normalization layer.
 * Codebase research refuted its premise — memory backends already return
 * uniform `Date` objects, no conflicting status taxonomies, no pagination
 * envelopes. So #2653 ships as a *preventive* lint instead of a corrective
 * runtime layer: catch a NEW tool diverging from the shapes the codebase
 * converged on, rather than paper over divergence at runtime.
 *
 * Current rule: a timestamp-named field (`*At`, `*Date`, `timestamp`) in an
 * MCP tool file must NOT be typed as a bare `number` / `z.number()` — use
 * an ISO-8601 `z.string()` or a `Date`. (A voter once compared an epoch-ms
 * number to an ISO date as the same type.) See `.rules/hooks.md`.
 *
 * Usage: npx tsx scripts/check-tool-output-consistency.ts
 *
 * @module scripts/check-tool-output-consistency
 * (Source: Issue #2653, Epic B)
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './script-paths.js';

const TOOLS_DIR = join(ROOT, 'packages/nexus-agents/src/mcp/tools');

/**
 * A timestamp-named identifier: ends in `At`/`Date` (camelCase, preceded by
 * a lowercase letter) or is exactly `timestamp`. `*Time` is deliberately
 * excluded — `totalTime`, `durationTime` etc. are durations, legitimately
 * numeric.
 */
function isTimestampName(name: string): boolean {
  return /(?:^|_)timestamp$/i.test(name) || /[a-z](?:At|Date)$/.test(name) || /_date$/.test(name);
}

export interface TimestampViolation {
  file: string;
  line: number;
  field: string;
}

/** A line that opens a tool-OUTPUT region — an output schema or a `*Response` type. */
function opensOutputRegion(line: string): boolean {
  return (
    /\b(?:output[Ss]chema|OUTPUT_SCHEMA)\b[^=]*=\s*\{/.test(line) ||
    /\b(?:interface|type)\s+\w*Response\b.*\{/.test(line)
  );
}

// `<field>: z.number()` or `<field>: number` — optionally quoted key. The
// `\b` is scoped to the bare-`number` branch only: `z.number()` ends in
// `)` and a following `,`/`;` is non-word, so a trailing `\b` would never
// fire there.
const FIELD_PATTERN = /^\s*['"]?([A-Za-z_]\w*)['"]?\s*:\s*(?:z\.number\(\)|number\b)/;

/** Net brace-depth change on a line. */
function braceDelta(line: string): number {
  return (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0);
}

/** Is this a comment line (skipped for region + field detection)? */
function isCommentLine(line: string): boolean {
  const t = line.trimStart();
  return t.startsWith('//') || t.startsWith('*');
}

/** A timestamp-named-field-as-number violation on `line`, or null. */
function timestampViolationOnLine(
  line: string,
  lineNum: number,
  fileName: string
): TimestampViolation | null {
  const field = FIELD_PATTERN.exec(line)?.[1];
  if (field !== undefined && isTimestampName(field)) {
    return { file: fileName, line: lineNum, field };
  }
  return null;
}

/**
 * Find timestamp-named fields typed as a bare `number` / `z.number()`
 * inside a tool's OUTPUT surface (an output schema or a `*Response` type).
 * Internal helper types (cache entries, etc.) legitimately use epoch-ms
 * numbers and are NOT flagged. Pure — exported for tests.
 */
export function findTimestampNumberFields(src: string, fileName: string): TimestampViolation[] {
  const violations: TimestampViolation[] = [];
  const lines = src.split('\n');
  // Brace depth at which the current output region was entered; null when
  // not inside one.
  let regionEntryDepth: number | null = null;
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (isCommentLine(line)) continue;
    if (regionEntryDepth === null && opensOutputRegion(line)) {
      regionEntryDepth = depth;
    }
    if (regionEntryDepth !== null) {
      const violation = timestampViolationOnLine(line, i + 1, fileName);
      if (violation !== null) violations.push(violation);
    }
    depth += braceDelta(line);
    if (regionEntryDepth !== null && depth <= regionEntryDepth) {
      regionEntryDepth = null;
    }
  }
  return violations;
}

/** What a scan found, and what it actually covered. */
export interface ToolScanResult {
  readonly violations: TimestampViolation[];
  /** Tool source files actually read. Zero means the scan proved nothing. */
  readonly scanned: number;
  /** The tools directory itself was not found. */
  readonly dirMissing: boolean;
}

/**
 * Scan every MCP tool file for timestamp-as-number violations.
 *
 * Reports coverage alongside the findings. The previous signature returned a
 * bare array and opened with `if (!existsSync(TOOLS_DIR)) return [];`, so a
 * moved directory produced the same value as a clean sweep and `main` printed
 * a pass. The directory is injectable so the empty and absent cases are
 * testable without moving the real tree.
 */
export function scanToolFilesWithCoverage(dir: string = TOOLS_DIR): ToolScanResult {
  if (!existsSync(dir)) return { violations: [], scanned: 0, dirMissing: true };
  const out: TimestampViolation[] = [];
  let scanned = 0;
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) continue;
    scanned++;
    const src = readFileSync(join(dir, entry), 'utf-8');
    out.push(...findTimestampNumberFields(src, entry));
  }
  return { violations: out, scanned, dirMissing: false };
}

/**
 * Violations only, without coverage.
 *
 * A thin view over {@link scanToolFilesWithCoverage} — one implementation, two
 * shapes — kept for `scripts/inject-governance.ts`, whose own
 * `checkToolOutputConsistency` still returns `true` on `length === 0` and so
 * carries the same blind spot this file just closed. That script is an
 * owner-ratified governance path, so the fix is tracked separately rather than
 * folded in here.
 */
export function scanToolFiles(dir: string = TOOLS_DIR): TimestampViolation[] {
  return scanToolFilesWithCoverage(dir).violations;
}

function main(): number {
  const { violations, scanned, dirMissing } = scanToolFilesWithCoverage();

  // An empty input set is a broken gate, not a passing one. Both branches
  // below used to reach the success line.
  if (dirMissing) {
    console.error(`Tool-output consistency: tools directory not found: ${TOOLS_DIR}`);
    console.error('  The lint scanned nothing. Fix the path rather than trusting this run.');
    return 1;
  }
  if (scanned === 0) {
    console.error(`Tool-output consistency: scanned 0 tool files under ${TOOLS_DIR}`);
    console.error('  The lint scanned nothing. Fix the path rather than trusting this run.');
    return 1;
  }

  if (violations.length === 0) {
    console.log(
      `Tool output consistency OK — ${String(scanned)} tool file(s) scanned, ` +
        'no timestamp-as-number fields.'
    );
    return 0;
  }
  console.error(
    'Tool-output consistency: timestamp-named field(s) typed as a bare number (#2653):'
  );
  for (const v of violations) {
    console.error(`  - ${v.file}:${String(v.line)}  ${v.field}`);
  }
  console.error(
    '  Type timestamps as an ISO-8601 `z.string()` or a `Date`, not `number` — see .rules/hooks.md.'
  );
  return 1;
}

if (process.argv[1]?.endsWith('check-tool-output-consistency.ts') === true) {
  process.exit(main());
}
