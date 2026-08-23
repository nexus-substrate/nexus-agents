/**
 * Durable capability-gap ledger (#4645).
 *
 * ## Why
 *
 * The in-memory ledger (`capability-gap-ledger.ts`, #3548) is a process-wide
 * singleton with no persistence. Its consumer — `pipeline/research-trigger.ts`
 * — ranks gaps **by frequency** and turns the frequent ones into research. So
 * the window over which "frequent" is measured was "since this process
 * started": for a CLI invocation, seconds. A gap observed once a day for a
 * month never became frequent, because each observation landed in a different
 * process — and a gap that recurs across sessions is exactly the kind worth
 * researching.
 *
 * Four of seven voters on the #4651 panel raised this independently, including
 * the one who voted against the whole proposal: measurement that resets on
 * restart cannot justify an architectural decision. Persistence is therefore a
 * prerequisite of the tool-refusal producer, not a follow-up to it.
 *
 * ## What it reports, and why the report exists
 *
 * `loadReport()` distinguishes states that all summarize to "no gaps":
 *
 * | Field | Why it is separate |
 * | --- | --- |
 * | `fileExisted: false` | nothing was ever written — or the ledger is pointed at the wrong path |
 * | `malformedLines` | lines that could not be parsed; silently skipping them under-reports demand |
 * | `expiredEntries` | dropped by the retention window, not absent |
 *
 * A corrupt or misaimed ledger otherwise reads as "low demand", which is the
 * exact failure this ledger exists to prevent — a number that looks like
 * evidence and is not. Same discipline as `.rules/development-disciplines.md`
 * ("Name the empty case") and #4580.
 *
 * @module core/task-analysis/capability-gap-ledger-persistence
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { getTimeProvider } from '../time-provider.js';
import { CAPABILITY_GAP_TYPES } from './capability-gap-detector.js';
import type { CapabilityGapReport, CapabilityGap } from './capability-gap-detector.js';
import type { GapContext, GapSummary, ICapabilityGapLedger } from './capability-gap-ledger.js';

/** One persisted occurrence. Mirrors the in-memory entry, plus nothing. */
interface PersistedGapEntry {
  readonly type: CapabilityGap['type'];
  readonly name: string;
  readonly suggestion: string;
  readonly goal?: string | undefined;
  readonly timestamp: string;
}

/** What loading the file observed. Every field is measured, never assumed. */
export interface GapLedgerLoadReport {
  /** False means nothing was ever written — distinct from "written and empty". */
  readonly fileExisted: boolean;
  /** Entries loaded and retained. */
  readonly loaded: number;
  /** Lines that could not be parsed as an entry. Never silently dropped. */
  readonly malformedLines: number;
  /** Entries dropped by the retention window. */
  readonly expiredEntries: number;
}

/** Options for {@link createPersistentCapabilityGapLedger}. */
export interface PersistentGapLedgerConfig {
  /** JSONL file backing the ledger. */
  readonly filePath: string;
  /** Occurrences retained in memory for summarizing. */
  readonly maxEntries?: number;
  /** Entries older than this are ignored on load. */
  readonly retentionDays?: number;
}

/** A ledger that also reports what loading its file observed. */
export interface IPersistentCapabilityGapLedger extends ICapabilityGapLedger {
  loadReport(): GapLedgerLoadReport;
}

const DEFAULT_MAX_ENTRIES = 5000;

/**
 * Ninety days.
 *
 * Long enough that a gap recurring monthly still accumulates — the whole point
 * — and bounded so the file cannot grow the way the scratch dir did (#4413).
 */
const DEFAULT_RETENTION_DAYS = 90;

const MAX_EXAMPLE_GOALS = 3;

function isEntry(value: unknown): value is PersistedGapEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    // Derived from CAPABILITY_GAP_TYPES, never re-listed here — hardcoding the
    // union is what made every persisted tool_refusal load as malformed.
    // The array is widened rather than the value asserted: `includes` on a
    // readonly tuple will not accept `unknown`, and asserting the value would
    // claim a narrowing this guard has not yet done.
    typeof v['type'] === 'string' &&
    (CAPABILITY_GAP_TYPES as readonly string[]).includes(v['type']) &&
    typeof v['name'] === 'string' &&
    typeof v['suggestion'] === 'string' &&
    typeof v['timestamp'] === 'string'
  );
}

/** Frequency-ranked summary, matching the in-memory ledger's ordering. */
function summarize(entries: readonly PersistedGapEntry[]): readonly GapSummary[] {
  const groups = new Map<
    string,
    {
      type: CapabilityGap['type'];
      name: string;
      count: number;
      suggestion: string;
      goals: string[];
    }
  >();

  for (const entry of entries) {
    const key = `${entry.type}:${entry.name}`;
    const group = groups.get(key) ?? {
      type: entry.type,
      name: entry.name,
      count: 0,
      suggestion: entry.suggestion,
      goals: [],
    };
    group.count += 1;
    group.suggestion = entry.suggestion;
    if (
      entry.goal !== undefined &&
      entry.goal !== '' &&
      !group.goals.includes(entry.goal) &&
      group.goals.length < MAX_EXAMPLE_GOALS
    ) {
      group.goals.push(entry.goal);
    }
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((g) => ({
      type: g.type,
      name: g.name,
      count: g.count,
      suggestion: g.suggestion,
      exampleGoals: g.goals,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * Reads the backing file, partitioning every line into loaded, malformed, or
 * expired. Never throws: an unreadable file yields zero entries with
 * `fileExisted` true, so "cannot read" stays distinguishable from "nothing there".
 */
function loadEntries(
  filePath: string,
  cutoff: number,
  maxEntries: number
): { entries: PersistedGapEntry[]; report: GapLedgerLoadReport } {
  const entries: PersistedGapEntry[] = [];
  let malformedLines = 0;
  let expiredEntries = 0;
  const fileExisted = existsSync(filePath);

  if (!fileExisted) {
    return { entries, report: { fileExisted, loaded: 0, malformedLines: 0, expiredEntries: 0 } };
  }

  let raw = '';
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    raw = '';
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      malformedLines += 1;
      continue;
    }
    if (!isEntry(parsed)) {
      malformedLines += 1;
      continue;
    }
    if (Date.parse(parsed.timestamp) < cutoff) {
      expiredEntries += 1;
      continue;
    }
    entries.push(parsed);
  }

  if (entries.length > maxEntries) entries.splice(0, entries.length - maxEntries);

  return {
    entries,
    report: { fileExisted, loaded: entries.length, malformedLines, expiredEntries },
  };
}

/**
 * Creates a gap ledger backed by a JSONL file.
 *
 * Appends one line per gap occurrence and loads the file on construction, so
 * frequency spans processes. A clean report writes nothing — a file of
 * non-events would make frequency meaningless.
 */
export function createPersistentCapabilityGapLedger(
  config: PersistentGapLedgerConfig
): IPersistentCapabilityGapLedger {
  const maxEntries = config.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const retentionMs = (config.retentionDays ?? DEFAULT_RETENTION_DAYS) * 24 * 60 * 60 * 1000;
  const cutoff = getTimeProvider().now() - retentionMs;

  const { entries, report: loadReport } = loadEntries(config.filePath, cutoff, maxEntries);

  return {
    record(report: CapabilityGapReport, context?: GapContext): void {
      if (report.gaps.length === 0) return;
      const timestamp = new Date(getTimeProvider().now()).toISOString();
      const lines: string[] = [];
      for (const gap of report.gaps) {
        const entry: PersistedGapEntry = {
          type: gap.type,
          name: gap.name,
          suggestion: gap.suggestion,
          goal: context?.goal,
          timestamp,
        };
        entries.push(entry);
        lines.push(JSON.stringify(entry));
      }
      if (entries.length > maxEntries) entries.splice(0, entries.length - maxEntries);

      try {
        mkdirSync(dirname(config.filePath), { recursive: true });
        appendFileSync(config.filePath, `${lines.join('\n')}\n`, 'utf-8');
      } catch {
        // A ledger that cannot write must not break the task it was observing.
        // The in-memory copy still serves this process; the loss is durability,
        // and the next load's counters will show the shortfall.
      }
    },

    summarize(): readonly GapSummary[] {
      return summarize(entries);
    },

    size(): number {
      return entries.length;
    },

    loadReport(): GapLedgerLoadReport {
      return loadReport;
    },
  };
}
