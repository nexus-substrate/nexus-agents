/* eslint-disable max-lines -- canonical CLI types + parseArgs config, intentionally centralized */
/**
 * nexus-agents CLI Types
 *
 * Type definitions and constants for the CLI.
 *
 * @module cli-types
 */

import type { ServerMode } from './cli/index.js';
import type {
  ErrorPolicy,
  VoteThreshold,
  VotingStrategy,
} from './mcp/tools/consensus-vote-types.js';
import type { NoQuorumPolicy } from './cli/vote-types.js';
import type { VoteRecordPrBinding } from './audit/vote-record.js';
import type { CommandResult } from './core/command-result.js';
import { VOTE_TIMEOUTS } from './config/timeouts.js';

// Re-export help text from extracted module for backward compatibility
export { HELP_TEXT } from './cli-help-text.js';

/**
 * Exit codes for the CLI.
 */
export const EXIT_CODES = {
  SUCCESS: 0,
  SERVER_START_FAILED: 1,
  SHUTDOWN_ERROR: 2,
  INVALID_ARGS: 3,
  /** Subcommand is stubbed / advertised but not implemented (#2727). */
  NOT_IMPLEMENTED: 4,
} as const;

/**
 * A {@link CommandResult} that also carries the process exit code the
 * dispatcher should terminate with (#3210).
 *
 * Handlers RETURN this instead of calling `process.exit` inline, and the
 * single `process.exit` lives at the dispatcher boundary (see `exitWith`).
 * This makes exit behavior unit-testable (assert the returned `exitCode`)
 * without mocking `process.exit`, and centralizes the one process-killing
 * call so its policy is consistent across commands.
 */
export interface CliExitResult extends CommandResult {
  /** The exit code the CLI process should terminate with. */
  readonly exitCode: number;
}

/**
 * Builds a {@link CliExitResult} from a raw exit code, deriving `success`
 * from the conventional `0 == success` mapping. Optional human-readable
 * `message` is preserved for callers/tests.
 */
export function cliExit(exitCode: number, message?: string): CliExitResult {
  return message === undefined
    ? { success: exitCode === EXIT_CODES.SUCCESS, exitCode }
    : { success: exitCode === EXIT_CODES.SUCCESS, exitCode, message };
}

/**
 * Maps a handler's `0|non-0` status to the canonical success/failure exit
 * codes (`SUCCESS` / `SERVER_START_FAILED`) used by the bulk of CLI
 * commands, then wraps it in a {@link CliExitResult}. Centralizes the
 * `exitCode === 0 ? SUCCESS : SERVER_START_FAILED` ternary that was
 * duplicated across every handler.
 */
export function cliExitFromStatus(status: number, message?: string): CliExitResult {
  return cliExit(
    status === EXIT_CODES.SUCCESS ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED,
    message
  );
}

/**
 * Explicit sentinel a handler RETURNS to signal "I own my own process
 * lifecycle — do NOT force an exit at the dispatcher" (#3942).
 *
 * Before #3942 this was conveyed by returning `undefined`/`void`, which
 * conflated *intentional* delegation (the MCP stdio server runs until its
 * transport closes, then exits itself) with an *accidentally dropped*
 * return on an error path. A missing return was not a compile error, so
 * `exitWith` would silently no-op and a non-zero exit code would be lost.
 *
 * By typing every handler as {@link CliHandlerResult} (a union that
 * excludes `undefined`/`void`), a handler that falls off the end without
 * returning is a TS2366 compile error ("Function lacks ending return
 * statement…"). Lifecycle-owning handlers RETURN this sentinel explicitly,
 * making delegation a deliberate, checked choice.
 *
 * Implemented as a branded const so it is a single unique value (not just
 * any object), and `exitWith` can match it by identity.
 */
export const LIFECYCLE_DELEGATED = {
  __lifecycleDelegated: true,
} as const;

/**
 * The type of {@link LIFECYCLE_DELEGATED}. A handler whose return type
 * includes this signals lifecycle delegation; see the sentinel docs.
 */
export type LifecycleDelegated = typeof LIFECYCLE_DELEGATED;

/**
 * The exhaustive return contract for every CLI command handler dispatched
 * from `cli-commands.ts` (#3942). A handler EITHER returns a
 * {@link CliExitResult} (the dispatcher exits with its `exitCode`) OR the
 * {@link LIFECYCLE_DELEGATED} sentinel (the dispatcher does nothing because
 * the handler owns the process lifecycle). There is deliberately NO
 * `undefined`/`void` member: that is what makes a dropped return a compile
 * error rather than a silently-swallowed exit code.
 */
export type CliHandlerResult = CliExitResult | LifecycleDelegated;

/**
 * Type guard distinguishing the {@link LIFECYCLE_DELEGATED} sentinel from a
 * {@link CliExitResult}. Used by `exitWith` to handle the handler-result
 * union exhaustively without a `void` fallthrough.
 *
 * Discriminates on the brand property rather than reference identity so the
 * guard is robust across module-boundary/test-mock copies of the sentinel
 * while remaining unambiguous (a `CliExitResult` never carries this brand).
 */
export function isLifecycleDelegated(result: CliHandlerResult): result is LifecycleDelegated {
  return (
    (result as Partial<LifecycleDelegated>).__lifecycleDelegated === true && !('exitCode' in result)
  );
}

/**
 * CLI command types that can be executed.
 */
export type CliCommand =
  | 'server'
  | 'help'
  | 'version'
  | 'hello'
  | 'config'
  | 'expert'
  | 'workflow'
  | 'doctor'
  | 'verify'
  | 'review'
  | 'routing-audit'
  | 'orchestrate'
  | 'system-review'
  | 'vote'
  | 'index'
  | 'research'
  | 'validation'
  | 'learning-metrics'
  | 'setup'
  | 'hooks'
  | 'demo'
  | 'sprint'
  | 'session'
  | 'evaluate'
  | 'issue'
  | 'fitness-audit'
  | 'release-notes'
  | 'release-validate'
  | 'release-announce'
  | 'scaffold'
  | 'visualize'
  | 'capabilities'
  | 'status'
  | 'memory-benchmark'
  | 'auth'
  | 'scenario'
  | 'warm-up'
  | 'e2e-eval'
  | 'routing-ab'
  | 'memory-eval'
  | 'health'
  | 'init'
  | 'validate'
  | 'registry'
  | 'login'
  | 'usage'
  | 'migrate'
  | 'tour'
  | 'improvement-review'
  | 'model-drift'
  | 'auto-remediate'
  | 'remediation-review'
  | 'mode'
  | 'jobs';

/**
 * Parsed CLI arguments and command.
 */
export interface ParsedCliArgs {
  command: CliCommand;
  subcommand?: string;
  options: {
    help: boolean;
    version: boolean;
    verbose: boolean;
    interactive: boolean;
    // Tiered --help output (Issue #2135)
    all: boolean;
    mode: ServerMode;
    output?: string;
    force: boolean;
    format: string;
    input?: string;
    dryRun: boolean;
    banditStats: boolean;
    // Review command options
    setup: boolean;
    skipChecks: boolean;
    // Orchestrate command options (also used in orchestrator mode)
    task?: string;
    model?: string;
    maxTokens?: number;
    maxCostUsd?: number;
    engine?: 'router' | 'puppeteer';
    learn?: boolean;
    policyPath?: string;
    maxSteps?: number;
    // System review command options
    createIssue: boolean;
    fix: boolean;
    // Vote command options
    proposal?: string;
    /** Legacy spelling of the bar; `strategy` wins when both are given (#6227). */
    threshold?: VoteThreshold;
    /** #6227 — `--strategy`, the tool's own enum, passed to the engine as the MCP tool passes it. */
    strategy?: VotingStrategy;
    /** #6227 — `--ratifies-pr <n>@<sha>`, already parsed into the record's binding shape. */
    ratifiesPr?: VoteRecordPrBinding;
    quick: boolean;
    timeoutMs?: number;
    /** #2630 — see `applyErrorPolicy`. */
    errorPolicy?: ErrorPolicy;
    /** #4135 — how the vote command maps a `no_quorum` decision. Default `fail`. */
    onNoQuorum?: NoQuorumPolicy;
    /** #4472 / #4941 — repeatable `--option`, the named alternatives to tally. */
    options?: string[];
    /** #6110 — `--project`, the project the panel judges (replaces `nexus-agents` in the prompts). */
    project?: string;
    // Learning-metrics and validation command options
    period?: string;
    export?: string;
    noTrends?: boolean;
    // Setup command options (Issue #363, #416, #1252, #1253, #1259, #1263)
    nonInteractive: boolean;
    skipMcp: boolean;
    skipRules: boolean;
    skipHooks: boolean;
    skipConfig: boolean;
    skipOpencode: boolean;
    skipGemini: boolean;
    skipCodex: boolean;
    scope?: 'user' | 'project';
    // Setup --custom-api for OpenAI-compatible gateway configuration (#2124)
    customApi?: string;
    customApiKey?: string;
    customModel?: string;
    // Demo command options
    mock: boolean;
    // Doctor command options (Issue #1031)
    deep: boolean;
    /**
     * Run the `serves` readiness level: a real completion per adapter (#4376).
     *
     * Opt-in because it spends generation quota. The default run proves
     * `installed` and `authenticated` only, and reports `serves` as
     * not-attempted rather than assuming it.
     */
    live: boolean;
    /** `doctor --gateway` (#6609): print the measured gateway section. */
    gateway: boolean;
    /** `doctor --probe` (#6609): one completion per gateway family; spends tokens. */
    probe: boolean;
    // Registry command options (#2179)
    json?: boolean;
    source?: string;
    /** model-drift `--file-issue` (#6625): open one issue per new model with `gh`. */
    fileIssue?: boolean;
    // init --portable command options (#2305)
    portable?: boolean;
    gitignore?: boolean;
    // init --portable --mcp-config flag (#2308)
    mcpConfig?: boolean;
    // init --portable --install / --uninstall flags (#2311)
    install?: boolean;
    uninstall?: boolean;
    // init --opencode <path> flag (#2504)
    opencode?: string;
    validate?: boolean;
    // remediation-review command options (#3765)
    evaluator?: string;
    owner?: string;
    note?: string;
    sound?: boolean;
    unsound?: boolean;
    // improvement-review command options (#2444, #6636)
    'file-issues'?: boolean;
    fileIssues?: boolean;
    'lookback-days'?: string;
    lookbackDays?: string;
    'min-sample-size'?: string;
    minSampleSize?: string;
    'fitness-floor'?: string;
    fitnessFloor?: string;
    // Subcommand flags the usage text advertised but the parser rejected (#6693).
    /** `session list --limit <n>`. */
    limit?: number;
    /** `session export --markdown`. */
    markdown?: boolean;
    /** `usage --since=<iso>` / `--until=<iso>`. */
    since?: string;
    until?: string;
    /** `validation --task-type=<a,b>` / `--min-sample=<n>`. */
    taskType?: string;
    minSample?: number;
    /** `sprint --vote`, `research review|prioritize --vote`. */
    vote?: boolean;
    /** `research discover|review|prioritize|autofile --topic=<t>`. */
    topic?: string;
    /** `research status --status=<s>`. */
    status?: string;
    /** `research review --create-issues`. */
    createIssues?: boolean;
    /** `research autofile --max=<n>`. */
    max?: number;
    /** `research index --generate | --check`. */
    generate?: boolean;
    check?: boolean;
    /** `research index --validate --strict`, `release-validate --strict`. */
    strict?: boolean;
    /** `research index --silent`. */
    silent?: boolean;
    /** `research index --no-check-files`. */
    noCheckFiles?: boolean;
    /** `release-validate --skip <validator>` (repeatable). */
    skip?: string[];
  };
  positionals: string[];
}

/**
 * parseArgs configuration for the CLI.
 * (Source: Node.js 22.x util.parseArgs documentation)
 */
export const PARSE_ARGS_CONFIG = {
  options: {
    help: {
      type: 'boolean' as const,
      short: 'h',
      default: false,
    },
    version: {
      type: 'boolean' as const,
      short: 'v',
      default: false,
    },
    verbose: {
      type: 'boolean' as const,
      default: false,
    },
    interactive: {
      type: 'boolean' as const,
      default: false,
    },
    // Tiered --help output (Issue #2135): `--help --all` unhides maintainer commands
    all: {
      type: 'boolean' as const,
      default: false,
    },
    mode: {
      type: 'string' as const,
      short: 'm',
      default: 'server',
    },
    output: {
      type: 'string' as const,
      short: 'o',
    },
    force: {
      type: 'boolean' as const,
      short: 'f',
      default: false,
    },
    format: {
      type: 'string' as const,
      default: 'table',
    },
    input: {
      type: 'string' as const,
      short: 'i',
    },
    'dry-run': {
      type: 'boolean' as const,
      default: false,
    },
    'bandit-stats': {
      type: 'boolean' as const,
      default: false,
    },
    // Review command options
    setup: {
      type: 'boolean' as const,
      default: false,
    },
    'skip-checks': {
      type: 'boolean' as const,
      default: false,
    },
    // Orchestrate command options (also used in orchestrator mode)
    task: {
      type: 'string' as const,
      short: 't',
    },
    model: {
      type: 'string' as const,
    },
    'max-tokens': {
      type: 'string' as const,
    },
    'max-cost-usd': {
      type: 'string' as const,
    },
    // Orchestrate engine options (Issue #386)
    engine: {
      type: 'string' as const,
      default: 'router',
    },
    learn: {
      type: 'boolean' as const,
      default: false,
    },
    'policy-path': {
      type: 'string' as const,
    },
    'max-steps': {
      type: 'string' as const,
    },
    // System review command options
    'create-issue': {
      type: 'boolean' as const,
      default: false,
    },
    fix: {
      type: 'boolean' as const,
      default: false,
    },
    // Vote command options
    proposal: {
      type: 'string' as const,
      short: 'p',
    },
    // Repeatable. No short letter: every free one is taken, and the two
    // collisions that already existed silently bound the wrong option (#4922).
    option: {
      type: 'string' as const,
      multiple: true as const,
    },
    // No `short`. `parseArgs` takes one options object for every command, so
    // a short letter is global: `-t` was already `task`, which won, and
    // `vote -t supermajority` silently ran a simple-majority vote. Long form
    // only — `cli-types.test.ts` pins that no two options share a letter.
    threshold: {
      type: 'string' as const,
    },
    // #6227 — the bar as the tool spells it. `threshold` is the legacy spelling;
    // the engine's `resolveStrategy` lets `strategy` win when both are given.
    strategy: {
      type: 'string' as const,
    },
    // #6227 — `<pr>@<40-hex sha>`: binds the record to a governor-path PR for
    // `scripts/append-ratification-record.ts`. Validated in `buildVoteOptions`.
    'ratifies-pr': {
      type: 'string' as const,
    },
    quick: {
      type: 'boolean' as const,
      short: 'q',
      default: false,
    },
    // #6236 — seconds, read from the same constant `vote --help` renders and
    // `runVote` falls back to. A hard-coded '90' here ran every seat at less
    // than a third of the #1640 budget while the help said 300.
    timeout: {
      type: 'string' as const,
      default: String(VOTE_TIMEOUTS.defaultMs / 1000),
    },
    // #2630 — error policy for the vote command.
    'error-policy': {
      type: 'string' as const,
    },
    // #4135 — how the vote command maps a no_quorum decision (fail|exit2|retry).
    'on-no-quorum': {
      type: 'string' as const,
    },
    // #6110 — the project the voter prompts name; derived from the cwd when absent.
    project: {
      type: 'string' as const,
    },
    // Learning-metrics command options
    // No `short` — `-p` is `proposal`, which was declared first and won. See
    // the note on `threshold`.
    period: {
      type: 'string' as const,
    },
    export: {
      type: 'string' as const,
    },
    'no-trends': {
      type: 'boolean' as const,
      default: false,
    },
    // Setup command options (Issue #363)
    'non-interactive': {
      type: 'boolean' as const,
      default: false,
    },
    'skip-mcp': {
      type: 'boolean' as const,
      default: false,
    },
    'skip-rules': {
      type: 'boolean' as const,
      default: false,
    },
    'skip-hooks': {
      type: 'boolean' as const,
      default: false,
    },
    'skip-config': {
      type: 'boolean' as const,
      default: false,
    },
    'skip-opencode': {
      type: 'boolean' as const,
      default: false,
    },
    'skip-gemini': {
      type: 'boolean' as const,
      default: false,
    },
    'skip-codex': {
      type: 'boolean' as const,
      default: false,
    },
    scope: {
      type: 'string' as const,
      default: 'user',
    },
    // Setup --custom-api for OpenAI-compatible gateway configuration (#2124)
    'custom-api': {
      type: 'string' as const,
    },
    'custom-api-key': {
      type: 'string' as const,
    },
    'custom-model': {
      type: 'string' as const,
    },
    // Demo command options
    mock: {
      type: 'boolean' as const,
      default: false,
    },
    // Doctor command options (Issue #1031)
    deep: {
      type: 'boolean' as const,
      default: false,
    },
    // Doctor live readiness probe (#4376)
    live: {
      type: 'boolean' as const,
      default: false,
    },
    // Doctor gateway section and opt-in completion probe (#6609)
    gateway: {
      type: 'boolean' as const,
      default: false,
    },
    probe: {
      type: 'boolean' as const,
      default: false,
    },
    // Registry command options (#2179)
    json: {
      type: 'boolean' as const,
      default: false,
    },
    // model-drift command option (#6625)
    'file-issue': {
      type: 'boolean' as const,
      default: false,
    },
    source: {
      type: 'string' as const,
    },
    // init --portable command options (#2305)
    portable: {
      type: 'boolean' as const,
      default: false,
    },
    gitignore: {
      type: 'boolean' as const,
      default: false,
    },
    // init --portable --mcp-config flag (#2308)
    'mcp-config': {
      type: 'boolean' as const,
      default: false,
    },
    // init --portable --install / --uninstall flags (#2311)
    install: {
      type: 'boolean' as const,
      default: false,
    },
    uninstall: {
      type: 'boolean' as const,
      default: false,
    },
    // improvement-review command options (#2444)
    'lookback-days': {
      type: 'string' as const,
    },
    'file-issues': {
      type: 'boolean' as const,
      default: false,
    },
    'min-sample-size': {
      type: 'string' as const,
    },
    'fitness-floor': {
      type: 'string' as const,
    },
    // init --opencode <path> flag (#2504)
    opencode: {
      type: 'string' as const,
    },
    validate: {
      type: 'boolean' as const,
      default: false,
    },
    // remediation-review command options (#3765)
    evaluator: {
      type: 'string' as const,
    },
    owner: {
      type: 'string' as const,
    },
    note: {
      type: 'string' as const,
    },
    sound: {
      type: 'boolean' as const,
      default: false,
    },
    unsound: {
      type: 'boolean' as const,
      default: false,
    },
    // #6693 — subcommand flags that usage text advertised and handlers read,
    // but that this strict parser rejected as `Unknown option`. Forwarded by
    // `buildSubcommandFlagOptions` (cli/subcommand-flag-options.ts). No short
    // letters: a short letter is global (see the note on `threshold`).
    limit: { type: 'string' as const },
    markdown: { type: 'boolean' as const, default: false },
    since: { type: 'string' as const },
    until: { type: 'string' as const },
    'task-type': { type: 'string' as const },
    'min-sample': { type: 'string' as const },
    vote: { type: 'boolean' as const, default: false },
    topic: { type: 'string' as const },
    status: { type: 'string' as const },
    'create-issues': { type: 'boolean' as const, default: false },
    max: { type: 'string' as const },
    generate: { type: 'boolean' as const, default: false },
    check: { type: 'boolean' as const, default: false },
    strict: { type: 'boolean' as const, default: false },
    silent: { type: 'boolean' as const, default: false },
    'no-check-files': { type: 'boolean' as const, default: false },
    skip: { type: 'string' as const, multiple: true as const },
  },
  allowPositionals: true,
  strict: true,
} as const;

/**
 * Every command name {@link isValidCommand} accepts. Exported so the parity
 * gate (`command-parity.test.ts`, #3212) can assert it stays consistent with
 * the real dispatch tables and `COMMAND_CATALOG`, rather than trusting the
 * `isValidCommand` predicate alone.
 */
export const VALID_COMMANDS: readonly CliCommand[] = [
  'server',
  'help',
  'version',
  'hello',
  'config',
  'expert',
  'workflow',
  'doctor',
  'verify',
  'review',
  'routing-audit',
  'orchestrate',
  'system-review',
  'vote',
  'index',
  'research',
  'validation',
  'learning-metrics',
  'setup',
  'hooks',
  'demo',
  'sprint',
  'session',
  'evaluate',
  'issue',
  'fitness-audit',
  'release-notes',
  'release-validate',
  'release-announce',
  'scaffold',
  'visualize',
  'capabilities',
  'status',
  'memory-benchmark',
  'auth',
  'scenario',
  'warm-up',
  'e2e-eval',
  'routing-ab',
  'memory-eval',
  'health',
  'init',
  'validate',
  'registry',
  'login',
  'usage',
  'improvement-review',
  'model-drift',
  'migrate',
  'tour',
  'auto-remediate',
  'remediation-review',
  'mode',
  'jobs',
];

/**
 * Checks if a string is a valid CLI command.
 */
export function isValidCommand(value: string): value is CliCommand {
  return (VALID_COMMANDS as readonly string[]).includes(value);
}
