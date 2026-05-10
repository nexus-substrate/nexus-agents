/**
 * nexus-agents/cli-adapters - OpenCode CLI Adapter
 *
 * Subprocess-based adapter for OpenCode CLI.
 * Uses `opencode run --format json` for stable parsing.
 *
 * (Source: Issue #1124, opencode.ai/docs/cli/)
 */

import { execFile } from 'node:child_process';

import type {
  ICliResponseParser,
  CliTask,
  CliModelInfo,
  ModelInfo,
  CliName,
  BaseAdapterOptions,
} from '../types.js';
import {
  SubprocessCliAdapter,
  type CommandConfig,
  type TransientRetryConfig,
} from '../subprocess-adapter.js';
import { OpenCodeResponseParser } from '../parsers/opencode-parser.js';
import {
  getDefaultModelForCli,
  getCliModelName,
  buildModelInfo,
} from '../../config/model-config-helpers.js';
import { findModelsByCli } from '../../config/model-capabilities.js';
import { createLogger } from '../../core/index.js';

const logger = createLogger({ component: 'opencode-adapter' });

/** Strict allowlist for OpenCode --variant flag values. */
const ALLOWED_VARIANTS = ['high', 'max', 'minimal'];

/**
 * Maps internal model names to OpenCode CLI --model values.
 * OpenCode uses `provider/model-name` format (e.g., `anthropic/claude-sonnet-4-6`).
 * Built from canonical registry + common alias fallbacks (#1402).
 */
const MODEL_TO_CLI_NAME: Record<string, string> = buildOpenCodeAliasMap();

function buildOpenCodeAliasMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const model of findModelsByCli('opencode')) {
    if (model.cliModelName === undefined) continue;
    // Map internal ID → CLI model name
    map[model.id] = model.cliModelName;
    // Map CLI alias → CLI model name
    if (model.cliAlias !== undefined) {
      map[model.cliAlias] = model.cliModelName;
    }
    // Pass through cliModelName itself
    map[model.cliModelName] = model.cliModelName;
  }
  return map;
}

/** Resolves an internal model name to OpenCode CLI format. */
function resolveOpenCodeModel(model: string): string {
  return MODEL_TO_CLI_NAME[model] ?? model;
}

/** Timeout for `opencode models` probe (ms). */
const PROBE_TIMEOUT_MS = 10_000;

/**
 * Probes available models by running `opencode models`.
 * Returns a Set of model IDs (e.g., "opencode/big-pickle").
 * Caches result in a module-level variable for the process lifetime.
 */
let cachedModels: Set<string> | undefined;
/** Inflight probe promise for coalescing concurrent calls (Issue #1438). */
let probePromise: Promise<Set<string>> | undefined;

function probeAvailableModels(): Promise<Set<string>> {
  if (cachedModels !== undefined) return Promise.resolve(cachedModels);
  if (probePromise !== undefined) return probePromise;

  probePromise = new Promise<Set<string>>((resolve) => {
    execFile('opencode', ['models'], { timeout: PROBE_TIMEOUT_MS }, (error, stdout) => {
      if (error !== null || stdout.trim() === '') {
        logger.debug('Failed to probe OpenCode models, will omit --model flag', {
          error: error?.message,
        });
        cachedModels = new Set();
        resolve(cachedModels);
        return;
      }
      const models = new Set(
        stdout
          .trim()
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length > 0)
      );
      logger.debug('Probed OpenCode models', { count: models.size });
      cachedModels = models;
      resolve(cachedModels);
    });
  }).finally(() => {
    probePromise = undefined;
  });

  return probePromise;
}

/** Patterns indicating an Anthropic provider in OpenCode models list. */
const ANTHROPIC_MODEL_PATTERNS = ['anthropic/', 'custom/claude'];

/**
 * Logs a warning if OpenCode has an Anthropic provider configured (#1429).
 * Claude Code subscription API keys must NOT be used with third-party tools.
 */
function warnIfAnthropicProvider(models: Set<string>): void {
  const anthropicModels = [...models].filter((m) =>
    ANTHROPIC_MODEL_PATTERNS.some((p) => m.toLowerCase().includes(p))
  );
  if (anthropicModels.length > 0) {
    logger.warn(
      'OpenCode has Anthropic/Claude models configured. ' +
        'Ensure these use a SEPARATE API key from console.anthropic.com, ' +
        'NOT a Claude Code subscription key (which is restricted to Claude Code only).',
      { detectedModels: anthropicModels }
    );
  }
}

/**
 * OpenCode CLI adapter using subprocess transport.
 * Executes: opencode run --format json "<task>"
 *
 * Probes available models on first use and omits --model flag
 * when the requested model isn't available (#1402).
 */
export class OpenCodeCliAdapter extends SubprocessCliAdapter {
  readonly name: CliName = 'opencode';
  protected readonly parser: ICliResponseParser = new OpenCodeResponseParser();

  /** Enable transient-error retry for OpenCode (#1456). */
  protected override readonly transientRetry: TransientRetryConfig = { enabled: true };

  private readonly model: string;
  private availableModels: Set<string> | undefined;

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
   * Initializes the adapter — probes available models.
   * Warns if Anthropic provider is configured (#1429 — API key boundaries).
   */
  override async initialize(): Promise<void> {
    this.availableModels = await probeAvailableModels();
    warnIfAnthropicProvider(this.availableModels);
    await super.initialize();
  }

  /** Returns true if the model is available in the OpenCode installation. */
  private isModelAvailable(cliModel: string): boolean {
    if (this.availableModels === undefined || this.availableModels.size === 0) return false;
    return this.availableModels.has(cliModel);
  }

  /** Appends --model if the resolved model is available (#1402). */
  private appendModelArg(args: string[], task: CliTask): void {
    const internalModel = task.model ?? this.model;
    const cliModel = resolveOpenCodeModel(internalModel);

    if (this.isModelAvailable(cliModel)) {
      args.push('--model', cliModel);
    } else {
      logger.debug('Model not available, using OpenCode default', {
        requested: cliModel,
        available: this.availableModels?.size ?? 0,
      });
    }
  }

  /** Appends optional task flags (workDir, variant, thinking). */
  private appendTaskFlags(args: string[], task: CliTask): void {
    const workDir = task.options?.['workDir'];
    if (typeof workDir === 'string' && workDir.length > 0) {
      args.push('--dir', workDir);
    }
    const variant = task.options?.['variant'];
    if (typeof variant === 'string' && ALLOWED_VARIANTS.includes(variant)) {
      args.push('--variant', variant);
    }
    if (task.options?.['thinking'] === true) {
      args.push('--thinking');
    }
  }

  /**
   * Gets CLI command and arguments for execution.
   * Uses `opencode run` with JSON format for stable parsing.
   * Omits --model when the requested model isn't available (#1402).
   */
  protected getCommand(task: CliTask): CommandConfig {
    const args: string[] = ['run', '--format', 'json'];
    this.appendModelArg(args, task);
    this.appendTaskFlags(args, task);

    // Honor systemPrompt by prepending to stdin content (#1886).
    // OpenCode CLI has no --system-prompt or --policy equivalent, so
    // prepend is the only option. This loses the formal system-role
    // distinction, but satisfies the contract that systemPrompt
    // influences the call (far better than silently dropping it).
    const content =
      task.systemPrompt !== undefined && task.systemPrompt !== ''
        ? `${task.systemPrompt}\n\n---\n\n${task.content}`
        : task.content;

    return { command: 'opencode', args, stdin: content };
  }

  /**
   * (#2540) Lists models the local OpenCode installation can route to.
   * Wraps the existing `probeAvailableModels()` (already 5-min cached)
   * and reshapes the result into the CliModelInfo schema. Splits
   * `provider/model` ids when present.
   */
  async listModels(): Promise<readonly CliModelInfo[]> {
    const ids = await probeAvailableModels();
    const out: CliModelInfo[] = [];
    for (const raw of ids) {
      const slash = raw.indexOf('/');
      if (slash > 0 && slash < raw.length - 1) {
        out.push({ id: raw, provider: raw.slice(0, slash) });
      } else {
        out.push({ id: raw });
      }
    }
    return out;
  }
}

/**
 * Factory function for creating OpenCode adapter.
 */
export function createOpenCodeAdapter(options?: BaseAdapterOptions): OpenCodeCliAdapter {
  return new OpenCodeCliAdapter(options);
}

/** Resets model probe cache (for testing). */
export function resetOpenCodeModelCache(): void {
  cachedModels = undefined;
}
