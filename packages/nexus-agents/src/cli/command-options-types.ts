/**
 * nexus-agents CLI - Per-Command Option & Argument Types
 *
 * Decomposes the monolithic ParsedCliArgs type into per-command option contracts
 * and introduces CustomApiConfig to cleanly encapsulate custom API gateway options (#5129 Item 2).
 *
 * @module cli/command-options-types
 */

import type { ServerMode } from './mode-detector.js';
import type {
  ErrorPolicy,
  VoteThreshold,
  VotingStrategy,
} from '../mcp/tools/consensus-vote-types.js';
import type { NoQuorumPolicy } from './vote-types.js';
import type { VoteRecordPrBinding } from '../audit/vote-record.js';
import type { CliCommand } from '../cli-types.js';

/**
 * Custom OpenAI-compatible gateway API configuration (#2124, #5129).
 *
 * Encapsulates the custom-api options into a single cohesive configuration
 * so that setting partial/uncoordinated flags is unrepresentable.
 */
export interface CustomApiConfig {
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly model?: string;
}

/**
 * Common base flags accepted across CLI commands.
 */
export interface BaseCliOptions {
  help: boolean;
  version: boolean;
  verbose: boolean;
  interactive: boolean;
  all: boolean;
  mode: ServerMode;
  output?: string;
  force: boolean;
  format: string;
  input?: string;
  dryRun: boolean;
  banditStats: boolean;
  setup: boolean;
  skipChecks: boolean;
  createIssue: boolean;
  fix: boolean;
  quick: boolean;
  mock: boolean;
  deep: boolean;
  live: boolean;
  gateway: boolean;
  probe: boolean;
  json?: boolean;
  fileIssue?: boolean;
}

/**
 * Options specific to the `setup` command.
 */
export interface SetupCliOptions extends Partial<BaseCliOptions> {
  nonInteractive?: boolean;
  skipMcp?: boolean;
  skipRules?: boolean;
  skipHooks?: boolean;
  skipConfig?: boolean;
  skipOpencode?: boolean;
  skipGemini?: boolean;
  skipCodex?: boolean;
  scope?: 'user' | 'project';
  customApiConfig?: CustomApiConfig;
  customApi?: string;
  customApiKey?: string;
  customModel?: string;
}

/**
 * Options specific to the `vote` command.
 */
export interface VoteCliOptions extends Partial<BaseCliOptions> {
  proposal?: string;
  artifactFile?: string;
  threshold?: VoteThreshold;
  strategy?: VotingStrategy;
  ratifiesPr?: VoteRecordPrBinding;
  quick?: boolean;
  timeoutMs?: number;
  errorPolicy?: ErrorPolicy;
  onNoQuorum?: NoQuorumPolicy;
  options?: string[];
  project?: string;
}

/**
 * Options specific to the `orchestrate` command.
 */
export interface OrchestrateCliOptions extends Partial<BaseCliOptions> {
  task?: string;
  model?: string;
  maxTokens?: number;
  maxCostUsd?: number;
  engine?: 'router' | 'puppeteer';
  learn?: boolean;
  policyPath?: string;
  maxSteps?: number;
}

/**
 * Options specific to the `doctor` command.
 */
export interface DoctorCliOptions extends Partial<BaseCliOptions> {
  deep?: boolean;
  live?: boolean;
  gateway?: boolean;
  probe?: boolean;
}

/**
 * Options specific to the `init` command.
 */
export interface InitCliOptions extends Partial<BaseCliOptions> {
  portable?: boolean;
  gitignore?: boolean;
  mcpConfig?: boolean;
  install?: boolean;
  uninstall?: boolean;
  opencode?: string;
  validate?: boolean;
}

/**
 * Options specific to the `improvement-review` command.
 */
export interface ImprovementReviewCliOptions extends Partial<BaseCliOptions> {
  'file-issues'?: boolean;
  fileIssues?: boolean;
  'lookback-days'?: string;
  lookbackDays?: string;
  'min-sample-size'?: string;
  minSampleSize?: string;
  'fitness-floor'?: string;
  fitnessFloor?: string;
}

/**
 * Options specific to the `remediation-review` command.
 */
export interface RemediationReviewCliOptions extends Partial<BaseCliOptions> {
  evaluator?: string;
  owner?: string;
  note?: string;
  sound?: boolean;
  unsound?: boolean;
  batch?: string;
  n?: string;
  seed?: string;
  sample?: string;
}

/**
 * Options specific to the `learning-metrics` command.
 */
export interface LearningMetricsCliOptions extends Partial<BaseCliOptions> {
  period?: string;
  export?: string;
  noTrends?: boolean;
}

/**
 * Options specific to the `model-drift` command.
 */
export interface ModelDriftCliOptions extends Partial<BaseCliOptions> {
  json?: boolean;
  fileIssue?: boolean;
}

/**
 * Options specific to the `health` command.
 */
export type HealthCliOptions = Partial<BaseCliOptions>;

/**
 * Options specific to the `jobs` command.
 */
export interface JobsCliOptions extends Partial<BaseCliOptions> {
  dryRun?: boolean;
}

/**
 * Generic typed CLI command argument container.
 */
export interface CommandArgs<
  TCommand extends CliCommand = CliCommand,
  TOptions = Record<string, unknown>,
> {
  command: TCommand;
  subcommand?: string;
  options: TOptions;
  positionals: string[];
}

/** Per-command typed argument aliases. */
export type SetupCommandArgs = CommandArgs<'setup', SetupCliOptions>;
export type VoteCommandArgs = CommandArgs<'vote', VoteCliOptions>;
export type OrchestrateCommandArgs = CommandArgs<'orchestrate', OrchestrateCliOptions>;
export type DoctorCommandArgs = CommandArgs<'doctor', DoctorCliOptions>;
export type InitCommandArgs = CommandArgs<'init', InitCliOptions>;
export type ImprovementReviewCommandArgs = CommandArgs<
  'improvement-review',
  ImprovementReviewCliOptions
>;
export type RemediationReviewCommandArgs = CommandArgs<
  'remediation-review',
  RemediationReviewCliOptions
>;
export type LearningMetricsCommandArgs = CommandArgs<'learning-metrics', LearningMetricsCliOptions>;
export type ModelDriftCommandArgs = CommandArgs<'model-drift', ModelDriftCliOptions>;
export type HealthCommandArgs = CommandArgs<'health', HealthCliOptions>;
export type JobsCommandArgs = CommandArgs<'jobs', JobsCliOptions>;
