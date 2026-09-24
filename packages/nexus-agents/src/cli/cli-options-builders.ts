/**
 * nexus-agents CLI - Option Builders
 *
 * Helpers for constructing typed CLI options from raw util.parseArgs values.
 * Extracted from cli.ts to preserve module size and complexity limits (#6693).
 *
 * @module cli/cli-options-builders
 */

import { detectMode, isValidServerMode, type ServerMode } from './mode-detector.js';
import { ErrorPolicySchema, type ErrorPolicy } from '../mcp/tools/consensus-vote-types.js';
import type { NoQuorumPolicy } from './vote-types.js';
import { parseVoteBarFlags } from './vote-bar-flags.js';
import type { ParsedCliArgs } from '../cli-types.js';
import {
  buildSubcommandFlagOptions,
  type SubcommandFlagValues,
} from './subcommand-flag-options.js';

/** Parsed values from parseArgs; the #6693 follow-up flags come from `SubcommandFlagValues`. */
export interface ParsedValues extends SubcommandFlagValues {
  help: boolean;
  version: boolean;
  verbose: boolean;
  interactive: boolean;
  all: boolean;
  mode: unknown;
  output?: string;
  force: boolean;
  format: string;
  input?: string;
  'dry-run': boolean;
  'bandit-stats': boolean;
  setup: boolean;
  'skip-checks': boolean;
  task?: string;
  model?: string;
  'max-tokens'?: string;
  'max-cost-usd'?: string;
  engine?: string;
  learn: boolean;
  'policy-path'?: string;
  'max-steps'?: string;
  'create-issue': boolean;
  fix: boolean;
  proposal?: string;
  threshold?: string;
  strategy?: string;
  'ratifies-pr'?: string;
  option?: string[];
  quick: boolean;
  timeout?: string;
  'error-policy'?: string;
  'on-no-quorum'?: string;
  project?: string;
  period?: string;
  export?: string;
  'no-trends': boolean;
  'non-interactive': boolean;
  'skip-mcp': boolean;
  'skip-rules': boolean;
  'skip-hooks': boolean;
  'skip-config': boolean;
  'skip-opencode': boolean;
  'skip-gemini': boolean;
  'skip-codex': boolean;
  scope?: string;
  mock: boolean;
  deep: boolean;
  live: boolean;
  gateway: boolean;
  probe: boolean;
  json: boolean;
  source?: string;
  'file-issue': boolean;
  portable: boolean;
  gitignore: boolean;
  'mcp-config': boolean;
  install: boolean;
  uninstall: boolean;
  opencode?: string;
  validate: boolean;
  evaluator?: string;
  owner?: string;
  note?: string;
  sound: boolean;
  unsound: boolean;
  'lookback-days'?: string;
  'file-issues': boolean;
  'min-sample-size'?: string;
  'fitness-floor'?: string;
  limit?: string;
  markdown: boolean;
  since?: string;
  until?: string;
  'task-type'?: string;
  'min-sample'?: string;
}

/** Parses a string to a number if valid. */
function parseNumericOption(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : undefined;
}

/** Validates orchestrate engine option (Issue #386). */
function parseOrchestrateEngine(value: string | undefined): 'router' | 'puppeteer' | undefined {
  return value === 'router' || value === 'puppeteer' ? value : undefined;
}

/** Builds orchestrate-specific options. */
function buildOrchestrateOptions(values: ParsedValues): Record<string, unknown> {
  const maxTokens = parseNumericOption(values['max-tokens']);
  const maxCostUsd = parseNumericOption(values['max-cost-usd']);
  const engine = parseOrchestrateEngine(values.engine);
  const maxSteps = parseNumericOption(values['max-steps']);
  return {
    ...(values.task !== undefined && { task: values.task }),
    ...(values.model !== undefined && { model: values.model }),
    ...(maxTokens !== undefined && { maxTokens }),
    ...(maxCostUsd !== undefined && { maxCostUsd }),
    ...(engine !== undefined && { engine }),
    ...(values.learn && { learn: true }),
    ...(values['policy-path'] !== undefined && { policyPath: values['policy-path'] }),
    ...(maxSteps !== undefined && { maxSteps }),
  };
}

/** Validates errorPolicy option for vote command (#2630). */
function parseErrorPolicy(value: string | undefined): ErrorPolicy | undefined {
  if (value === undefined) return undefined;
  const parsed = ErrorPolicySchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `--error-policy must be one of ${ErrorPolicySchema.options.join(', ')}; got '${value}'`
    );
  }
  return parsed.data;
}

const NO_QUORUM_POLICIES = ['fail', 'exit2', 'retry'] as const;

/** Validates the `--on-no-quorum` flag (#4135, #6678). */
function parseNoQuorumPolicy(value: string | undefined): NoQuorumPolicy | undefined {
  if (value === undefined) return undefined;
  if (value === 'fail' || value === 'exit2' || value === 'retry') {
    return value;
  }
  throw new Error(`--on-no-quorum must be one of ${NO_QUORUM_POLICIES.join(', ')}; got '${value}'`);
}

/** Validates the vote command's `--timeout` flag (in seconds) (#6678). */
function parseVoteTimeout(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(`--timeout must be a positive number; got '${value}'`);
  }
  return num * 1000;
}

/** Builds vote-specific options. */
function buildVoteOptions(values: ParsedValues): Record<string, unknown> {
  const timeoutMs = parseVoteTimeout(values.timeout);
  const errorPolicy = parseErrorPolicy(values['error-policy']);
  const onNoQuorum = parseNoQuorumPolicy(values['on-no-quorum']);
  const { option: options, project } = values;
  return {
    ...(values.proposal !== undefined && { proposal: values.proposal }),
    ...(options !== undefined && options.length > 0 && { options }),
    ...parseVoteBarFlags(values),
    ...(timeoutMs !== undefined && { timeoutMs }),
    ...(errorPolicy !== undefined && { errorPolicy }),
    ...(onNoQuorum !== undefined && { onNoQuorum }),
    ...(project !== undefined && { project }),
  };
}

/** Builds learning-metrics specific options. */
function buildLearningMetricsOptions(values: ParsedValues): {
  export?: string;
  noTrends?: boolean;
} {
  const result: { export?: string; noTrends?: boolean } = {};
  if (values.export !== undefined) result.export = values.export;
  if (values['no-trends']) result.noTrends = true;
  return result;
}

/** Validates scope option for setup command. */
function parseSetupScope(value: string | undefined): 'user' | 'project' | undefined {
  return value === 'user' || value === 'project' ? value : undefined;
}

/** Builds setup-specific options. */
function buildSetupOptions(values: ParsedValues): Record<string, unknown> {
  const scope = parseSetupScope(values.scope);
  return {
    nonInteractive: values['non-interactive'],
    skipMcp: values['skip-mcp'],
    skipRules: values['skip-rules'],
    skipHooks: values['skip-hooks'],
    skipConfig: values['skip-config'],
    skipOpencode: values['skip-opencode'],
    skipGemini: values['skip-gemini'],
    skipCodex: values['skip-codex'],
    ...(scope !== undefined && { scope }),
  };
}

/** Builds improvement-review specific options (#2444, #6636). */
function buildImprovementReviewOptions(values: ParsedValues): Record<string, unknown> {
  return {
    'file-issues': values['file-issues'],
    fileIssues: values['file-issues'],
    ...(values['lookback-days'] !== undefined && {
      'lookback-days': values['lookback-days'],
      lookbackDays: values['lookback-days'],
    }),
    ...(values['min-sample-size'] !== undefined && {
      'min-sample-size': values['min-sample-size'],
      minSampleSize: values['min-sample-size'],
    }),
    ...(values['fitness-floor'] !== undefined && {
      'fitness-floor': values['fitness-floor'],
      fitnessFloor: values['fitness-floor'],
    }),
  };
}

/** Builds init-specific options (#2305, #2308, #2311, #2504). */
function buildInitOptions(values: ParsedValues): Record<string, unknown> {
  return {
    portable: values.portable,
    gitignore: values.gitignore,
    mcpConfig: values['mcp-config'],
    install: values.install,
    uninstall: values.uninstall,
    ...(values.opencode !== undefined && values.opencode !== '' && { opencode: values.opencode }),
    validate: values.validate,
  };
}

/** Builds base flag options. */
function buildBaseOptions(values: ParsedValues, mode: ServerMode): Record<string, unknown> {
  return {
    help: values.help,
    version: values.version,
    verbose: values.verbose,
    interactive: values.interactive,
    all: values.all,
    mode,
    force: values.force,
    format: values.format,
    dryRun: values['dry-run'],
    banditStats: values['bandit-stats'],
    setup: values.setup,
    skipChecks: values['skip-checks'],
    createIssue: values['create-issue'],
    fix: values.fix,
    quick: values.quick,
    mock: values.mock,
    deep: values.deep,
    live: values.live,
    gateway: values.gateway,
    probe: values.probe,
    json: values.json,
    fileIssue: values['file-issue'],
  };
}

/** Builds remediation and general I/O options. */
function buildRemediationOptions(values: ParsedValues): Record<string, unknown> {
  return {
    sound: values.sound,
    unsound: values.unsound,
    ...(values.evaluator !== undefined && { evaluator: values.evaluator }),
    ...(values.owner !== undefined && { owner: values.owner }),
    ...(values.note !== undefined && { note: values.note }),
    ...(values.source !== undefined && { source: values.source }),
    ...(values.output !== undefined && { output: values.output }),
    ...(values.input !== undefined && { input: values.input }),
    ...(values.period !== undefined && { period: values.period }),
  };
}

/** Builds documented forwarded flags (#6693). */
function buildDocumentedFlags(values: ParsedValues): Record<string, unknown> {
  return {
    markdown: values.markdown,
    ...(values.limit !== undefined && { limit: values.limit }),
    ...(values.since !== undefined && { since: values.since }),
    ...(values.until !== undefined && { until: values.until }),
    ...(values['task-type'] !== undefined && {
      'task-type': values['task-type'],
      taskType: values['task-type'],
    }),
    ...(values['min-sample'] !== undefined && {
      'min-sample': values['min-sample'],
      minSample: values['min-sample'],
    }),
  };
}

/** Builds the options object from parsed values. */
export function buildOptions(values: ParsedValues): ParsedCliArgs['options'] {
  const explicitMode = isValidServerMode(values.mode) ? values.mode : undefined;
  const detectionResult = detectMode({ explicitMode });

  return {
    ...buildBaseOptions(values, detectionResult.mode),
    ...buildRemediationOptions(values),
    ...buildDocumentedFlags(values),
    ...buildOrchestrateOptions(values),
    ...buildVoteOptions(values),
    ...buildLearningMetricsOptions(values),
    ...buildSetupOptions(values),
    ...buildInitOptions(values),
    ...buildImprovementReviewOptions(values),
    ...buildSubcommandFlagOptions(values),
  } as ParsedCliArgs['options'];
}
