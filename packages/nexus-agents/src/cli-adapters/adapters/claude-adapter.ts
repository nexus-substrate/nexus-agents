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
import { SubprocessCliAdapter } from '../base-adapter.js';
import { ClaudeResponseParser } from '../parsers/claude-parser.js';
import type { ILogger } from '../../core/index.js';

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
    this.model = options?.model ?? 'claude-sonnet-4';
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
   */
  protected getCommand(task: CliTask): { command: string; args: string[] } {
    const args: string[] = ['-p', '--output-format', 'json'];

    // Add model (always present due to default)
    const model = task.model ?? this.model;
    args.push('--model', model);

    // Add system prompt if provided
    if (task.systemPrompt !== undefined && task.systemPrompt !== '') {
      args.push('--system-prompt', task.systemPrompt);
    }

    // Add session for continuation
    if (task.sessionId !== undefined && task.sessionId !== '') {
      args.push('--resume', task.sessionId);
    }

    // Add max tokens if specified
    if (task.maxTokens !== undefined && task.maxTokens > 0) {
      args.push('--max-tokens', String(task.maxTokens));
    }

    // Add the task content as the prompt
    args.push(task.content);

    return { command: 'claude', args };
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
    };

    return costs[this.model] ?? 15.0;
  }
}
