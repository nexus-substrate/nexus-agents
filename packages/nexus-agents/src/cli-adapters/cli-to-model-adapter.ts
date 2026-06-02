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
import { ModelCapability as MC, ok, err, ModelError, ConfigError } from '../core/index.js';
import { estimateTokens } from '../core/token-estimator.js';
import type { ICliAdapter, CliTask, CliResponse, CliError, ExecutionOptions } from './types.js';
import type { StreamChunk } from '../core/types/model.js';

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
    const task: CliTask = { content };

    if (request.systemPrompt !== undefined) {
      (task as { systemPrompt: string }).systemPrompt = request.systemPrompt;
    }
    if (request.maxTokens !== undefined) {
      (task as { maxTokens: number }).maxTokens = request.maxTokens;
    }

    return task;
  }

  /**
   * Converts CliResponse to CompletionResponse.
   */
  private toCompletionResponse(response: CliResponse): CompletionResponse {
    return {
      content: [{ type: 'text', text: response.text }],
      usage: {
        inputTokens: response.usage?.inputTokens ?? 0,
        outputTokens: response.usage?.outputTokens ?? 0,
        totalTokens: response.usage?.totalTokens ?? 0,
      },
      stopReason: 'end_turn',
      model: response.model ?? this.modelId,
    };
  }

  /**
   * Converts CliError to ModelError.
   */
  private toModelError(cliError: CliError): ModelError {
    const options = cliError.cause !== undefined ? { cause: cliError.cause } : {};
    return new ModelError(cliError.message, options);
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
    const opts: ExecutionOptions | undefined =
      effectiveTimeoutMs !== undefined ? { timeoutMs: effectiveTimeoutMs } : undefined;
    const result = await this.cliAdapter.execute(task, opts);

    if (!result.ok) {
      return err(this.toModelError(result.error));
    }

    return ok(this.toCompletionResponse(result.value));
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
      usage: response.usage,
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
