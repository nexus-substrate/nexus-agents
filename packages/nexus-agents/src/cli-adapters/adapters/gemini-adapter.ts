/**
 * nexus-agents/cli-adapters - Gemini CLI Adapter
 *
 * Subprocess-based adapter for Gemini CLI.
 * Uses JSON output format for stable parsing.
 *
 * (Source: cli-project_plan.md v2.1.0)
 * (Source: docs/research/cli-integration-architecture.md)
 */

import type { ICliResponseParser, CliTask, ModelInfo, CliName } from '../types.js';
import { SubprocessCliAdapter, type CommandConfig } from '../subprocess-adapter.js';
import { GeminiResponseParser } from '../parsers/gemini-parser.js';
import type { ILogger } from '../../core/index.js';

/**
 * Gemini CLI adapter using subprocess transport.
 * Executes: gemini "<task>" -o json
 */
export class GeminiCliAdapter extends SubprocessCliAdapter {
  readonly name: CliName = 'gemini';
  protected readonly parser: ICliResponseParser = new GeminiResponseParser();

  private readonly model: string;

  constructor(options?: { model?: string; logger?: ILogger }) {
    super(options?.logger);
    this.model = options?.model ?? 'gemini-2.5-flash';
  }

  /**
   * Gets Gemini model information.
   */
  getModelInfo(): ModelInfo {
    return {
      id: this.model,
      name: this.getModelDisplayName(),
      contextWindow: this.getContextWindow(),
      maxOutput: 8_192,
      costPerMillionInput: this.getCostPerMillionInput(),
      costPerMillionOutput: this.getCostPerMillionOutput(),
    };
  }

  /**
   * Gets CLI command and arguments for execution.
   */
  protected getCommand(task: CliTask): CommandConfig {
    const args: string[] = [];

    // Add the task content as positional argument
    args.push(task.content);

    // Add output format
    args.push('-o', 'json');

    // Add model (always present due to default)
    const model = task.model ?? this.model;
    args.push('-m', model);

    // Add session for continuation
    if (task.sessionId !== undefined && task.sessionId !== '') {
      args.push('--resume', task.sessionId);
    }

    // Add sandbox mode for safety
    args.push('-s');

    return { command: 'gemini', args };
  }

  /**
   * Gets model display name.
   */
  private getModelDisplayName(): string {
    const displayNames: Record<string, string> = {
      'gemini-2.5-pro': 'Gemini 2.5 Pro',
      'gemini-2.5-flash': 'Gemini 2.5 Flash',
      'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',
    };

    return displayNames[this.model] ?? this.model;
  }

  /**
   * Gets context window for model.
   */
  private getContextWindow(): number {
    // Gemini models support up to 1M tokens
    const contextWindows: Record<string, number> = {
      'gemini-2.5-pro': 1_000_000,
      'gemini-2.5-flash': 1_000_000,
      'gemini-2.5-flash-lite': 1_000_000,
    };

    return contextWindows[this.model] ?? 1_000_000;
  }

  /**
   * Gets cost per million input tokens.
   */
  private getCostPerMillionInput(): number {
    const costs: Record<string, number> = {
      'gemini-2.5-pro': 1.25,
      'gemini-2.5-flash': 0.075,
      'gemini-2.5-flash-lite': 0.015,
    };

    return costs[this.model] ?? 0.075;
  }

  /**
   * Gets cost per million output tokens.
   */
  private getCostPerMillionOutput(): number {
    const costs: Record<string, number> = {
      'gemini-2.5-pro': 10.0,
      'gemini-2.5-flash': 0.3,
      'gemini-2.5-flash-lite': 0.06,
    };

    return costs[this.model] ?? 0.3;
  }
}
