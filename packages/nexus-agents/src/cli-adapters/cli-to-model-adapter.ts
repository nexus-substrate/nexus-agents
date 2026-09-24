/**
 * CLI-to-Model Adapter Bridge
 *
 * Wraps an ICliAdapter to implement IModelAdapter, enabling CLI tools
 * (claude, gemini, codex) to be used where model adapters are expected.
 *
 * @module cli-adapters/cli-to-model-adapter
 */

import type {
  Result,
  IModelAdapter,
  CompletionRequest,
  CompletionResponse,
  ModelCapability,
} from '../core/index.js';
import {
  ModelCapability as MC,
  ok,
  err,
  ModelError,
  ConfigError,
  ErrorCode,
  createLogger,
} from '../core/index.js';
import { estimateTokens } from '../core/token-estimator.js';
import type { ICliAdapter, CliTask, CliResponse, CliError, ExecutionOptions } from './types.js';
import type { StreamChunk } from '../core/types/model.js';
import { toModelTokenUsage } from './token-usage-bridge.js';
import { isCallerInputCliError } from './cli-error-helpers.js';
import { findCanonicalModel } from '../config/model-config-helpers.js';
import { CLI_NAMES } from '../config/model-capabilities-types.js';

const logger = createLogger({ component: 'cli-to-model-adapter' });

/** Configuration for CliToModelAdapter. */
export interface CliToModelAdapterConfig {
  /** Default timeout for CLI calls (ms). Overrides auto-detection. */
  readonly defaultTimeoutMs?: number;
}

/**
 * Bridge adapter that wraps ICliAdapter to implement IModelAdapter.
 *
 * This enables using CLI tools (claude, gemini, codex) in contexts
 * that expect IModelAdapter.
 *
 * @example
 * ```typescript
 * const cliAdapter = createCliAdapter({ cli: 'claude' });
 * const modelAdapter = new CliToModelAdapter(cliAdapter);
 *
 * // Now use modelAdapter where IModelAdapter is expected
 * const result = await modelAdapter.complete({
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 * ```
 */
export class CliToModelAdapter implements IModelAdapter {
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilities: readonly ModelCapability[];

  private readonly cliAdapter: ICliAdapter;
  private readonly defaultTimeoutMs: number | undefined;

  /**
   * Creates a bridge from CLI adapter to model adapter.
   *
   * @param cliAdapter - The CLI adapter to wrap
   * @param config - Optional configuration (e.g. timeout override)
   */
  constructor(cliAdapter: ICliAdapter, config?: CliToModelAdapterConfig) {
    this.cliAdapter = cliAdapter;
    this.defaultTimeoutMs = config?.defaultTimeoutMs;
    this.providerId = `cli-${cliAdapter.name}`;
    this.modelId = cliAdapter.getModelInfo().id;
    this.capabilities = this.deriveCapabilities();
  }

  /**
   * Derives ModelCapability from CLI capabilities.
   */
  private deriveCapabilities(): readonly ModelCapability[] {
    const caps: ModelCapability[] = [MC.COMPLETION, MC.TOOL_USE];

    // Claude CLI has extended thinking capability
    if (this.cliAdapter.name === 'claude') {
      caps.push(MC.EXTENDED_THINKING);
    }

    return caps;
  }

  /**
   * Converts CompletionRequest to CliTask.
   */
  private toCliTask(request: CompletionRequest): CliTask {
    // Build content from messages
    const content = request.messages
      .map((msg) => {
        const text =
          typeof msg.content === 'string'
            ? msg.content
            : msg.content
                .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
                .map((b) => b.text)
                .join('\n');
        return `[${msg.role}]: ${text}`;
      })
      .join('\n\n');

    // Build task with conditional optional properties
    const task: CliTask = {
      content,
      ...(request.workDir !== undefined ? { options: { workDir: request.workDir } } : {}),
    };

    if (request.systemPrompt !== undefined) {
      (task as { systemPrompt: string }).systemPrompt = request.systemPrompt;
    }
    if (request.maxTokens !== undefined) {
      (task as { maxTokens: number }).maxTokens = request.maxTokens;
    }
    const model = this.forwardableModel(request.model);
    if (model !== undefined) {
      (task as { model: string }).model = model;
    }

    return task;
  }

  /**
   * The requested model, when this CLI may be handed it (#6599). A registry
   * model that belongs ONLY to other CLIs is withheld: a failover can land a
   * model-bound request on a different CLI, which cannot run it and then runs
   * its own default — logged, and the response reports the model that ran.
   * A name the registry does not know is forwarded; the CLI adapter resolves
   * it or returns an error.
   */
  private forwardableModel(model: string | undefined): string | undefined {
    if (model === undefined) return undefined;
    const owners = CLI_NAMES.filter((cli) => findCanonicalModel(cli, model) !== undefined);
    if (owners.length === 0 || (owners as readonly string[]).includes(this.cliAdapter.name)) {
      return model;
    }
    logger.warn('Requested model belongs to another CLI; this CLI runs its default', {
      model,
      cli: this.cliAdapter.name,
      owners,
    });
    return undefined;
  }

  /**
   * Converts CliResponse to CompletionResponse.
   */
  private toCompletionResponse(response: CliResponse, forwarded?: string): CompletionResponse {
    const u = response.usage;
    return {
      content: [{ type: 'text', text: response.text }],
      // #4439: this used to be `response.usage?.x ?? 0`, which turned "the CLI
      // reported nothing" into a present 0/0/0 — indistinguishable downstream
      // from a real zero-token call. That single coercion defeated the
      // measured-voter gate (#4436) on every live vote and dropped the cache
      // fields (#4438) that #4435 needs. Absence stays absent; a present
      // usage crosses the type boundary through the one conversion (#4440).
      ...(u !== undefined ? { usage: toModelTokenUsage(u) } : {}),
      stopReason: 'end_turn',
      // #6599: no CLI parser reports the model, so a forwarded model is the
      // one that ran — report its canonical id, or cost and outcomes are
      // attributed to the CLI default.
      model: response.model ?? this.reportedForwardedModel(forwarded) ?? this.modelId,
      // #6094: carry the transport's captured stderr up to the model boundary
      // so the voter path can read the structured "could not read" signal.
      // Absent stays absent; an empty string is not a signal.
      ...(response.stderr !== undefined && response.stderr !== ''
        ? { cliStderr: response.stderr }
        : {}),
      // #6120/#6115: an in-family model substitution rides up the same way, so
      // the seat can say which alias it asked for and which one answered.
      ...(response.fallbackFrom !== undefined ? { fallbackFrom: response.fallbackFrom } : {}),
    };
  }

  /**
   * Converts CliError to ModelError.
   */
  private toModelError(cliError: CliError): ModelError {
    const options = cliError.cause !== undefined ? { cause: cliError.cause } : {};
    // #6599: caller input (e.g. an unresolvable requested model) keeps its
    // identity across the bridge, so the breaker can decline to count it.
    const code = isCallerInputCliError(cliError) ? { code: ErrorCode.INVALID_INPUT } : {};
    return new ModelError(cliError.message, { ...options, ...code });
  }

  /**
   * The canonical registry id of a model forwarded to this CLI, when the
   * registry lists it under this CLI. A name the registry does not know is not
   * claimed: the CLI may have substituted its default (agy does), so the
   * adapter default stays the honest report.
   */
  private reportedForwardedModel(forwarded: string | undefined): string | undefined {
    if (forwarded === undefined) return undefined;
    return findCanonicalModel(this.cliAdapter.name, forwarded)?.id;
  }

  /**
   * Send a completion request via CLI.
   */
  async complete(request: CompletionRequest): Promise<Result<CompletionResponse, ModelError>> {
    const task = this.toCliTask(request);
    // Per-request timeout (#3304) takes precedence over the construction-time
    // default, so a long-budget caller (e.g. a consensus vote) isn't cut off by
    // the adapter's shorter standard CLI timeout.
    const effectiveTimeoutMs = request.timeoutMs ?? this.defaultTimeoutMs;
    // #6680: the caller's signal reaches the CLI adapter, which kills its
    // subprocess on abort. It used to stop here, so neither a watchdog timeout
    // nor `cancel_job` could end a running CLI call.
    const opts: ExecutionOptions | undefined =
      effectiveTimeoutMs !== undefined || request.signal !== undefined
        ? {
            ...(effectiveTimeoutMs !== undefined ? { timeoutMs: effectiveTimeoutMs } : {}),
            ...(request.signal !== undefined ? { signal: request.signal } : {}),
          }
        : undefined;
    const result = await this.cliAdapter.execute(task, opts);

    if (!result.ok) {
      return err(this.toModelError(result.error));
    }

    return ok(this.toCompletionResponse(result.value, task.model));
  }

  /**
   * Streaming is not supported via CLI adapters.
   * Falls back to non-streaming and yields single chunk.
   */
  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const result = await this.complete(request);

    if (!result.ok) {
      throw result.error;
    }

    const response = result.value;

    yield { type: 'message_start', message: { model: response.model } };

    yield {
      type: 'content_block_start',
      index: 0,
      contentBlock: response.content[0] ?? { type: 'text', text: '' },
    };

    const firstBlock = response.content[0];
    const text = firstBlock?.type === 'text' ? firstBlock.text : '';
    yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } };

    yield { type: 'content_block_stop', index: 0 };

    yield {
      type: 'message_delta',
      delta: { stop_reason: response.stopReason },
      // exactOptionalPropertyTypes: omit the key entirely when unknown rather
      // than passing an explicit undefined (#4439).
      ...(response.usage !== undefined ? { usage: response.usage } : {}),
    };

    yield { type: 'message_stop' };
  }

  /**
   * Token count via canonical estimator (DRY consolidation Issue #1596).
   */
  countTokens(text: string): Promise<number> {
    return Promise.resolve(estimateTokens(text));
  }

  /**
   * Validate configuration by running health check.
   */
  validateConfig(): Result<void, ConfigError> {
    // CLI adapters validate via health check
    return ok(undefined);
  }

  /**
   * Initialize the underlying CLI adapter.
   */
  async initialize(): Promise<void> {
    await this.cliAdapter.initialize();
  }

  /**
   * Dispose the underlying CLI adapter.
   */
  async dispose(): Promise<void> {
    await this.cliAdapter.dispose();
  }
}

/**
 * Creates a model adapter from a CLI adapter.
 *
 * @param cliAdapter - The CLI adapter to wrap
 * @returns IModelAdapter implementation
 */
export function createCliToModelAdapter(
  cliAdapter: ICliAdapter,
  config?: CliToModelAdapterConfig
): CliToModelAdapter {
  return new CliToModelAdapter(cliAdapter, config);
}
