/**
 * `nexus-agents auto-remediate` — run one auto-remediation cycle (#3540 phase 3 / #3671).
 *
 * The user-facing surface for {@link runAutoRemediationCycle}. The mode comes from
 * `NEXUS_AUTO_REMEDIATE` (off | audit | enforce), default OFF — so this is a no-op
 * unless explicitly enabled. `audit` collects improvement_review signals and runs
 * research → consensus vote with ZERO writes (the soak); `enforce` is structurally
 * unavailable until the Option B implement adapter (#3669) lands.
 *
 * Flags:
 *   --format <text|json>   Output mode (default text)
 *
 * This NEVER flips the mode on itself — enabling enforce is the owner's decision
 * (set `NEXUS_AUTO_REMEDIATE=enforce`), gated by the readiness vote.
 *
 * @module cli/auto-remediate-command
 */

import type { ParsedCliArgs } from '../cli-types.js';
import { runAutoRemediationCycle } from '../mcp/tools/auto-remediation-cycle.js';
import type { AutoRemediationResult } from '../mcp/tools/improvement-remediation-enforce.js';

/** One-line text summary of a cycle result. */
function summarize(r: AutoRemediationResult): string {
  const head = `auto-remediation [${r.mode}]`;
  if (r.aborted !== undefined) return `${head}: aborted — ${r.aborted}\n`;
  return (
    `${head}: ${String(r.considered)} considered · ${String(r.plans.length)} planned · ` +
    `${String(r.remediated.length)} PR(s) · ${String(r.skipped.length)} skipped\n`
  );
}

/** Handle `nexus-agents auto-remediate`. */
export async function handleAutoRemediateCommand(args: ParsedCliArgs): Promise<void> {
  const result = await runAutoRemediationCycle();
  if (args.options.format === 'json') {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(summarize(result));
}
