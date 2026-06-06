/**
 * Capability Gap Ledger (#3555)
 *
 * Aggregates the {@link CapabilityGapReport}s produced on every routing /
 * MetaOrchestrator decision — which are otherwise computed and discarded — into
 * a queryable, frequency-ranked summary of the tools and experts the system
 * keeps wanting but lacks. This is the substrate for a self-directed build
 * backlog: a gap that recurs is a capability worth adding. Later increments feed
 * this summary into the research-trigger / `suggest_research_tasks` surface.
 *
 * Deterministic and in-process; no external calls. Bounded storage mirrors the
 * MetaOrchestrator's recording sink.
 *
 * @module core/task-analysis/capability-gap-ledger
 */

import { getTimeProvider } from '../time-provider.js';
import type { CapabilityGapReport, CapabilityGap } from './capability-gap-detector.js';

/** Context attached to a recorded gap, for traceability and examples. */
export interface GapContext {
  /** The goal/task whose routing surfaced the gap. */
  readonly goal?: string | undefined;
  /** The decision id this gap was attached to (joins to a selection record). */
  readonly decisionId?: string | undefined;
}

/** One recorded gap occurrence. */
interface GapEntry {
  readonly type: CapabilityGap['type'];
  readonly name: string;
  readonly suggestion: string;
  readonly goal?: string | undefined;
  readonly timestamp: string;
}

/** A frequency-ranked summary of one distinct gap. */
export interface GapSummary {
  /** Whether the missing capability is a tool or an expert. */
  readonly type: CapabilityGap['type'];
  /** The missing capability's name. */
  readonly name: string;
  /** How many times this gap was observed. */
  readonly count: number;
  /** The suggestion recorded for it (most recent). */
  readonly suggestion: string;
  /** A bounded sample of distinct goals that surfaced this gap. */
  readonly exampleGoals: readonly string[];
}

/** The ledger interface (the injection seam for producers). */
export interface ICapabilityGapLedger {
  /** Records every gap in a report, tagged with optional context. */
  record(report: CapabilityGapReport, context?: GapContext): void;
  /** Returns distinct gaps ranked by observation count (desc), then name (asc). */
  summarize(): readonly GapSummary[];
  /** Total number of gap occurrences currently retained. */
  size(): number;
}

const DEFAULT_MAX_ENTRIES = 500;
const MAX_EXAMPLE_GOALS = 3;

/** Stable composite key for a distinct gap. */
function gapKey(type: string, name: string): string {
  return `${type}:${name}`;
}

interface GapGroup {
  type: CapabilityGap['type'];
  name: string;
  count: number;
  suggestion: string;
  goals: Set<string>;
}

/** Groups raw entries into frequency-ranked distinct-gap summaries. */
function summarizeEntries(entries: readonly GapEntry[]): readonly GapSummary[] {
  const groups = new Map<string, GapGroup>();
  for (const e of entries) {
    const key = gapKey(e.type, e.name);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, {
        type: e.type,
        name: e.name,
        count: 1,
        suggestion: e.suggestion,
        goals: new Set(e.goal !== undefined ? [e.goal] : []),
      });
    } else {
      group.count += 1;
      group.suggestion = e.suggestion; // most recent wins
      if (e.goal !== undefined) group.goals.add(e.goal);
    }
  }

  return [...groups.values()]
    .map((g) => ({
      type: g.type,
      name: g.name,
      count: g.count,
      suggestion: g.suggestion,
      exampleGoals: [...g.goals].slice(0, MAX_EXAMPLE_GOALS),
    }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.name.localeCompare(b.name)));
}

/**
 * Creates a capability-gap ledger.
 *
 * @param maxEntries - cap on retained occurrences (oldest evicted first).
 */
export function createCapabilityGapLedger(maxEntries = DEFAULT_MAX_ENTRIES): ICapabilityGapLedger {
  const entries: GapEntry[] = [];

  return {
    record(report: CapabilityGapReport, context?: GapContext): void {
      const timestamp = new Date(getTimeProvider().now()).toISOString();
      for (const gap of report.gaps) {
        entries.push({
          type: gap.type,
          name: gap.name,
          suggestion: gap.suggestion,
          goal: context?.goal,
          timestamp,
        });
      }
      if (entries.length > maxEntries) {
        entries.splice(0, entries.length - maxEntries);
      }
    },

    summarize(): readonly GapSummary[] {
      return summarizeEntries(entries);
    },

    size(): number {
      return entries.length;
    },
  };
}
