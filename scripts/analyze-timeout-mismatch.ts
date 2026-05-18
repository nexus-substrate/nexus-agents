#!/usr/bin/env npx tsx
/**
 * Timeout-mismatch evidence report.
 *
 * Reads `$NEXUS_DATA_DIR/mcp-telemetry/timeout-mismatch-events.jsonl`
 * (produced by tool-wrapper.ts at runtime per #2703) and reports whether
 * the gate in epic #2631 should fire — i.e. whether client-config
 * mismatch (MCP client using the 60s SDK default while the server is
 * configured for 5–15 min) is the dominant cause of timeout-shaped
 * failures.
 *
 * The epic's decision is to defer the async-mode build until this
 * evidence is in. Per-tool numbers below are the data the design vote
 * is gated on.
 *
 * ## What it measures
 *
 * For each MCP tool that has a configured timeout > 60s:
 *   - total mismatch events recorded
 *   - error rate (events where outcome === 'error')
 *   - of errors, share that look like timeouts (errorCategory === 'timeout'
 *     OR errorMessage matches /timeout|timed out|deadline/i)
 *   - configured-vs-SDK gap (per-tool budget − 60_000 ms)
 *
 * Verdict: gate fires if ANY tool has both ≥10 mismatch events AND
 * ≥20 % of its errors are timeout-shaped. That's the minimum signal
 * needed to vote on the async-mode design proposal rather than guessing.
 *
 * ## Usage
 *
 *   npx tsx scripts/analyze-timeout-mismatch.ts            # write report
 *   npx tsx scripts/analyze-timeout-mismatch.ts --json     # JSON to stdout
 *   npx tsx scripts/analyze-timeout-mismatch.ts <path>     # read JSONL from <path>
 *
 * Default report path: docs/research/timeout-mismatch-v1.md
 *
 * @module scripts/analyze-timeout-mismatch
 * @see Issue #2631 (gated) and #2703 (the telemetry that feeds this)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT } from './script-paths.js';
import { getNexusDataDir } from '../packages/nexus-agents/src/config/nexus-data-dir.js';

const REPORT_PATH = join(ROOT, 'docs/research/timeout-mismatch-v1.md');
const DEFAULT_JSONL_REL = 'mcp-telemetry/timeout-mismatch-events.jsonl';

// Gate thresholds from the epic — codified so the script's verdict is
// reproducible rather than a judgment call by the operator. The epic
// explicitly requires ≥1 week of data; per-tool sample + error-rate
// minimums avoid acting on n=2 outliers.
const GATE_MIN_EVENTS_PER_TOOL = 10;
const GATE_MIN_TIMEOUT_ERROR_PCT = 20;
const GATE_MIN_WINDOW_DAYS = 7;

/** The subset of TimeoutMismatchEvent this report reads. */
interface MismatchEvent {
  readonly eventId: string;
  readonly toolName: string;
  readonly configuredTimeoutMs: number;
  readonly mcpSdkDefaultMs: number;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMs: number;
  readonly outcome: 'success' | 'error';
  readonly errorCategory?: string;
  readonly errorMessage?: string;
}

interface PerToolStats {
  readonly toolName: string;
  readonly events: number;
  readonly errors: number;
  readonly timeoutErrors: number;
  readonly timeoutErrorPct: number;
  readonly configuredTimeoutMs: number;
  readonly sdkDefaultMs: number;
  readonly gapMs: number;
  readonly p50DurationMs: number;
  readonly p95DurationMs: number;
  readonly firstSeen: string;
  readonly lastSeen: string;
  readonly gateFires: boolean;
}

interface Report {
  readonly source: string;
  readonly generatedAt: string;
  readonly totalEvents: number;
  readonly windowDays: number;
  readonly perTool: readonly PerToolStats[];
  readonly verdict: 'gate-fires' | 'insufficient-data' | 'no-mismatch-signal';
  readonly verdictReason: string;
}

const TIMEOUT_PATTERN = /timeout|timed out|deadline|MCP error -32001/i;

function readEvents(path: string): MismatchEvent[] {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, 'utf-8');
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .flatMap((line): MismatchEvent[] => {
      try {
        return [JSON.parse(line) as MismatchEvent];
      } catch {
        return [];
      }
    });
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx] ?? 0;
}

function isTimeoutShaped(ev: MismatchEvent): boolean {
  if (ev.outcome !== 'error') return false;
  if (ev.errorCategory === 'timeout') return true;
  if (ev.errorMessage !== undefined && TIMEOUT_PATTERN.test(ev.errorMessage)) return true;
  return false;
}

function groupByTool(events: readonly MismatchEvent[]): Map<string, MismatchEvent[]> {
  const byTool = new Map<string, MismatchEvent[]>();
  for (const ev of events) {
    const bucket = byTool.get(ev.toolName) ?? [];
    bucket.push(ev);
    byTool.set(ev.toolName, bucket);
  }
  return byTool;
}

interface BucketMeta {
  readonly configuredTimeoutMs: number;
  readonly sdkDefaultMs: number;
  readonly firstSeen: string;
  readonly lastSeen: string;
}

function bucketMeta(bucket: readonly MismatchEvent[]): BucketMeta {
  const first = bucket[0];
  const sortedByStart = [...bucket].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  return {
    configuredTimeoutMs: first?.configuredTimeoutMs ?? 0,
    sdkDefaultMs: first?.mcpSdkDefaultMs ?? 60_000,
    firstSeen: sortedByStart[0]?.startedAt ?? '',
    lastSeen: sortedByStart[sortedByStart.length - 1]?.startedAt ?? '',
  };
}

function statsForBucket(toolName: string, bucket: readonly MismatchEvent[]): PerToolStats {
  const errors = bucket.filter((e) => e.outcome === 'error');
  const timeoutErrors = errors.filter(isTimeoutShaped);
  const timeoutErrorPct =
    errors.length === 0 ? 0 : Math.round((timeoutErrors.length / errors.length) * 1000) / 10;
  const durations = bucket.map((e) => e.durationMs).sort((a, b) => a - b);
  const meta = bucketMeta(bucket);
  return {
    toolName,
    events: bucket.length,
    errors: errors.length,
    timeoutErrors: timeoutErrors.length,
    timeoutErrorPct,
    configuredTimeoutMs: meta.configuredTimeoutMs,
    sdkDefaultMs: meta.sdkDefaultMs,
    gapMs: meta.configuredTimeoutMs - meta.sdkDefaultMs,
    p50DurationMs: percentile(durations, 50),
    p95DurationMs: percentile(durations, 95),
    firstSeen: meta.firstSeen,
    lastSeen: meta.lastSeen,
    gateFires:
      bucket.length >= GATE_MIN_EVENTS_PER_TOOL && timeoutErrorPct >= GATE_MIN_TIMEOUT_ERROR_PCT,
  };
}

function summariseByTool(events: readonly MismatchEvent[]): PerToolStats[] {
  const byTool = groupByTool(events);
  const out: PerToolStats[] = [];
  for (const [toolName, bucket] of byTool.entries()) {
    out.push(statsForBucket(toolName, bucket));
  }
  return out.sort((a, b) => b.events - a.events);
}

function computeWindowDays(events: readonly MismatchEvent[]): number {
  if (events.length === 0) return 0;
  const sorted = [...events].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const first = sorted[0]?.startedAt;
  const last = sorted[sorted.length - 1]?.startedAt;
  if (first === undefined || last === undefined) return 0;
  return Math.round((Date.parse(last) - Date.parse(first)) / 86_400_000);
}

interface VerdictInput {
  readonly events: readonly MismatchEvent[];
  readonly perTool: readonly PerToolStats[];
  readonly windowDays: number;
}

function classifyVerdict(input: VerdictInput): {
  verdict: Report['verdict'];
  verdictReason: string;
} {
  const { events, perTool, windowDays } = input;
  if (events.length === 0) {
    return {
      verdict: 'insufficient-data',
      verdictReason: 'No mismatch telemetry found at the given path.',
    };
  }
  if (windowDays < GATE_MIN_WINDOW_DAYS) {
    // Window check trumps per-tool counts — the epic explicitly requires
    // ≥1 week of data so the analysis isn't dominated by a single weird day.
    return {
      verdict: 'insufficient-data',
      verdictReason: `Telemetry window is ${String(windowDays)} day(s); epic requires ≥${String(GATE_MIN_WINDOW_DAYS)} days before the gate can fire. Per-tool numbers below are accurate but not yet authoritative.`,
    };
  }
  const firingTools = perTool.filter((t) => t.gateFires);
  if (firingTools.length > 0) {
    return {
      verdict: 'gate-fires',
      verdictReason: `${String(firingTools.length)} tool(s) have ≥${String(GATE_MIN_EVENTS_PER_TOOL)} events AND ≥${String(GATE_MIN_TIMEOUT_ERROR_PCT)}% timeout-shaped errors over ${String(windowDays)} days: ${firingTools.map((t) => t.toolName).join(', ')}`,
    };
  }
  if (perTool.every((t) => t.events < GATE_MIN_EVENTS_PER_TOOL)) {
    return {
      verdict: 'insufficient-data',
      verdictReason: `Window is ${String(windowDays)} days but no tool has ≥${String(GATE_MIN_EVENTS_PER_TOOL)} events. Largest sample: ${String(perTool[0]?.events ?? 0)}.`,
    };
  }
  return {
    verdict: 'no-mismatch-signal',
    verdictReason: `Tools with sufficient sample size all have <${String(GATE_MIN_TIMEOUT_ERROR_PCT)}% timeout-shaped errors over ${String(windowDays)} days. Mismatch is not the dominant timeout cause; keep async-mode deferred.`,
  };
}

function buildReport(source: string, events: readonly MismatchEvent[]): Report {
  const perTool = summariseByTool(events);
  const windowDays = computeWindowDays(events);
  const { verdict, verdictReason } = classifyVerdict({ events, perTool, windowDays });
  return {
    source,
    generatedAt: new Date().toISOString(),
    totalEvents: events.length,
    windowDays,
    perTool,
    verdict,
    verdictReason,
  };
}

function renderVerdictBadge(verdict: Report['verdict']): string {
  if (verdict === 'gate-fires')
    return '🔴 **GATE FIRES** — proceed with the epic #2631 design vote';
  if (verdict === 'insufficient-data') return '⚪ **INSUFFICIENT DATA** — let telemetry accumulate';
  return '🟢 **NO MISMATCH SIGNAL** — keep async-mode deferred';
}

function renderPerToolTable(perTool: readonly PerToolStats[]): string {
  const header =
    '| Tool | Events | Errors | Timeout-shaped | Timeout % | Configured (ms) | Gap vs SDK (ms) | p50 (ms) | p95 (ms) | First seen | Last seen | Gate |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | :---: |';
  const rows = perTool.map(
    (t) =>
      `| \`${t.toolName}\` | ${String(t.events)} | ${String(t.errors)} | ${String(t.timeoutErrors)} | ${t.timeoutErrorPct.toFixed(1)} | ${String(t.configuredTimeoutMs)} | ${String(t.gapMs)} | ${String(t.p50DurationMs)} | ${String(t.p95DurationMs)} | ${t.firstSeen.slice(0, 10)} | ${t.lastSeen.slice(0, 10)} | ${t.gateFires ? '🔴' : '·'} |`
  );
  return [header, ...rows].join('\n');
}

function renderNextSteps(verdict: Report['verdict']): string {
  if (verdict === 'gate-fires') {
    return '**Gate fires.** Open the design-vote sub-issue and proceed with the staged build (start with `orchestrate` async-mode since it already writes `StructuredTaskState`).';
  }
  if (verdict === 'insufficient-data') {
    return '**Insufficient data.** The telemetry window is short and/or per-tool sample sizes are below the gate floor. Re-run this script after another week of runtime data accumulates.';
  }
  return '**No mismatch signal.** Tools with sufficient sample size show timeouts are not dominantly caused by client/server timeout mismatch — look at workload, model latency, or rate-limits instead. Keep async-mode deferred and re-evaluate if the failure mode changes.';
}

const REPORT_FRONTMATTER = [
  '---',
  "title: 'Timeout-Mismatch Evidence Report'",
  "description: 'Per-tool measurement of MCP client-vs-server timeout mismatch errors. Evidence gate for epic #2631 (job-style async invocation).'",
  'tier: 2',
  'keywords: [timeout, mcp, telemetry, async, epic-2631, evidence-gate]',
  '---',
].join('\n');

function renderGateCriteria(): string {
  return [
    '## Gate criteria',
    '',
    'The gate fires when ALL of the following hold:',
    '',
    `1. The telemetry window is **≥${String(GATE_MIN_WINDOW_DAYS)} days** wide (so the dataset isn't dominated by a single bad day).`,
    `2. At least one tool has **≥${String(GATE_MIN_EVENTS_PER_TOOL)} events**.`,
    `3. That tool has **≥${String(GATE_MIN_TIMEOUT_ERROR_PCT)}% of error events looking like timeouts** (\`errorCategory === 'timeout'\` OR \`errorMessage\` matches \`/timeout|timed out|deadline/i\`).`,
  ].join('\n');
}

function renderMarkdown(report: Report): string {
  return [
    REPORT_FRONTMATTER,
    '',
    '# Timeout-Mismatch Evidence Report',
    '',
    '_Generated by `scripts/analyze-timeout-mismatch.ts` from runtime telemetry recorded by #2703 wrapper at `$NEXUS_DATA_DIR/mcp-telemetry/timeout-mismatch-events.jsonl`._',
    '',
    `**Generated at:** ${report.generatedAt}`,
    `**Source:** \`${report.source}\``,
    `**Total events:** ${String(report.totalEvents)} over ~${String(report.windowDays)} days`,
    '',
    '## Verdict',
    '',
    renderVerdictBadge(report.verdict),
    '',
    report.verdictReason,
    '',
    renderGateCriteria(),
    '',
    '## Per-tool breakdown',
    '',
    renderPerToolTable(report.perTool),
    '',
    '## What this means for #2631',
    '',
    'Per the epic, the async-mode build is deferred until evidence shows client-config mismatch is the dominant cause of timeout failures.',
    '',
    renderNextSteps(report.verdict),
    '',
  ].join('\n');
}

interface CliArgs {
  readonly jsonl: string;
  readonly emitJson: boolean;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const positional = argv.filter((a) => !a.startsWith('--'));
  const jsonl = positional[0] ?? join(getNexusDataDir(), DEFAULT_JSONL_REL);
  return { jsonl, emitJson: argv.includes('--json') };
}

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  const events = readEvents(args.jsonl);
  const report = buildReport(args.jsonl, events);

  if (args.emitJson) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  }

  const markdown = renderMarkdown(report);
  if (!existsSync(dirname(REPORT_PATH))) mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, markdown);
  process.stderr.write(`Wrote ${REPORT_PATH} (verdict: ${report.verdict})\n`);
  return 0;
}

// Export for tests
export {
  type MismatchEvent,
  type PerToolStats,
  type Report,
  GATE_MIN_EVENTS_PER_TOOL,
  GATE_MIN_TIMEOUT_ERROR_PCT,
  GATE_MIN_WINDOW_DAYS,
  buildReport,
  isTimeoutShaped,
  renderMarkdown,
  summariseByTool,
};

const entryPath = process.argv[1] ?? '';
if (import.meta.url === `file://${entryPath}`) {
  process.exit(main());
}
