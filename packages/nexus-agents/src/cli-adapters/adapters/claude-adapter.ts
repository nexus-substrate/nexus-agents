/**
 * nexus-agents/cli-adapters - Claude CLI Adapter
 *
 * Subprocess-based adapter for Claude CLI.
 * Uses JSON output format for stable parsing.
 *
 * (Source: cli-project_plan.md v2.1.0)
 * (Source: docs/research/cli-integration-architecture.md)
 */

import type { ICliResponseParser, CliTask, ModelInfo, CliName } from '../types.js';
import { SubprocessCliAdapter, type CommandConfig } from '../subprocess-adapter.js';
import { ClaudeResponseParser } from '../parsers/claude-parser.js';
import type { ILogger } from '../../core/index.js';
import { DEFAULT_MODEL_CAPABILITIES } from '../../config/model-capabilities.js';
import {
  resolveCliAlias,
  getDefaultModelForCli,
  getCliModelName,
} from '../../config/model-config-helpers.js';

/**
 * Maps internal model names to Claude CLI aliases.
 * CLI accepts: 'sonnet', 'opus', 'haiku' or full names like 'claude-sonnet-4-5-20250929'
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
  // Legacy versioned names
  map['claude-sonnet-4'] = 'sonnet';
  map['claude-opus-4'] = 'opus';
  map['claude-haiku-3'] = 'haiku';
  map['claude-opus-4-5-20251101'] = 'opus';
  return map;
}

/**
 * Claude CLI adapter using subprocess transport.
 * Executes: claude -p --output-format json "<task>"
 */
export class ClaudeCliAdapter extends SubprocessCliAdapter {
  readonly name: CliName = 'claude';
  protected readonly parser: ICliResponseParser = new ClaudeResponseParser();

  private readonly model: string;

  constructor(options?: { model?: string; logger?: ILogger }) {
    super(options?.logger);
    this.model = options?.model ?? getCliModelName(getDefaultModelForCli('claude'));
  }

  /**
   * Gets Claude model information.
   * Resolves from canonical registry when possible, falls back to legacy lookup.
   */
  getModelInfo(): ModelInfo {
    const resolved = resolveCliAlias(this.model);
    if (resolved !== undefined) {
      const cap = DEFAULT_MODEL_CAPABILITIES.models.find((m) => m.id === resolved);
      if (cap !== undefined) {
        const info: ModelInfo = {
          id: this.model,
          name: cap.displayName,
          contextWindow: cap.contextWindow,
        };
        // Only set optional properties when values exist (exactOptionalPropertyTypes)
        if (cap.maxOutputTokens !== undefined) {
          (info as { maxOutput: number }).maxOutput = cap.maxOutputTokens;
        }
        if (cap.pricing !== undefined) {
          (info as { costPerMillionInput: number }).costPerMillionInput = cap.pricing.inputPer1M;
          (info as { costPerMillionOutput: number }).costPerMillionOutput = cap.pricing.outputPer1M;
        }
        return info;
      }
    }
    return {
      id: this.model,
      name: this.getModelDisplayName(),
      contextWindow: 200_000,
      maxOutput: 64_000,
      costPerMillionInput: this.getCostPerMillionInput(),
      costPerMillionOutput: this.getCostPerMillionOutput(),
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

  /**
   * Gets model display name.
   */
  private getModelDisplayName(): string {
    const displayNames: Record<string, string> = {
      'claude-opus-4': 'Claude Opus 4',
      'claude-sonnet-4': 'Claude Sonnet 4',
      'claude-haiku-3': 'Claude Haiku 3',
      'claude-opus-4-5-20251101': 'Claude Opus 4.5',
      opus: 'Claude Opus 4',
      sonnet: 'Claude Sonnet 4',
      haiku: 'Claude Haiku 3',
    };

    return displayNames[this.model] ?? this.model;
  }

  /**
   * Gets cost per million input tokens.
   */
  private getCostPerMillionInput(): number {
    const costs: Record<string, number> = {
      'claude-opus-4': 15.0,
      'claude-opus-4-5-20251101': 15.0,
      'claude-sonnet-4': 3.0,
      'claude-haiku-3': 0.25,
      opus: 15.0,
      sonnet: 3.0,
      haiku: 0.25,
    };

    return costs[this.model] ?? 3.0;
  }

  /**
   * Gets cost per million output tokens.
   */
  private getCostPerMillionOutput(): number {
    const costs: Record<string, number> = {
      'claude-opus-4': 75.0,
      'claude-opus-4-5-20251101': 75.0,
      'claude-sonnet-4': 15.0,
      'claude-haiku-3': 1.25,
      opus: 75.0,
      sonnet: 15.0,
      haiku: 1.25,
    };

    return costs[this.model] ?? 15.0;
  }
}
