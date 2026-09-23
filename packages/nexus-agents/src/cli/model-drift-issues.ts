/**
 * Draft and file GitHub issues for new models in a model-drift report (#6625).
 *
 * Filing reuses the #3382 auto-file path (`autoFileSuggestions`): scrubbing,
 * the per-run cap and fail-closed filing live there. This module adds what is
 * specific to models:
 *
 *   - one drafted issue per new model, carrying the drafted registry entry;
 *   - dedup by MODEL ID, against every open issue title, filtered client-side
 *     (the search index can miss an issue that exists);
 *   - a hard cap of {@link MODEL_DRIFT_MAX_ISSUES_PER_RUN};
 *   - nothing is filed when `gh` is unavailable, and the drafts are returned so
 *     the caller can print them.
 *
 * The issue proposes; it changes no routing. Promotion is owner-approved.
 *
 * @module cli/model-drift-issues
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { CLI_SUBPROCESS_TIMEOUTS } from '../config/timeouts.js';
import type { ModelDriftReport, NewModel } from '../config/model-drift.js';
import type { PipelineTask } from '../pipeline/dev-pipeline.js';
import {
  autoFileSuggestions,
  type AutoFileDeps,
  type SkipReason,
} from './auto-file-suggestions.js';

const execFileAsync = promisify(execFile);

/** Never file more than this many issues in one run. */
export const MODEL_DRIFT_MAX_ISSUES_PER_RUN = 5;

/** An existing repo label (the parameter-drift job uses it too). */
const MODEL_DRIFT_LABEL = 'discovered';

/** Upper bound on the open issues read for dedup. */
const OPEN_ISSUE_LIST_LIMIT = 1000;

export interface ModelIssueDraft {
  readonly modelId: string;
  readonly title: string;
  readonly body: string;
}

/** Injectable `gh` boundary. */
export interface ModelDriftIssueDeps {
  readonly ghAvailable?: () => Promise<boolean>;
  readonly listOpenIssueTitles?: () => Promise<readonly string[]>;
  readonly fileIssue?: AutoFileDeps['fileIssue'];
}

export interface ModelDriftIssueResult {
  /** `nothing-to-file` also covers an unmeasured report. */
  readonly status: 'ran' | 'gh-unavailable' | 'nothing-to-file';
  readonly drafts: readonly ModelIssueDraft[];
  readonly filed: ReadonlyArray<{ readonly id: string; readonly url: string }>;
  readonly skipped: ReadonlyArray<{ readonly id: string; readonly reason: SkipReason }>;
}

/** Title format. The id sits in backticks so dedup can read it back. */
function titleFor(modelId: string): string {
  return `models: propose a registry entry for \`${modelId}\``;
}

/** Draft the issue for one new model. */
export function draftNewModelIssue(model: NewModel): ModelIssueDraft {
  const body = [
    'The weekly model-drift report (#6625) found a model that no in-tree registry entry names.',
    '',
    `**Listed as:** ${model.listedAs.map((id) => `\`${id}\``).join(', ')}`,
    `**Sources:** ${model.sources.join(', ')}`,
    '',
    'Drafted entry. Fields the sources do not publish read `unknown`; tier is parsed from the id.',
    '',
    '```json',
    JSON.stringify(model.draft, null, 2),
    '```',
    '',
    'This proposes an entry and changes no routing. Adding it to `config/in-tree-data.ts`,',
    'and promoting it into routing, needs owner approval with shadow or A/B evidence (#6625).',
  ].join('\n');
  return { modelId: model.draft.id, title: titleFor(model.draft.id), body };
}

/** Title tokens, so `gpt-7` does not match an issue about `gpt-7-mini`. */
function titleNamesModel(title: string, modelId: string): boolean {
  return title.split(/[\s`()[\],]+/).includes(modelId);
}

async function defaultGhAvailable(): Promise<boolean> {
  try {
    await execFileAsync('gh', ['--version'], { timeout: CLI_SUBPROCESS_TIMEOUTS.ghCommandMs });
    return true;
  } catch {
    return false;
  }
}

async function defaultListOpenIssueTitles(): Promise<readonly string[]> {
  const { stdout } = await execFileAsync(
    'gh',
    [
      'issue',
      'list',
      '--state',
      'open',
      '--limit',
      String(OPEN_ISSUE_LIST_LIMIT),
      '--json',
      'title',
    ],
    { timeout: CLI_SUBPROCESS_TIMEOUTS.ghCommandMs }
  );
  const rows = JSON.parse(stdout) as ReadonlyArray<{ readonly title: string }>;
  return rows.map((r) => r.title);
}

function toTask(draft: ModelIssueDraft): PipelineTask {
  return {
    id: draft.modelId,
    title: draft.title,
    description: draft.body,
    assignedTo: 'researcher',
    status: 'pending',
  };
}

/**
 * File one issue per new model, deduplicated by model id and capped per run.
 * Call only when the operator passed `--file-issue`.
 */
export async function fileNewModelIssues(
  report: ModelDriftReport,
  deps: ModelDriftIssueDeps = {}
): Promise<ModelDriftIssueResult> {
  const drafts = report.newModels.map(draftNewModelIssue);
  if (report.verdict === 'unmeasured' || drafts.length === 0) {
    return { status: 'nothing-to-file', drafts, filed: [], skipped: [] };
  }
  const ghAvailable = await (deps.ghAvailable ?? defaultGhAvailable)();
  if (!ghAvailable) return { status: 'gh-unavailable', drafts, filed: [], skipped: [] };

  const openTitles = await (deps.listOpenIssueTitles ?? defaultListOpenIssueTitles)();
  const idByTitle = new Map(drafts.map((d) => [d.title, d.modelId]));
  const result = await autoFileSuggestions(drafts.map(toTask), {
    maxPerRun: MODEL_DRIFT_MAX_ISSUES_PER_RUN,
    label: MODEL_DRIFT_LABEL,
    searchExisting: (title) => {
      const modelId = idByTitle.get(title) ?? /`([^`]+)`/.exec(title)?.[1] ?? title;
      return Promise.resolve(openTitles.some((t) => titleNamesModel(t, modelId)));
    },
    ...(deps.fileIssue !== undefined && { fileIssue: deps.fileIssue }),
  });
  return { status: 'ran', drafts, filed: result.filed, skipped: result.skipped };
}
