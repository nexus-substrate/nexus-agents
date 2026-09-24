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
import { createCallerInputCliError } from '../cli-error-helpers.js';
import { isDynamicModelsEnabled } from '../../config/register-model-sources.js';
import { getAvailabilityCache } from '../../config/model-availability.js';
import type { ModelId } from '../../config/model-capabilities-types.js';
import type { Result } from '../../core/index.js';
import { ok, err } from '../../core/index.js';
import type { CliResponse, CliError } from '../types-core.js';
import type { ExecutionOptions, ResolvedExecutionOptions } from '../types-capability.js';
import {
  getDefaultModelForCli,
  getCliModelName,
  buildModelInfo,
  findInTreeByCli,
  findCanonicalModel,
  FALLBACK_CONTEXT_WINDOW,
  FALLBACK_MAX_OUTPUT,
} from '../../config/model-config-helpers.js';
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
  for (const model of findInTreeByCli('opencode')) {
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

/**
 * Provider prefix opencode puts on gateway models: the registry and callers
 * say `qwen/qwen3-coder`, `opencode models` lists `openrouter/qwen/qwen3-coder`.
 */
const OPENROUTER_PREFIX = 'openrouter/';

/**
 * Candidate opencode ids for a requested model, in preference order (#6599):
 * the name as given, then its registry mapping, each also tried under the
 * `openrouter/` prefix.
 */
function openCodeCandidates(requested: string): string[] {
  const mapped = resolveOpenCodeModel(requested);
  const bases = mapped === requested ? [requested] : [requested, mapped];
  return bases.flatMap((b) => (b.startsWith(OPENROUTER_PREFIX) ? [b] : [b, OPENROUTER_PREFIX + b]));
}

/**
 * The id a response reports for `cliId`, and so the id cost is priced by: the
 * canonical registry id when one names this model (with or without the
 * `openrouter/` prefix), else the opencode id itself — which an unpriced
 * lookup then reports as unknown rather than at the default's price.
 */
function reportedModelId(requested: string, cliId: string): string {
  const bare = cliId.startsWith(OPENROUTER_PREFIX) ? cliId.slice(OPENROUTER_PREFIX.length) : cliId;
  const entry =
    findCanonicalModel('opencode', requested) ??
    findCanonicalModel('opencode', cliId) ??
    findCanonicalModel('opencode', bare);
  return entry?.id ?? cliId;
}

/** A requested model resolved against the local opencode install (#6599). */
interface ResolvedOpenCodeModel {
  /** The id passed as `--model`. */
  readonly cliId: string;
  /** The id the response reports, which cost is priced by. */
  readonly reportedAs: string;
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
 * Probes available models on first use. The adapter's own default is passed
 * as --model only when available (#1402); an explicitly requested model is
 * resolved against the probe or returned as an error (#6599).
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
      contextWindow: FALLBACK_CONTEXT_WINDOW,
      maxOutput: FALLBACK_MAX_OUTPUT,
      // OpenCode pricing fallback is adapter-specific (not the Claude 5/25).
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

  /** #3408: true if the model is in rate-limit cooldown (recent 429). Opt-in. */
  private isCooled(cliModel: string): boolean {
    return (
      isDynamicModelsEnabled() && getAvailabilityCache().isKnownUnavailable(cliModel as ModelId)
    );
  }

  /** Usable = offered by the OpenCode install AND not in rate-limit cooldown. */
  private isModelUsable(cliModel: string): boolean {
    return this.isModelAvailable(cliModel) && !this.isCooled(cliModel);
  }

  /** The first candidate id for `requested` that this install lists. */
  private matchInventory(requested: string): string | undefined {
    const available = this.availableModels;
    if (available === undefined || available.size === 0) return undefined;
    return openCodeCandidates(requested).find((c) => available.has(c));
  }

  /**
   * Resolves an explicitly requested model (#6599). Unlike the adapter's own
   * default, an explicit request is never silently dropped: a model that is
   * not listed, or is in rate-limit cooldown, is an error rather than a run of
   * opencode's default under the requested model's name.
   */
  private resolveRequestedModel(requested: string): Result<ResolvedOpenCodeModel, CliError> {
    if (this.availableModels === undefined || this.availableModels.size === 0) {
      // No inventory to check against (`opencode models` failed): pass the
      // registry mapping through and let opencode reject it if it must.
      const cliId = resolveOpenCodeModel(requested);
      logger.warn('OpenCode model inventory unavailable; passing requested model unverified', {
        requested,
        cliId,
      });
      return ok({ cliId, reportedAs: reportedModelId(requested, cliId) });
    }
    const cliId = this.matchInventory(requested);
    if (cliId === undefined) {
      return err(
        createCallerInputCliError(
          `OpenCode cannot run requested model "${requested}": \`opencode models\` lists none of ` +
            `${openCodeCandidates(requested).join(', ')}. Refusing to run opencode's default in its place.`,
          this.name
        )
      );
    }
    if (this.isCooled(cliId)) {
      return err(
        createCallerInputCliError(
          `OpenCode requested model "${requested}" (${cliId}) is in rate-limit cooldown.`,
          this.name
        )
      );
    }
    return ok({ cliId, reportedAs: reportedModelId(requested, cliId) });
  }

  /**
   * #6599: an explicitly requested model is resolved to an opencode id before
   * the run, and the response reports the model that ran so cost and outcome
   * attribution price it rather than the adapter default. With no requested
   * model the path is unchanged.
   */
  override async execute(
    task: CliTask,
    options?: ExecutionOptions
  ): Promise<Result<CliResponse, CliError>> {
    if (task.model === undefined) return super.execute(task, options);
    if (!this.initialized) await this.initialize();
    const resolved = this.resolveRequestedModel(task.model);
    if (!resolved.ok) return resolved;
    const { cliId, reportedAs } = resolved.value;
    const result = await super.execute({ ...task, model: cliId }, options);
    if (!result.ok) return result;
    return ok({ ...result.value, model: reportedAs });
  }

  /** Appends --model if the resolved model is usable (#1402, #3407, #3408). */
  private appendModelArg(args: string[], task: CliTask): void {
    if (task.model !== undefined) {
      // Explicit request: already resolved by execute(). Never dropped — an
      // id opencode does not know fails loudly in opencode itself.
      args.push('--model', this.matchInventory(task.model) ?? resolveOpenCodeModel(task.model));
      return;
    }
    const cliModel = resolveOpenCodeModel(this.model);

    if (this.isModelUsable(cliModel)) {
      args.push('--model', cliModel);
    } else {
      logger.debug('Model not usable (unavailable or cooled), using OpenCode default', {
        requested: cliModel,
        available: this.availableModels?.size ?? 0,
      });
    }
  }

  /**
   * #3408: mark a model in rate-limit cooldown when a call returns RATE_LIMITED,
   * so subsequent selections skip it until the AvailabilityCache TTL recovers.
   * Wraps the base executeTask; opt-in + fail-open (no-op when discovery is off).
   * An explicitly requested model in cooldown is refused by execute() (#6599).
   */
  override async executeTask(
    task: CliTask,
    options: ResolvedExecutionOptions
  ): Promise<Result<CliResponse, CliError>> {
    const result = await super.executeTask(task, options);
    if (isDynamicModelsEnabled() && !result.ok && result.error.code === 'RATE_LIMITED') {
      const cliModel = resolveOpenCodeModel(task.model ?? this.model);
      getAvailabilityCache().markUnavailable(cliModel as ModelId, 'rate-limited (429)');
      logger.debug('Cooldown: marked model rate-limited (#3408)', { model: cliModel });
    }
    return result;
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
   * Omits --model when the adapter default isn't available (#1402).
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
   * Wraps the existing `probeAvailableModels()` (cached for the process
   * lifetime — see `cachedModels` at the top of this file) and reshapes
   * the result into the CliModelInfo schema. Splits `provider/model` ids
   * when present.
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

/** Resets model probe cache (for testing). */
export function resetOpenCodeModelCache(): void {
  cachedModels = undefined;
}
