/**
 * `nexus-agents model-drift` — report models the registry does not know, and
 * registry models no source lists any more (#6625, layer 3).
 *
 * Flags:
 *   --json         Print the report as JSON (machine use; the weekly workflow)
 *   --file-issue   Draft one GitHub issue per new model and open it with `gh`,
 *                  deduplicated by model id, at most 5 per run. Without the
 *                  flag nothing is filed. Without `gh` the drafts are printed.
 *
 * Exit status: 0 for `drift` and `no-drift`; non-zero for `unmeasured` (no
 * source could be asked), which must never read as "up to date".
 *
 * It proposes and never edits the registry or routing.
 *
 * @module cli/model-drift-command
 */

import type { CliExitResult, ParsedCliArgs } from '../cli-types.js';
import { cliExit, cliExitFromStatus, EXIT_CODES } from '../cli-types.js';
import {
  detectModelDrift,
  type DriftRegistryEntry,
  type DriftSource,
  type ModelDriftReport,
} from '../config/model-drift.js';
import { buildDriftSources } from '../config/model-drift-sources.js';
import { getDefaultRegistry } from '../config/model-registry.js';
import {
  fileNewModelIssues,
  type ModelDriftIssueDeps,
  type ModelDriftIssueResult,
} from './model-drift-issues.js';

/** Injectable boundaries; every default is the production path. */
export interface ModelDriftCommandDeps {
  readonly sources?: readonly DriftSource[];
  readonly registry?: readonly DriftRegistryEntry[];
  readonly nowMs?: number;
  readonly issueDeps?: ModelDriftIssueDeps;
  readonly write?: (text: string) => void;
}

/** The in-tree and operator-manifest entries. Catalog breadth tiers are not "known". */
function authoritativeRegistry(): readonly DriftRegistryEntry[] {
  return getDefaultRegistry()
    .allEntries()
    .filter((e) => e.source === 'in-tree' || e.source === 'manifest');
}

function formatCoverage(report: ModelDriftReport): string[] {
  return report.coverage.map((c) => {
    const detail = c.status === 'measured' ? `${String(c.modelCount)} models` : (c.reason ?? '');
    return `  ${c.source.padEnd(14)} ${c.status.padEnd(10)} ${detail}`;
  });
}

function formatNewModels(report: ModelDriftReport): string[] {
  if (report.newModels.length === 0) return ['New models: none'];
  return [
    `New models (${String(report.newModels.length)}):`,
    ...report.newModels.map((m) => {
      const d = m.draft;
      const price = d.pricing === 'unknown' ? 'unknown' : JSON.stringify(d.pricing);
      return (
        `  ${d.id}  family=${d.family} tier=${d.tier} context=${String(d.contextWindow)} ` +
        `price=${price} released=${d.releasedAt}  [${m.sources.join(', ')}]`
      );
    }),
  ];
}

function formatReport(report: ModelDriftReport): string {
  const retired =
    report.possiblyRetired.length === 0
      ? ['Possibly retired: none']
      : [
          `Possibly retired (${String(report.possiblyRetired.length)}):`,
          ...report.possiblyRetired.map((r) => `  ${r.id} (${r.cliModelName ?? r.id})`),
        ];
  const lines = [
    `Model drift: ${report.verdict.toUpperCase()} (${String(report.measuredSources)} of ${String(report.coverage.length)} sources measured)`,
    'Coverage:',
    ...formatCoverage(report),
    ...formatNewModels(report),
    ...retired,
  ];
  if (report.retirementUnmeasured.length > 0) {
    lines.push(
      `Retirement unmeasured (vendor not covered): ${report.retirementUnmeasured.join(', ')}`
    );
  }
  const x = report.excluded;
  lines.push(
    `Left out: ${String(x.nonChat)} non-chat, ${String(x.untrackedVendor)} untracked vendor, ` +
      `${String(x.latestAlias)} -latest aliases, ` +
      `${String(x.olderThanWindow)} older than ${String(report.recencyWindowDays)} days`
  );
  if (report.verdict === 'unmeasured') {
    lines.push('No source could be asked. This is not "up to date".');
  }
  return `${lines.join('\n')}\n`;
}

function formatIssueResult(result: ModelDriftIssueResult): string {
  if (result.status === 'nothing-to-file') return 'Issues: nothing to file.\n';
  if (result.status === 'gh-unavailable') {
    const drafts = result.drafts.map((d) => `--- ${d.title}\n${d.body}`).join('\n\n');
    return `Issues: gh is unavailable; nothing filed. Drafts:\n\n${drafts}\n`;
  }
  const filed = result.filed.map((f) => `  filed ${f.id}: ${f.url}`);
  const skipped = result.skipped.map((s) => `  skipped ${s.id}: ${s.reason}`);
  return `${['Issues:', ...filed, ...skipped].join('\n')}\n`;
}

/** Handle `nexus-agents model-drift`. */
export async function handleModelDriftCommand(
  args: ParsedCliArgs,
  deps: ModelDriftCommandDeps = {}
): Promise<CliExitResult> {
  const write = deps.write ?? ((text: string) => process.stdout.write(text));
  const report = await detectModelDrift({
    sources: deps.sources ?? buildDriftSources(),
    registry: deps.registry ?? authoritativeRegistry(),
    nowMs: deps.nowMs ?? Date.now(),
  });
  const issues =
    args.options.fileIssue === true ? await fileNewModelIssues(report, deps.issueDeps) : undefined;
  write(render(report, issues, args.options.json === true));
  return report.verdict === 'unmeasured' ? cliExitFromStatus(1) : cliExit(EXIT_CODES.SUCCESS);
}

function render(
  report: ModelDriftReport,
  issues: ModelDriftIssueResult | undefined,
  json: boolean
): string {
  if (json) {
    return `${JSON.stringify(issues === undefined ? report : { ...report, issues }, null, 2)}\n`;
  }
  return formatReport(report) + (issues === undefined ? '' : formatIssueResult(issues));
}
