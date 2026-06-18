/**
 * `nexus-agents usage` — operator-facing cost / usage / quality dashboard.
 *
 * Source: Issue #2469 (epic #2467 child).
 *
 * Reads the JSONL usage log written by `learning/usage-log.ts` and prints
 * per-model rollups: call count, success rate, tokens (in/out), USD cost,
 * avg latency, cost-per-success. Useful when running against metered API
 * gateways (cf. #2468 OpenAI-compat adapter) to see where spend is going.
 *
 * Two output modes:
 *   - text (default) — human-readable table
 *   - json — machine-parseable for scripting (`--format=json`)
 *
 * Time window: default last 24h, override with `--since=<iso>` and
 * `--until=<iso>`. Filter by model with `--model=<id>`.
 */

/* eslint-disable no-console */

import type { CliExitResult, ParsedCliArgs } from '../cli-types.js';
import { cliExit, EXIT_CODES } from '../cli-types.js';
import { loadUsageEvents, rollupByModel, type ModelRollup } from '../learning/usage-log.js';

interface UsageOptions {
  readonly format: 'text' | 'json';
  readonly sinceIso: string;
  readonly untilIso: string | undefined;
  readonly modelId: string | undefined;
}

function parseOptions(args: ParsedCliArgs): UsageOptions {
  // The cli-types options bag is strictly typed; new flags this command
  // accepts (`--since`, `--until`, `--model`) aren't first-class fields.
  // Treat the bag as a record for these reads — the values are still
  // string-checked at runtime.
  const opts = args.options as unknown as Record<string, unknown>;
  const formatRaw = typeof opts['format'] === 'string' ? opts['format'] : 'text';
  const format: 'text' | 'json' = formatRaw === 'json' ? 'json' : 'text';

  const since = typeof opts['since'] === 'string' ? opts['since'] : '';
  const sinceIso = since === '' ? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() : since;

  const until = typeof opts['until'] === 'string' ? opts['until'] : undefined;
  const model = typeof opts['model'] === 'string' ? opts['model'] : undefined;

  return { format, sinceIso, untilIso: until, modelId: model };
}

export async function handleUsageCommand(args: ParsedCliArgs): Promise<CliExitResult> {
  const opts = parseOptions(args);

  const loadOpts: Parameters<typeof loadUsageEvents>[0] = { sinceIso: opts.sinceIso };
  if (opts.untilIso !== undefined) {
    (loadOpts as { untilIso: string }).untilIso = opts.untilIso;
  }
  if (opts.modelId !== undefined) {
    (loadOpts as { modelId: string }).modelId = opts.modelId;
  }
  const events = loadUsageEvents(loadOpts);
  const rollups = rollupByModel(events);

  if (opts.format === 'json') {
    process.stdout.write(`${JSON.stringify({ since: opts.sinceIso, rollups }, null, 2)}\n`);
    await Promise.resolve();
    return cliExit(EXIT_CODES.SUCCESS);
  }

  printTextReport(opts, rollups, events.length);
  await Promise.resolve();
  // #3942: RETURN the exit code; dispatcher owns process.exit. This command
  // never forced an exit (natural exit 0) — SUCCESS (0) is byte-identical.
  return cliExit(EXIT_CODES.SUCCESS);
}

function printTextReport(
  opts: UsageOptions,
  rollups: readonly ModelRollup[],
  totalEvents: number
): void {
  console.log('Nexus Agents — Usage Report');
  console.log('===========================');
  console.log(`Window: ${opts.sinceIso} → ${opts.untilIso ?? 'now'}`);
  if (opts.modelId !== undefined) {
    console.log(`Filter: model=${opts.modelId}`);
  }
  console.log(`Events: ${String(totalEvents)}\n`);

  if (rollups.length === 0) {
    console.log('No usage events recorded for this window.');
    console.log('');
    console.log('To start recording, calls must reach a recordUsageEvent()-instrumented');
    console.log('adapter. See docs/getting-started/CONFIGURATION.md for setup.');
    return;
  }

  // Compact table per model.
  for (const r of rollups) {
    console.log(`${r.modelId}  (${r.providerId})`);
    console.log(
      `  calls           : ${String(r.callCount)} (${(r.successRate * 100).toFixed(1)}% success)`
    );
    console.log(
      `  tokens          : ${String(r.totalInputTokens)} in / ${String(r.totalOutputTokens)} out`
    );
    console.log(
      `  cost            : $${r.totalUsdCost.toFixed(4)} ($${r.costPerSuccessUsd.toFixed(4)} / success)`
    );
    console.log(`  avg latency     : ${r.avgLatencyMs.toFixed(0)}ms`);
    console.log('');
  }

  const totalCost = rollups.reduce((s, r) => s + r.totalUsdCost, 0);
  console.log(`Total cost: $${totalCost.toFixed(4)} across ${String(rollups.length)} model(s).`);
}
