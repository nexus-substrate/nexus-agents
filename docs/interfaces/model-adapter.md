# IModelAdapter Interface

## Purpose

`IModelAdapter` provides a unified interface for interacting with different AI model providers (Anthropic, OpenAI, Google, Ollama). It abstracts provider-specific APIs into a consistent contract.

## Contract

```typescript
interface IModelAdapter {
  /** Provider identifier (e.g., 'anthropic', 'openai') */
  readonly providerId: string;

  /** Model identifier (e.g., 'claude-sonnet-4', 'gpt-4o') */
  readonly modelId: string;

  /** Capabilities this model supports */
  readonly capabilities: readonly ModelCapability[];

  /**
   * Send a completion request.
   * @param request - The completion request
   * @returns Result with response or ModelError
   */
  complete(request: CompletionRequest): Promise<Result<CompletionResponse, ModelError>>;

  /**
   * Stream a completion request.
   * @param request - The completion request
   * @yields StreamChunk objects as they arrive
   */
  stream(request: CompletionRequest): AsyncIterable<StreamChunk>;

  /**
   * Count tokens in text.
   * @param text - Text to count tokens for
   * @returns Approximate token count
   */
  countTokens(text: string): Promise<number>;

  /**
   * Validate adapter configuration.
   * @returns Ok if valid, ConfigError if invalid
   */
  validateConfig(): Result<void, ConfigError>;
}
```

## Supporting Types

### CompletionRequest

```typescript
interface CompletionRequest {
  messages: Message[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
  responseFormat?: ResponseFormat;
  stop?: string[];
}
```

### CompletionResponse

```typescript
interface CompletionResponse {
  content: ContentBlock[];
  usage: TokenUsage;
  stopReason: StopReason;
  model: string;
}
```

### ModelCapability

```typescript
const ModelCapability = {
  COMPLETION: 'completion',
  STREAMING: 'streaming',
  TOOL_USE: 'tool_use',
  VISION: 'vision',
  EXTENDED_THINKING: 'extended_thinking',
} as const;
```

## Implementations

| Adapter       | Provider  | Models                                               |
| ------------- | --------- | ---------------------------------------------------- |
| ClaudeAdapter | Anthropic | claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5 |
| OpenAIAdapter | OpenAI    | gpt-4o, gpt-4o-mini, o1-pro                          |
| GeminiAdapter | Google    | gemini-3-pro, gemini-3-flash, gemini-2.5-flash       |
| OllamaAdapter | Ollama    | llama3, mistral, codellama                           |

## Usage Example

```typescript
import { type IModelAdapter, type Result, isOk } from 'nexus-agents';

async function generateCode(adapter: IModelAdapter, prompt: string): Promise<string> {
  const result = await adapter.complete({
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    maxTokens: 2000,
  });

  if (!isOk(result)) {
    throw result.error;
  }

  const textContent = result.value.content.find((block) => block.type === 'text');
  return textContent?.text ?? '';
}
```

## Error Handling

| Error                             | Cause           | Recovery               |
| --------------------------------- | --------------- | ---------------------- |
| `ModelError` (MODEL_UNAVAILABLE)  | API unavailable | Retry with backoff     |
| `ModelError` (MODEL_RATE_LIMITED) | Rate limit hit  | Wait and retry         |
| `ModelError` (MODEL_TIMEOUT)      | Request timeout | Retry or escalate      |
| `ConfigError`                     | Invalid config  | Check API key/settings |

## Testing

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { IModelAdapter } from 'nexus-agents';

describe('IModelAdapter', () => {
  it('should complete a request', async () => {
    const mockAdapter: IModelAdapter = {
      providerId: 'test',
      modelId: 'test-model',
      capabilities: ['completion'],
      complete: vi.fn().mockResolvedValue({
        ok: true,
        value: { content: [{ type: 'text', text: 'Hello' }], ... }
      }),
      stream: vi.fn(),
      countTokens: vi.fn().mockResolvedValue(10),
      validateConfig: vi.fn().mockReturnValue({ ok: true, value: undefined }),
    };

    const result = await mockAdapter.complete({ messages: [] });
    expect(result.ok).toBe(true);
  });
});
```
