/**
 * nexus-agents/adapters - Adapter Factory Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type {
  IModelAdapter,
  CompletionRequest,
  CompletionResponse,
  StreamChunk,
  Result,
  ModelError,
  ConfigError as CoreConfigError,
} from '../core/index.js';
import { ok, ModelCapability, ConfigError } from '../core/index.js';
import { AdapterFactory, AdapterConfigSchema, defaultFactory } from './factory.js';
import type { AdapterConfig } from './factory.js';

/**
 * Mock adapter for testing the factory.
 */
class MockAdapter implements IModelAdapter {
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilities: readonly (typeof ModelCapability)[keyof typeof ModelCapability][];

  constructor(config: AdapterConfig) {
    this.providerId = config.providerId;
    this.modelId = config.modelId;
    this.capabilities = [ModelCapability.COMPLETION];
  }

  complete(_request: CompletionRequest): Promise<Result<CompletionResponse, ModelError>> {
    return Promise.resolve(
      ok({
        content: [{ type: 'text', text: 'Mock response' }],
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        stopReason: 'end_turn',
        model: this.modelId,
      })
    );
  }

  async *stream(_request: CompletionRequest): AsyncIterable<StreamChunk> {
    await Promise.resolve(); // Satisfy eslint require-await
    yield { type: 'message_start', message: { model: this.modelId } };
    yield { type: 'content_block_start', index: 0, contentBlock: { type: 'text', text: '' } };
    yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Mock' } };
    yield { type: 'content_block_stop', index: 0 };
    yield {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn' },
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    };
    yield { type: 'message_stop' };
  }

  countTokens(text: string): Promise<number> {
    return Promise.resolve(Math.ceil(text.length / 4));
  }

  validateConfig(): Result<void, CoreConfigError> {
    return ok(undefined);
  }
}

describe('AdapterConfigSchema', () => {
  it('should validate valid configuration', () => {
    const config = {
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4',
    };

    const result = AdapterConfigSchema.safeParse(config);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.providerId).toBe('anthropic');
      expect(result.data.modelId).toBe('claude-sonnet-4');
    }
  });

  it('should validate configuration with all optional fields', () => {
    const config = {
      providerId: 'openai',
      modelId: 'gpt-4o',
      apiKey: 'sk-test-key',
      baseUrl: 'https://api.example.com',
      timeout: 30000,
      maxRetries: 3,
    };

    const result = AdapterConfigSchema.safeParse(config);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.apiKey).toBe('sk-test-key');
      expect(result.data.baseUrl).toBe('https://api.example.com');
      expect(result.data.timeout).toBe(30000);
      expect(result.data.maxRetries).toBe(3);
    }
  });

  it('should reject empty providerId', () => {
    const config = {
      providerId: '',
      modelId: 'claude-sonnet-4',
    };

    const result = AdapterConfigSchema.safeParse(config);

    expect(result.success).toBe(false);
  });

  it('should reject empty modelId', () => {
    const config = {
      providerId: 'anthropic',
      modelId: '',
    };

    const result = AdapterConfigSchema.safeParse(config);

    expect(result.success).toBe(false);
  });

  it('should reject invalid baseUrl', () => {
    const config = {
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4',
      baseUrl: 'not-a-url',
    };

    const result = AdapterConfigSchema.safeParse(config);

    expect(result.success).toBe(false);
  });

  it('should reject negative timeout', () => {
    const config = {
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4',
      timeout: -1000,
    };

    const result = AdapterConfigSchema.safeParse(config);

    expect(result.success).toBe(false);
  });

  it('should reject negative maxRetries', () => {
    const config = {
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4',
      maxRetries: -1,
    };

    const result = AdapterConfigSchema.safeParse(config);

    expect(result.success).toBe(false);
  });

  it('should reject non-integer maxRetries', () => {
    const config = {
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4',
      maxRetries: 2.5,
    };

    const result = AdapterConfigSchema.safeParse(config);

    expect(result.success).toBe(false);
  });
});

describe('AdapterFactory', () => {
  let factory: AdapterFactory;

  beforeEach(() => {
    factory = new AdapterFactory();
  });

  describe('register', () => {
    it('should register a provider successfully', () => {
      const result = factory.register('test', (config) => new MockAdapter(config));

      expect(result.ok).toBe(true);
      expect(factory.hasProvider('test')).toBe(true);
    });

    it('should reject empty provider ID', () => {
      const result = factory.register('', (config) => new MockAdapter(config));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ConfigError);
        expect(result.error.message).toContain('empty');
      }
    });

    it('should reject whitespace-only provider ID', () => {
      const result = factory.register('   ', (config) => new MockAdapter(config));

      expect(result.ok).toBe(false);
    });

    it('should reject duplicate registration by default', () => {
      factory.register('test', (config) => new MockAdapter(config));
      const result = factory.register('test', (config) => new MockAdapter(config));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ConfigError);
        expect(result.error.message).toContain('already registered');
      }
    });

    it('should allow overwrite when option is set', () => {
      factory.register('test', (config) => new MockAdapter(config));
      const result = factory.register('test', (config) => new MockAdapter(config), {
        allowOverwrite: true,
      });

      expect(result.ok).toBe(true);
    });
  });

  describe('unregister', () => {
    it('should unregister an existing provider', () => {
      factory.register('test', (config) => new MockAdapter(config));

      const result = factory.unregister('test');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(true);
      }
      expect(factory.hasProvider('test')).toBe(false);
    });

    it('should return false for non-existent provider', () => {
      const result = factory.unregister('nonexistent');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(false);
      }
    });

    it('should reject empty provider ID', () => {
      const result = factory.unregister('');

      expect(result.ok).toBe(false);
    });
  });

  describe('create', () => {
    beforeEach(() => {
      factory.register('anthropic', (config) => new MockAdapter(config));
      factory.register('openai', (config) => new MockAdapter(config));
    });

    it('should create adapter for registered provider', () => {
      const result = factory.create({
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.providerId).toBe('anthropic');
        expect(result.value.modelId).toBe('claude-sonnet-4');
      }
    });

    it('should create adapter with all configuration options', () => {
      const result = factory.create({
        providerId: 'openai',
        modelId: 'gpt-4o',
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com',
        timeout: 30000,
        maxRetries: 3,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.providerId).toBe('openai');
        expect(result.value.modelId).toBe('gpt-4o');
      }
    });

    it('should fail for unregistered provider', () => {
      const result = factory.create({
        providerId: 'unknown',
        modelId: 'model',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ConfigError);
        expect(result.error.message).toContain('not registered');
        expect(result.error.context?.['availableProviders']).toContain('anthropic');
      }
    });

    it('should fail for invalid configuration', () => {
      const result = factory.create({
        providerId: '',
        modelId: 'model',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ConfigError);
        expect(result.error.message).toContain('Invalid adapter configuration');
      }
    });

    it('should handle creator function throwing error', () => {
      factory.register('throwing', () => {
        throw new Error('Creator error');
      });

      const result = factory.create({
        providerId: 'throwing',
        modelId: 'model',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ConfigError);
        expect(result.error.message).toContain('Creator error');
      }
    });

    it('should sanitize API key in error context', () => {
      // Force validation error by providing invalid config
      const result = factory.create({
        providerId: 'anthropic',
        modelId: '', // Invalid
        apiKey: 'super-secret-key',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        const config = result.error.context?.['config'] as Record<string, unknown> | undefined;
        expect(config?.['apiKey']).toBe('[REDACTED]');
      }
    });
  });

  describe('hasProvider', () => {
    it('should return true for registered provider', () => {
      factory.register('test', (config) => new MockAdapter(config));

      expect(factory.hasProvider('test')).toBe(true);
    });

    it('should return false for unregistered provider', () => {
      expect(factory.hasProvider('unknown')).toBe(false);
    });
  });

  describe('listProviders', () => {
    it('should return empty array when no providers registered', () => {
      expect(factory.listProviders()).toEqual([]);
    });

    it('should return all registered provider IDs', () => {
      factory.register('anthropic', (config) => new MockAdapter(config));
      factory.register('openai', (config) => new MockAdapter(config));
      factory.register('gemini', (config) => new MockAdapter(config));

      const providers = factory.listProviders();

      expect(providers).toHaveLength(3);
      expect(providers).toContain('anthropic');
      expect(providers).toContain('openai');
      expect(providers).toContain('gemini');
    });
  });

  describe('size', () => {
    it('should return 0 for empty factory', () => {
      expect(factory.size).toBe(0);
    });

    it('should return correct count after registrations', () => {
      factory.register('a', (config) => new MockAdapter(config));
      factory.register('b', (config) => new MockAdapter(config));

      expect(factory.size).toBe(2);
    });
  });

  describe('clear', () => {
    it('should remove all registered providers', () => {
      factory.register('a', (config) => new MockAdapter(config));
      factory.register('b', (config) => new MockAdapter(config));

      factory.clear();

      expect(factory.size).toBe(0);
      expect(factory.hasProvider('a')).toBe(false);
      expect(factory.hasProvider('b')).toBe(false);
    });
  });
});

/* eslint-disable @typescript-eslint/no-deprecated -- Testing deprecated functionality */
describe('defaultFactory', () => {
  beforeEach(() => {
    defaultFactory.clear();
  });

  it('should be an instance of AdapterFactory', () => {
    expect(defaultFactory).toBeInstanceOf(AdapterFactory);
  });

  it('should be usable as a global factory', () => {
    defaultFactory.register('test', (config) => new MockAdapter(config));

    expect(defaultFactory.hasProvider('test')).toBe(true);

    const result = defaultFactory.create({
      providerId: 'test',
      modelId: 'test-model',
    });

    expect(result.ok).toBe(true);
  });
});
/* eslint-enable @typescript-eslint/no-deprecated */

describe('MockAdapter integration', () => {
  let factory: AdapterFactory;

  beforeEach(() => {
    factory = new AdapterFactory();
    factory.register('mock', (config) => new MockAdapter(config));
  });

  it('should create a functional adapter', async () => {
    const result = factory.create({
      providerId: 'mock',
      modelId: 'mock-model',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const adapter = result.value;

      const completionResult = await adapter.complete({
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(completionResult.ok).toBe(true);
      if (completionResult.ok) {
        expect(completionResult.value.content[0]).toEqual({
          type: 'text',
          text: 'Mock response',
        });
      }
    }
  });

  it('should support streaming', async () => {
    const result = factory.create({
      providerId: 'mock',
      modelId: 'mock-model',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const adapter = result.value;
      const chunks: StreamChunk[] = [];

      for await (const chunk of adapter.stream({
        messages: [{ role: 'user', content: 'Hello' }],
      })) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0]?.type).toBe('message_start');
      expect(chunks[chunks.length - 1]?.type).toBe('message_stop');
    }
  });

  it('should count tokens', async () => {
    const result = factory.create({
      providerId: 'mock',
      modelId: 'mock-model',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const adapter = result.value;
      const count = await adapter.countTokens('Hello world');

      expect(count).toBeGreaterThan(0);
    }
  });
});
