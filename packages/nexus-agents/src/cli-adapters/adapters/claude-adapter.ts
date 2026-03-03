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
import { DEFAULT_MODEL_CAPABILITIES } from '../../config/model-capabilities.js';
import {
  getDefaultModelForCli,
  getCliModelName,
  buildModelInfo,
} from '../../config/model-config-helpers.js';

/**
 * Maps internal model names to Claude CLI aliases.
 * CLI accepts: 'sonnet', 'opus', 'haiku' or full names like 'claude-sonnet-4-6'
 * Built from canonical registry + legacy names for backward compatibility.
 */
const MODEL_TO_CLI_ALIAS: Record<string, string> = buildClaudeAliasMap();

/** Builds alias map from canonical registry + legacy versioned names. */
function buildClaudeAliasMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const model of DEFAULT_MODEL_CAPABILITIES.models) {
    if (model.cliName === 'claude' && model.cliAlias !== undefined) {
      // Allow direct alias pass-through
      map[model.cliAlias] = model.cliAlias;
    }
  }
  // Legacy versioned names → short CLI aliases
  map['claude-sonnet-4'] = 'sonnet';
  map['claude-sonnet-4-6'] = 'sonnet';
  map['claude-sonnet-4-5-20250929'] = 'sonnet'; // Legacy compat
  map['claude-opus-4'] = 'opus';
  map['claude-opus-4-6'] = 'opus';
  map['claude-opus-4-5-20251101'] = 'opus';
  map['claude-haiku-3'] = 'haiku';
  map['claude-haiku-4-5-20251001'] = 'haiku';
  return map;
}

/** Legacy fallback values for Claude models not in the canonical registry. */
const CLAUDE_LEGACY_DEFAULTS = {
  displayNames: {
    'claude-opus-4': 'Claude Opus 4',
    'claude-sonnet-4': 'Claude Sonnet 4',
    'claude-haiku-3': 'Claude Haiku 3',
    'claude-opus-4-5-20251101': 'Claude Opus 4.5',
    opus: 'Claude Opus 4.6',
    sonnet: 'Claude Sonnet 4.6',
    haiku: 'Claude Haiku 4.5',
  } as Readonly<Record<string, string>>,
  inputCosts: {
    'claude-opus-4': 15.0,
    'claude-opus-4-5-20251101': 5.0,
    'claude-sonnet-4': 3.0,
    'claude-haiku-3': 0.25,
    opus: 5.0,
    sonnet: 3.0,
    haiku: 1.0,
  } as Readonly<Record<string, number>>,
  outputCosts: {
    'claude-opus-4': 75.0,
    'claude-opus-4-5-20251101': 25.0,
    'claude-sonnet-4': 15.0,
    'claude-haiku-3': 1.25,
    opus: 25.0,
    sonnet: 15.0,
    haiku: 5.0,
  } as Readonly<Record<string, number>>,
  inputCost: 5.0,
  outputCost: 25.0,
} as const;

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
   * Gets Claude model information.
   * buildModelInfo matches both cliModelName and cliAlias, so a single
   * call handles 'opus', 'sonnet', 'haiku', and full model names.
   * Falls back to legacy lookup for unrecognized models.
   */
  getModelInfo(): ModelInfo {
    const fromRegistry = buildModelInfo('claude', this.model);
    if (fromRegistry !== undefined) return fromRegistry;

    return {
      id: this.model,
      name: CLAUDE_LEGACY_DEFAULTS.displayNames[this.model] ?? this.model,
      contextWindow: 200_000,
      maxOutput: 64_000,
      costPerMillionInput:
        CLAUDE_LEGACY_DEFAULTS.inputCosts[this.model] ?? CLAUDE_LEGACY_DEFAULTS.inputCost,
      costPerMillionOutput:
        CLAUDE_LEGACY_DEFAULTS.outputCosts[this.model] ?? CLAUDE_LEGACY_DEFAULTS.outputCost,
    };
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

    // Add working directory for file access (e.g., SWE-bench)
    const workDir = task.options?.['workDir'];
    if (typeof workDir === 'string' && workDir.length > 0) {
      args.push('--add-dir', workDir);
    }

    // Note: maxTokens is intentionally not passed to Claude CLI.
    // The Claude CLI does not support --max-tokens. Use --max-budget-usd instead.
    // The CLI handles token limits internally based on model configuration.

    // Pass prompt via stdin to avoid argument escaping issues
    return { command: 'claude', args, stdin: task.content };
  }
}
