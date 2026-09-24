/**
 * nexus-agents/cli-adapters - Claude CLI Adapter
 *
 * Subprocess-based adapter for Claude CLI.
 * Uses JSON output format for stable parsing.
 *
 * (Source: cli-project_plan.md v2.1.0)
 * (Source: docs/research/cli-integration-architecture.md)
 */

import type {
  ICliResponseParser,
  CliTask,
  CliResponse,
  CliError,
  ModelInfo,
  CliName,
  BaseAdapterOptions,
  ResolvedExecutionOptions,
} from '../types.js';
import type { Result } from '../../core/index.js';
import { ok } from '../../core/index.js';
import { SubprocessCliAdapter, type CommandConfig } from '../subprocess-adapter.js';
import {
  accessModeConflict,
  isReadOnlyAnalysis,
  isWorkspaceEdit,
  restrictedAccessMode,
} from '../access-mode.js';
import { ClaudeResponseParser } from '../parsers/claude-parser.js';
import type { CliModelInfo } from '../types-capability.js';
import { listModelsForCli } from '../../config/models-dev-by-vendor.js';
import { getDefaultRegistry } from '../../config/model-registry.js';
import { isDurableCapacityText } from '../../adapters/rate-limit-detector.js';
import {
  getDefaultModelForCli,
  getCliModelName,
  buildModelInfo,
  findInTreeByCli,
  FALLBACK_CONTEXT_WINDOW,
  FALLBACK_MAX_OUTPUT,
} from '../../config/model-config-helpers.js';

/**
 * Maps internal model names → Claude CLI aliases. Derived entirely from the
 * canonical registry: every claude entry contributes its `cliAlias` (passthrough),
 * its registry `id`, its `cliModelName`, and every legacy-name in `aliases[]`. Migration of these
 * legacy strings into the registry happened in #2200 Child 1.
 */
const MODEL_TO_CLI_ALIAS: Record<string, string> = buildClaudeAliasMap();

function buildClaudeAliasMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const model of findInTreeByCli('claude')) {
    if (model.cliAlias === undefined) continue;
    const alias = model.cliAlias;
    map[alias] = alias;
    // #6599: the canonical registry id is what a model-bound request carries
    // (`getAdapterForModel`, `resolveModelForTier`); the claude binary rejects
    // it as `unrecognized_model`, so it must map to the alias too.
    map[model.id] = alias;
    if (model.cliModelName !== undefined) map[model.cliModelName] = alias;
    for (const legacyName of model.aliases ?? []) {
      map[legacyName] = alias;
    }
  }
  return map;
}

/**
 * Default cost when an unrecognized model id is passed (pricing matches
 * current Opus, the strongest tier — conservative over-estimate). Per-model
 * legacy cost overrides were removed in #2200 Child 1; they're reachable
 * via the registry now.
 */
const UNKNOWN_MODEL_DEFAULT_INPUT_COST = 5.0;
const UNKNOWN_MODEL_DEFAULT_OUTPUT_COST = 25.0;

/**
 * Task option that disables the in-family fallback (#6120). A probe that
 * wants to know whether ONE model answers — doctor's pinned-model line —
 * must not be answered by its sibling.
 */
export const IN_FAMILY_FALLBACK_OPTION = 'inFamilyFallback';

/** Resolve an internal model name, legacy name or alias to the CLI alias. */
function toCliAlias(internalModel: string): string {
  return MODEL_TO_CLI_ALIAS[internalModel] ?? internalModel;
}

/**
 * The claude alias the registry lists after `alias`, or undefined when
 * `alias` is the last one (or not a registry alias at all — no basis for a
 * "next"). Read from the registry at call time rather than a module-load
 * constant so an operator overlay is honoured; the order is the registry's
 * (in-tree: fable → opus → sonnet → haiku), not a hard-coded list.
 */
function nextClaudeAlias(alias: string): string | undefined {
  const aliases = getDefaultRegistry()
    .allEntries()
    .flatMap((entry) =>
      entry.cliName === 'claude' && entry.cliAlias !== undefined ? [entry.cliAlias] : []
    );
  const at = aliases.indexOf(alias);
  return at === -1 ? undefined : aliases[at + 1];
}

/**
 * The ONLY built-in claude tools a read-only analysis seat may use (#6754),
 * passed as `--tools`. An allow list fails closed: a tool claude adds later,
 * a search tool, or a subagent tool is absent unless named here. Verified on
 * claude 2.1.281: with `--tools Read,Grep,Glob` the model reported having
 * exactly those three and made no search or fetch request.
 */
const CLAUDE_READ_ONLY_TOOLS = ['Read', 'Grep', 'Glob'] as const;

/**
 * Tools also denied outright under read-only analysis (#6754). Redundant with
 * {@link CLAUDE_READ_ONLY_TOOLS}; kept so a settings-file allow rule cannot
 * re-admit any of them if the allow list is ever widened by mistake.
 */
const CLAUDE_READ_ONLY_DISALLOWED_TOOLS = [
  'Bash',
  'Edit',
  'Write',
  'NotebookEdit',
  'WebFetch',
  'WebSearch',
] as const;

/**
 * The ONLY built-in claude tools a workspace-edit task may use (#6792), passed
 * as `--tools`: the read tools plus the two file-edit tools. No command,
 * network, notebook or subagent tool.
 *
 * Measured on claude 2.1.281 with `--permission-mode acceptEdits`, run in a
 * throwaway directory on a host whose settings file has `defaultMode: "auto"`
 * and allow rules for `WebSearch` and `Bash(node:*)`: the session was offered
 * exactly these five tools; an Edit inside the working directory landed; a
 * Write to a path OUTSIDE it was refused as a permission denial and the file
 * was not created. `--add-dir` widens the writable set, so the adapter only
 * ever adds the task's own `workDir`, which is also the subprocess cwd.
 */
const CLAUDE_WORKSPACE_EDIT_TOOLS = ['Read', 'Grep', 'Glob', 'Edit', 'Write'] as const;

/**
 * Tools also denied outright under workspace-edit (#6792), for the same reason
 * as {@link CLAUDE_READ_ONLY_DISALLOWED_TOOLS}.
 */
const CLAUDE_WORKSPACE_EDIT_DISALLOWED_TOOLS = [
  'Bash',
  'NotebookEdit',
  'WebFetch',
  'WebSearch',
] as const;

/**
 * The argv that enforces the task's restricted access mode, or `undefined`
 * in the default mode. Each pins the permission mode so a settings-file
 * default such as `auto` cannot widen it, offers only its allow list, loads
 * no MCP server and denies the excluded tools again.
 *
 * - #6754 read-only analysis: `manual` is the documented mode; in print mode
 *   nothing that would prompt can be approved.
 * - #6792 workspace-edit: `acceptEdits` approves edits inside the working
 *   directory and refuses the rest in print mode.
 */
function restrictedModeArgs(task: CliTask): readonly string[] | undefined {
  if (isReadOnlyAnalysis(task)) {
    return [
      '--permission-mode',
      'manual',
      '--tools',
      CLAUDE_READ_ONLY_TOOLS.join(','),
      '--strict-mcp-config',
      '--disallowedTools',
      CLAUDE_READ_ONLY_DISALLOWED_TOOLS.join(','),
    ];
  }
  if (isWorkspaceEdit(task)) {
    return [
      '--permission-mode',
      'acceptEdits',
      '--tools',
      CLAUDE_WORKSPACE_EDIT_TOOLS.join(','),
      '--strict-mcp-config',
      '--disallowedTools',
      CLAUDE_WORKSPACE_EDIT_DISALLOWED_TOOLS.join(','),
    ];
  }
  return undefined;
}

/**
 * Claude CLI adapter using subprocess transport.
 * Executes: claude -p --output-format json "<task>"
 */
export class ClaudeCliAdapter extends SubprocessCliAdapter {
  readonly name: CliName = 'claude';
  override readonly enforcesReadOnlyAnalysis = true;
  override readonly enforcesWorkspaceEdit = true;
  protected readonly parser: ICliResponseParser = new ClaudeResponseParser();

  private readonly model: string;

  constructor(options?: BaseAdapterOptions) {
    super(options?.logger);
    this.model = options?.model ?? getCliModelName(getDefaultModelForCli('claude'));
  }

  /**
   * Key-free model enumeration (#3405): the claude CLI has no list-models
   * command and its OAuth token can't call /v1/models, so we enumerate the
   * vendor's models from the models.dev snapshot. Existence only.
   */
  listModels(): Promise<readonly CliModelInfo[]> {
    return Promise.resolve(listModelsForCli(this.name));
  }

  /**
   * Gets Claude model information.
   * `buildModelInfo` matches `cliModelName`, `cliAlias`, and `aliases[]` —
   * a single call handles 'opus', 'sonnet', 'haiku', current model names,
   * and the legacy `claude-opus-4` / `claude-haiku-3` / etc. entries that
   * live in the registry's aliases since #2200 Child 1.
   *
   * Truly unrecognized models fall through to conservative defaults
   * (current Opus pricing).
   */
  getModelInfo(): ModelInfo {
    const fromRegistry = buildModelInfo('claude', this.model);
    if (fromRegistry !== undefined) return fromRegistry;

    return {
      id: this.model,
      name: this.model,
      contextWindow: FALLBACK_CONTEXT_WINDOW,
      maxOutput: FALLBACK_MAX_OUTPUT,
      costPerMillionInput: UNKNOWN_MODEL_DEFAULT_INPUT_COST,
      costPerMillionOutput: UNKNOWN_MODEL_DEFAULT_OUTPUT_COST,
    };
  }

  /**
   * Run the task, and on an out-of-credits envelope for the requested model
   * retry ONCE with the next claude alias the registry lists (#6120).
   *
   * The credit exhaustion the claude CLI reports is per MODEL — `fable`
   * answered "You're out of usage credits" while `sonnet` answered the same
   * prompt — so it is not evidence against the CLI, and it must not reach the
   * per-CLI circuit breaker as one. The breaker records what leaves this
   * method: a substituted success records nothing, and a second capacity
   * error propagates as the typed error and counts once, because by then the
   * family, not one model, has failed. A non-capacity `is_error` (auth, a
   * server error) is returned as-is; another model would not fix it.
   *
   * The substitution is stamped on the response as `fallbackFrom` so a vote
   * record can say which model actually answered (#6115).
   */
  override async executeTask(
    task: CliTask,
    options: ResolvedExecutionOptions
  ): Promise<Result<CliResponse, CliError>> {
    const first = await super.executeTask(task, options);
    if (first.ok || !isDurableCapacityText(first.error.message)) return first;
    if (task.options?.[IN_FAMILY_FALLBACK_OPTION] === false) return first;

    const requested = toCliAlias(task.model ?? this.model);
    const next = nextClaudeAlias(requested);
    if (next === undefined) return first;

    this.logger.warn('Claude model out of usage credits; retrying once with the next alias', {
      requested,
      next,
    });
    const second = await super.executeTask({ ...task, model: next }, options);
    if (!second.ok) return second;
    return ok({ ...second.value, model: next, fallbackFrom: requested });
  }

  /**
   * #6754/#6792: a permission bypass would defeat either restricted mode, so
   * the combination is refused rather than resolved one way silently.
   */
  protected override accessModeRefusal(task: CliTask): CliError | undefined {
    const base = super.accessModeRefusal(task);
    const mode = restrictedAccessMode(task);
    if (base !== undefined || mode === undefined) return base;
    if (task.options?.['skipPermissions'] === true) {
      return accessModeConflict(this.name, mode, 'the task also asks to skip permissions');
    }
    // `--strict-mcp-config` still loads the servers `--mcp-config` names, and
    // an MCP server's tools are outside the built-in allow list.
    if (typeof task.options?.['mcpConfigPath'] === 'string') {
      return accessModeConflict(this.name, mode, 'the task also names an MCP config');
    }
    return undefined;
  }

  /** Appends optional string-type task options to CLI args. */
  private appendTaskOptions(args: string[], task: CliTask): void {
    const workDir = task.options?.['workDir'];
    if (typeof workDir === 'string' && workDir.length > 0) {
      args.push('--add-dir', workDir);
    }
    const mcpConfigPath = task.options?.['mcpConfigPath'];
    if (typeof mcpConfigPath === 'string' && mcpConfigPath.length > 0) {
      args.push('--mcp-config', mcpConfigPath);
    }
    const modeArgs = restrictedModeArgs(task);
    if (modeArgs !== undefined) {
      args.push(...modeArgs);
      return;
    }
    // Allow full tool access in non-interactive mode (needed for SWE-bench)
    if (task.options?.['skipPermissions'] === true) {
      args.push('--dangerously-skip-permissions');
    }
  }

  /**
   * Gets CLI command and arguments for execution.
   * Uses stdin for the prompt to avoid argument escaping issues,
   * especially important when using --add-dir.
   */
  protected getCommand(task: CliTask): CommandConfig {
    const args: string[] = ['-p', '--output-format', 'json'];

    // Add model - convert internal names to CLI aliases
    const internalModel = task.model ?? this.model;
    const cliModel = toCliAlias(internalModel);
    args.push('--model', cliModel);

    // Add system prompt if provided
    if (task.systemPrompt !== undefined && task.systemPrompt !== '') {
      args.push('--system-prompt', task.systemPrompt);
    }

    // Add session for continuation
    if (task.sessionId !== undefined && task.sessionId !== '') {
      args.push('--resume', task.sessionId);
    }

    this.appendTaskOptions(args, task);

    // Note: maxTokens is intentionally not passed to Claude CLI.
    // The Claude CLI does not support --max-tokens. Use --max-budget-usd instead.
    // The CLI handles token limits internally based on model configuration.

    // Pass prompt via stdin to avoid argument escaping issues
    return { command: 'claude', args, stdin: task.content };
  }
}
