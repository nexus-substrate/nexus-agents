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

/**
 * Maps internal model names to Claude CLI aliases.
 * CLI accepts: 'sonnet', 'opus', 'haiku' or full names like 'claude-sonnet-4-5-20250929'
 */
const MODEL_TO_CLI_ALIAS: Record<string, string> = {
  'claude-sonnet-4': 'sonnet',
  'claude-opus-4': 'opus',
  'claude-haiku-3': 'haiku',
  'claude-opus-4-5-20251101': 'opus',
  // Allow direct aliases to pass through
  sonnet: 'sonnet',
  opus: 'opus',
  haiku: 'haiku',
};

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
    this.model = options?.model ?? 'sonnet';
  }

  /**
   * Gets Claude model information.
   */
  getModelInfo(): ModelInfo {
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
