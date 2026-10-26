/** Bounded workflow transport for the shared pnpm audit interpretation. */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parsePnpmAuditResult } from '../packages/nexus-agents/src/cli/system-review-audit.js';

const AUDIT_TIMEOUT_MS = 120_000;
const MAX_AUDIT_OUTPUT_BYTES = 1024 * 1024;

function main(): void {
  let execution: unknown;
  try {
    execution = execFileSync('pnpm', ['audit', '--json'], {
      encoding: 'utf8',
      timeout: AUDIT_TIMEOUT_MS,
      maxBuffer: MAX_AUDIT_OUTPUT_BYTES,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error: unknown) {
    // Preserve local exit/signal/timeout evidence; never print captured output.
    execution = error;
  }
  const audit = parsePnpmAuditResult(execution);
  const exitCode = audit.exitCode === undefined ? 'UNMEASURED' : String(audit.exitCode);
  if (audit.status === 'unmeasured') {
    process.stdout.write(
      JSON.stringify({
        status: audit.status,
        vulns: 'UNMEASURED',
        reason: audit.reason,
        exit_code: exitCode,
        summary: `**UNMEASURED:** security audit did not produce usable evidence.\n\nReason: ${audit.reason}; exit code: ${exitCode}.\n`,
      }) + '\n'
    );
    return;
  }
  const c = audit.counts;
  const summary = `| Severity | Count |\n|----------|-------|\n| Critical | ${String(c.critical)} |\n| High | ${String(c.high)} |\n| Moderate | ${String(c.moderate)} |\n| Low | ${String(c.low)} |\n| Info | ${String(c.info)} |\n| Total | ${String(c.total)} |\n\nAudit status: measured; exit code: ${exitCode}.\n`;
  process.stdout.write(
    JSON.stringify({
      status: audit.status,
      vulns: String(c.total),
      reason: 'none',
      exit_code: exitCode,
      summary,
    }) + '\n'
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
