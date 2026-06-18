/**
 * `nexus-agents improvement-review` — observability-driven improvement loop.
 *
 * Source: Issue #2444 (epic #2435 child).
 *
 * CLI surface for the existing `improvement_review` MCP tool. Reads the
 * OutcomeStore + fitness audit, surfaces patterns crossing documented
 * thresholds (CLI < 60% with ≥5 samples, fitness below floor, single
 * failure category > 50% of failures), and optionally files candidate
 * GitHub issues via `gh issue create`. Never auto-merges; humans or
 * `consensus_vote` decide what to implement.
 *
 * Flags:
 *   --lookback-days <n>      Outcome window in days (default 7, max 90)
 *   --file-issues            File candidate issues (rate-limited 5/run, deduped)
 *   --dry-run                Force `--file-issues` off (CI-safe alias)
 *   --min-sample-size <n>    Minimum samples before a CLI signal fires (default 5)
 *   --fitness-floor <n>      Fitness score below this triggers tech-debt (default 90)
 *   --format <text|json>     Output mode (default text)
 */

/* eslint-disable no-console */

import type { CliExitResult, ParsedCliArgs } from '../cli-types.js';
import { cliExit, EXIT_CODES } from '../cli-types.js';
import {
  runImprovementReview,
  ImprovementReviewInputSchema,
  type ImprovementSignal,
  type ImprovementReviewResponse,
} from '../mcp/tools/improvement-review.js';

interface CliOptions {
  readonly lookbackDays: number;
  readonly fileIssues: boolean;
  readonly minSampleSize: number;
  readonly fitnessFloor: number;
  readonly format: 'text' | 'json';
}

function parseOptions(args: ParsedCliArgs): CliOptions {
  // The cli-types options bag is strictly typed; flags this command accepts
  // (`--lookback-days`, `--file-issues`, `--dry-run`, `--min-sample-size`,
  // `--fitness-floor`, `--format`) aren't first-class. Read as a record
  // — the schema below validates ranges at runtime.
  const opts = args.options as unknown as Record<string, unknown>;

  const lookbackRaw = typeof opts['lookback-days'] === 'string' ? opts['lookback-days'] : '7';
  const lookbackParsed = Number.parseInt(lookbackRaw, 10);

  const minSamplesRaw = typeof opts['min-sample-size'] === 'string' ? opts['min-sample-size'] : '5';
  const minSamplesParsed = Number.parseInt(minSamplesRaw, 10);

  const fitnessRaw = typeof opts['fitness-floor'] === 'string' ? opts['fitness-floor'] : '90';
  const fitnessParsed = Number.parseInt(fitnessRaw, 10);

  const dryRun = opts['dry-run'] === true;
  const fileIssuesFlag = opts['file-issues'] === true;
  const fileIssues = !dryRun && fileIssuesFlag;

  const formatRaw = typeof opts['format'] === 'string' ? opts['format'] : 'text';
  const format: 'text' | 'json' = formatRaw === 'json' ? 'json' : 'text';

  // Validate via the same Zod schema the MCP tool uses — keeps ranges
  // (1..90 for lookback, etc.) consistent across the two surfaces.
  const validated = ImprovementReviewInputSchema.parse({
    lookbackDays: lookbackParsed,
    fileIssues,
    minSampleSize: minSamplesParsed,
    fitnessFloor: fitnessParsed,
  });

  return {
    lookbackDays: validated.lookbackDays,
    fileIssues: validated.fileIssues,
    minSampleSize: validated.minSampleSize,
    fitnessFloor: validated.fitnessFloor,
    format,
  };
}

export async function handleImprovementReviewCommand(args: ParsedCliArgs): Promise<CliExitResult> {
  const cli = parseOptions(args);
  const response = await runImprovementReview({
    lookbackDays: cli.lookbackDays,
    fileIssues: cli.fileIssues,
    minSampleSize: cli.minSampleSize,
    fitnessFloor: cli.fitnessFloor,
  });

  if (cli.format === 'json') {
    process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
    return cliExit(EXIT_CODES.SUCCESS);
  }

  printTextReport(response, cli);
  // #3942: RETURN the exit code; dispatcher owns process.exit. This command
  // never forced an exit (natural exit 0) — SUCCESS (0) is byte-identical.
  return cliExit(EXIT_CODES.SUCCESS);
}

function printTextReport(response: ImprovementReviewResponse, opts: CliOptions): void {
  console.log('Nexus Agents — Improvement Review');
  console.log('=================================');
  console.log(`Window: last ${String(opts.lookbackDays)} day(s)`);
  console.log(`Outcomes scanned: ${String(response.totalOutcomes)}`);
  console.log(`Signals surfaced: ${String(response.signals.length)}`);
  console.log(`Issue filing: ${opts.fileIssues ? 'enabled' : 'disabled (dry-run)'}\n`);

  if (response.signals.length === 0) {
    console.log('No threshold breaches in the current window.');
    console.log('');
    console.log('Thresholds:');
    console.log(`  - CLI success rate < 60% with ≥${String(opts.minSampleSize)} samples`);
    console.log(`  - Fitness score below ${String(opts.fitnessFloor)}/100`);
    console.log('  - A single failure category accounting for > 50% of failures');
    return;
  }

  for (const signal of response.signals) {
    printSignal(signal);
  }

  if (response.issuesFiled.length > 0) {
    console.log(`\nFiled ${String(response.issuesFiled.length)} issue(s):`);
    for (const f of response.issuesFiled) {
      console.log(`  - ${f.signalKey} → ${f.issueUrl}`);
    }
  }
  if (response.issuesSkipped.length > 0) {
    console.log(`\nSkipped ${String(response.issuesSkipped.length)} signal(s):`);
    for (const s of response.issuesSkipped) {
      console.log(`  - ${s.signalKey} (${s.reason})`);
    }
  }
}

function printSignal(signal: ImprovementSignal): void {
  const sevTag = signal.severity.toUpperCase();
  console.log(`[${sevTag}] (${signal.category}) ${signal.title}`);
  if (signal.evidence.observedValue !== undefined && signal.evidence.threshold !== undefined) {
    console.log(
      `  observed=${signal.evidence.observedValue.toFixed(3)} threshold=${signal.evidence.threshold.toFixed(3)}`
    );
  }
  if (signal.evidence.samples !== undefined) {
    console.log(
      `  samples=${String(signal.evidence.samples)} window=${signal.evidence.window ?? 'n/a'}`
    );
  }
  console.log('');
}
