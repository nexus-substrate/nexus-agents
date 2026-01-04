/**
 * nexus-agents/adapters - Ollama Model Adapter
 *
 * Adapter for local Ollama models (llama3, mistral, codellama, etc.).
 * Verified 2026-01-03: ollama@0.6.3 is current stable (Source: npm registry)
 */

import { Ollama } from 'ollama';
import type {
  ChatRequest as OllamaChatRequest,
  ChatResponse as OllamaChatResponse,
  Message as OllamaMessage,
  Tool as OllamaTool,
} from 'ollama';
import type {
  Result,
  CompletionRequest,
  CompletionResponse,
  StreamChunk,
  ContentBlock,
  Message,
  ToolDefinition,
  TokenUsage,
  StopReason,
} from '../core/index.js';
import { ok, err, ModelError, ConfigError, ModelCapability } from '../core/index.js';
import { BaseAdapter, type BaseAdapterConfig } from './base-adapter.js';
import { createStream } from './streaming.js';

/** Popular Ollama model identifiers. */
export const OLLAMA_MODELS = {
  LLAMA3_8B: 'llama3:8b',
  LLAMA3_70B: 'llama3:70b',
  LLAMA3_1_8B: 'llama3.1:8b',
  LLAMA3_2_3B: 'llama3.2:3b',
  MISTRAL: 'mistral',
  MISTRAL_NEMO: 'mistral-nemo',
  CODELLAMA: 'codellama',
  CODELLAMA_34B: 'codellama:34b',
  DEEPSEEK_CODER: 'deepseek-coder',
  QWEN2_5_CODER: 'qwen2.5-coder',
  PHI3: 'phi3',
  GEMMA2: 'gemma2',
} as const;

const DEFAULT_OLLAMA_HOST = 'http://localhost:11434';
const DEFAULT_MAX_TOKENS = 2048;
const OLLAMA_CHARS_PER_TOKEN = 4;

/** Configuration specific to OllamaAdapter. */
export interface OllamaAdapterConfig {
  modelId: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  headers?: Record<string, string>;
}

function mapStopReason(reason: string | undefined): StopReason {
  if (reason === undefined || reason === '') return 'end_turn';
  switch (reason) {
    case 'stop':
      return 'end_turn';
    case 'length':
      return 'max_tokens';
    case 'tool_calls':
      return 'tool_use';
    default:
      return 'end_turn';
  }
}

function mapOllamaMessageToContent(message: OllamaMessage): ContentBlock[] {
  const content: ContentBlock[] = [];
  const messageContent = message.content;
  if (messageContent !== '' && messageContent.length > 0) {
    content.push({ type: 'text', text: messageContent });
  }
  const toolCalls = message.tool_calls;
  if (toolCalls !== undefined && toolCalls.length > 0) {
    for (const tc of toolCalls) {
      content.push({
        type: 'tool_use',
        id: `tool_${String(Date.now())}_${Math.random().toString(36).slice(2, 9)}`,
        name: tc.function.name,
        input: tc.function.arguments,
      });
    }
  }
  if (content.length === 0) content.push({ type: 'text', text: '' });
  return content;
}

function mapMessage(message: Message): OllamaMessage {
  if (typeof message.content === 'string') {
    return { role: message.role, content: message.content };
  }
  const textParts = message.content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text);
  const ollamaMessage: OllamaMessage = { role: message.role, content: textParts.join('\n') };
  const toolResult = message.content.find(
    (b): b is { type: 'tool_result'; tool_use_id: string; content: string } =>
      b.type === 'tool_result'
  );
  if (toolResult !== undefined) {
    ollamaMessage.content = toolResult.content;
    ollamaMessage.tool_name = toolResult.tool_use_id;
  }
  return ollamaMessage;
}

function mapTool(tool: ToolDefinition): OllamaTool {
  const fn: OllamaTool['function'] = { name: tool.name, description: tool.description };
  const schema = tool.inputSchema;
  const hasProperties = Object.keys(schema).length > 0;
  if (hasProperties) {
    fn.parameters = schema as NonNullable<OllamaTool['function']['parameters']>;
  }
  return { type: 'function', function: fn };
}

function getModelCapabilities(modelId: string): readonly ModelCapability[] {
  const caps: ModelCapability[] = [ModelCapability.COMPLETION, ModelCapability.STREAMING];
  const lower = modelId.toLowerCase();
  const toolModels = [
    'llama3',
    'mistral',
    'qwen',
    'deepseek',
    'command-r',
    'hermes',
    'functionary',
  ];
  if (toolModels.some((m) => lower.includes(m))) caps.push(ModelCapability.TOOL_USE);
  const visionModels = ['llava', 'bakllava', 'moondream', 'llama3.2-vision'];
  if (visionModels.some((m) => lower.includes(m))) caps.push(ModelCapability.VISION);
  return caps;
}

/** Ollama model adapter for local model inference. */
export class OllamaAdapter extends BaseAdapter {
  private readonly client: Ollama;

  constructor(config: OllamaAdapterConfig) {
    const baseUrl = config.baseUrl ?? DEFAULT_OLLAMA_HOST;
    const baseConfig: BaseAdapterConfig = {
      providerId: 'ollama',
      modelId: config.modelId,
      capabilities: getModelCapabilities(config.modelId),
      baseUrl,
    };
    if (config.timeout !== undefined) baseConfig.timeout = config.timeout;
    if (config.maxRetries !== undefined) baseConfig.maxRetries = config.maxRetries;
    super(baseConfig);
    this.client = new Ollama({ host: baseUrl, headers: config.headers });
  }

  override validateConfig(): Result<void, ConfigError> {
    const baseResult = super.validateConfig();
    if (!baseResult.ok) return baseResult;
    if (this.modelId === '' || this.modelId.trim() === '') {
      return err(
        new ConfigError('Ollama model ID is required', { context: { providerId: this.providerId } })
      );
    }
    return ok(undefined);
  }

  async complete(request: CompletionRequest): Promise<Result<CompletionResponse, ModelError>> {
    this.logRequest(request);
    try {
      const params = this.buildRequestParams(request);
      const response = await this.client.chat({ ...params, stream: false });
      const result = this.mapResponse(response);
      this.logResponse(result);
      return ok(result);
    } catch (error) {
      return err(this.transformError(error));
    }
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    this.logRequest(request);
    const [controller, iterable] = createStream<StreamChunk>();
    this.executeStream(request, controller).catch((error: unknown) => {
      controller.error(this.transformError(error));
    });
    yield* iterable;
  }

  override countTokens(text: string): Promise<number> {
    return Promise.resolve(Math.ceil(text.length / OLLAMA_CHARS_PER_TOKEN));
  }

  private async executeStream(
    request: CompletionRequest,
    controller: {
      push: (c: StreamChunk) => Result<void, Error>;
      complete: () => void;
      error: (e: Error) => void;
    }
  ): Promise<void> {
    try {
      const params = this.buildRequestParams(request);
      const stream = await this.client.chat({ ...params, stream: true });
      controller.push({ type: 'message_start', message: { model: this.modelId } });
      let hasStartedBlock = false;
      for await (const chunk of stream) {
        if (!hasStartedBlock) {
          controller.push({
            type: 'content_block_start',
            index: 0,
            contentBlock: { type: 'text', text: '' },
          });
          hasStartedBlock = true;
        }
        const chunkContent = chunk.message.content;
        if (chunkContent.length > 0) {
          controller.push({
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: chunkContent },
          });
        }
        if (chunk.done) {
          controller.push({ type: 'content_block_stop', index: 0 });
          controller.push({
            type: 'message_delta',
            delta: { stop_reason: mapStopReason(chunk.done_reason) },
            usage: this.calcUsage(chunk),
          });
          controller.push({ type: 'message_stop' });
        }
      }
      controller.complete();
    } catch (error) {
      controller.error(this.transformError(error as Error));
    }
  }

  private extractSystemPrompt(request: CompletionRequest): string | undefined {
    if (request.systemPrompt !== undefined && request.systemPrompt !== '')
      return request.systemPrompt;
    const sys = request.messages.find((m) => m.role === 'system');
    if (sys === undefined) return undefined;
    if (typeof sys.content === 'string') return sys.content;
    return sys.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
  }

  private buildOptions(request: CompletionRequest): Record<string, unknown> {
    const options: Record<string, unknown> = {
      num_predict: request.maxTokens ?? DEFAULT_MAX_TOKENS,
    };
    if (request.temperature !== undefined) options['temperature'] = request.temperature;
    if (request.stop !== undefined && request.stop.length > 0) options['stop'] = request.stop;
    return options;
  }

  private applyFormatAndTools(params: OllamaChatRequest, request: CompletionRequest): void {
    if (request.tools !== undefined && request.tools.length > 0)
      params.tools = request.tools.map(mapTool);
    if (request.responseFormat?.type === 'json_object') params.format = 'json';
    else if (request.responseFormat?.type === 'json_schema')
      params.format = request.responseFormat.schema;
  }

  private buildRequestParams(request: CompletionRequest): OllamaChatRequest {
    const messages = request.messages.filter((m) => m.role !== 'system').map(mapMessage);
    const systemPrompt = this.extractSystemPrompt(request);
    if (systemPrompt !== undefined) messages.unshift({ role: 'system', content: systemPrompt });
    const params: OllamaChatRequest = {
      model: this.modelId,
      messages,
      options: this.buildOptions(request),
    };
    this.applyFormatAndTools(params, request);
    return params;
  }

  private mapResponse(response: OllamaChatResponse): CompletionResponse {
    return {
      content: mapOllamaMessageToContent(response.message),
      usage: this.calcUsage(response),
      stopReason: mapStopReason(response.done_reason),
      model: response.model,
    };
  }

  private calcUsage(response: OllamaChatResponse): TokenUsage {
    const input = response.prompt_eval_count;
    const output = response.eval_count;
    const inputCount = typeof input === 'number' ? input : 0;
    const outputCount = typeof output === 'number' ? output : 0;
    return {
      inputTokens: inputCount,
      outputTokens: outputCount,
      totalTokens: inputCount + outputCount,
    };
  }
}

/** Creates an OllamaAdapter with the specified configuration. */
export function createOllamaAdapter(config: OllamaAdapterConfig): OllamaAdapter {
  return new OllamaAdapter(config);
}
