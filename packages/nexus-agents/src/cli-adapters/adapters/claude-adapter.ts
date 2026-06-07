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
  ModelInfo,
  CliName,
  BaseAdapterOptions,
} from '../types.js';
import { SubprocessCliAdapter, type CommandConfig } from '../subprocess-adapter.js';
import { ClaudeResponseParser } from '../parsers/claude-parser.js';
import type { CliModelInfo } from '../types-capability.js';
import { listModelsForCli } from '../../config/models-dev-by-vendor.js';
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
 * its `cliModelName`, and every legacy-name in `aliases[]`. Migration of these
 * legacy strings into the registry happened in #2200 Child 1.
 */
const MODEL_TO_CLI_ALIAS: Record<string, string> = buildClaudeAliasMap();

function buildClaudeAliasMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const model of findInTreeByCli('claude')) {
    if (model.cliAlias === undefined) continue;
    const alias = model.cliAlias;
    map[alias] = alias;
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
 * Claude CLI adapter using subprocess transport.
 * Executes: claude -p --output-format json "<task>"
 */
export class ClaudeCliAdapter extends SubprocessCliAdapter {
  readonly name: CliName = 'claude';
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
    const cliModel = MODEL_TO_CLI_ALIAS[internalModel] ?? internalModel;
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
