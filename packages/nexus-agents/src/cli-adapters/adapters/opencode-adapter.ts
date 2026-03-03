/**
 * nexus-agents/cli-adapters - OpenCode CLI Adapter
 *
 * Subprocess-based adapter for OpenCode CLI.
 * Uses `opencode run --format json` for stable parsing.
 *
 * (Source: Issue #1124, opencode.ai/docs/cli/)
 */

import type {
  ICliResponseParser,
  CliTask,
  ModelInfo,
  CliName,
  BaseAdapterOptions,
} from '../types.js';
import { SubprocessCliAdapter, type CommandConfig } from '../subprocess-adapter.js';
import { OpenCodeResponseParser } from '../parsers/opencode-parser.js';
import {
  getDefaultModelForCli,
  getCliModelName,
  buildModelInfo,
} from '../../config/model-config-helpers.js';

/** Strict allowlist for OpenCode --variant flag values. */
const ALLOWED_VARIANTS = ['high', 'max', 'minimal'];

/**
 * OpenCode CLI adapter using subprocess transport.
 * Executes: opencode run --format json "<task>"
 */
export class OpenCodeCliAdapter extends SubprocessCliAdapter {
  readonly name: CliName = 'opencode';
  protected readonly parser: ICliResponseParser = new OpenCodeResponseParser();

  private readonly model: string;

  constructor(options?: BaseAdapterOptions) {
    super(options?.logger);
    this.model = options?.model ?? getCliModelName(getDefaultModelForCli('opencode'));
  }

  /**
   * Gets OpenCode model information from canonical registry.
   */
  getModelInfo(): ModelInfo {
    const fromRegistry = buildModelInfo('opencode', this.model);
    if (fromRegistry !== undefined) return fromRegistry;

    return {
      id: this.model,
      name: `OpenCode (${this.model})`,
      contextWindow: 200_000,
      maxOutput: 64_000,
      costPerMillionInput: 3.0,
      costPerMillionOutput: 15.0,
    };
  }

  /**
   * Gets CLI command and arguments for execution.
   * Uses `opencode run` with JSON format for stable parsing.
   */
  protected getCommand(task: CliTask): CommandConfig {
    const args: string[] = ['run', '--format', 'json'];

    // Add model selection
    const internalModel = task.model ?? this.model;
    args.push('--model', internalModel);

    // Add working directory if specified
    const workDir = task.options?.['workDir'];
    if (typeof workDir === 'string' && workDir.length > 0) {
      args.push('--dir', workDir);
    }

    // Add reasoning variant if specified (strict allowlist)
    const variant = task.options?.['variant'];
    if (typeof variant === 'string' && ALLOWED_VARIANTS.includes(variant)) {
      args.push('--variant', variant);
    }

    // Add thinking flag if specified (boolean only)
    if (task.options?.['thinking'] === true) {
      args.push('--thinking');
    }

    // Pass prompt via stdin to avoid argument escaping issues
    // (matches Claude adapter pattern — critical for multi-line/special-char prompts)
    return { command: 'opencode', args, stdin: task.content };
  }
}

/**
 * Factory function for creating OpenCode adapter.
 */
export function createOpenCodeAdapter(options?: BaseAdapterOptions): OpenCodeCliAdapter {
  return new OpenCodeCliAdapter(options);
}
