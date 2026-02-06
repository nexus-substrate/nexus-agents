/** Tests for ICTM types Zod schemas. */
import { describe, it, expect } from 'vitest';
import {
  ContextPruneStrategySchema,
  ContextFilterSchema,
  ToolSetSchema,
  ReasoningDepthSchema,
  ModelSelectionSchema,
  ICTMConfigSchema,
  ICTMInferenceResultSchema,
} from './ictm-types.js';

// Helpers

function validContextFilter(): unknown {
  return {
    maxTokens: 8000,
    relevanceThreshold: 0.7,
    includeHistory: false,
    pruneStrategy: 'importance',
  };
}

function validToolSet(): unknown {
  return { capabilities: ['code_review', 'research'] };
}

function validModelSelection(): unknown {
  return { temperature: 0.5, reasoning: 'standard' };
}

function validICTMConfig(): unknown {
  return {
    instructions: 'Analyze authentication module.',
    context: validContextFilter(),
    tools: validToolSet(),
    model: validModelSelection(),
  };
}

describe('ContextPruneStrategySchema', () => {
  it.each(['recency', 'importance', 'hybrid'])('accepts "%s"', (value) => {
    expect(ContextPruneStrategySchema.parse(value)).toBe(value);
  });

  it('rejects unknown strategy', () => {
    expect(() => ContextPruneStrategySchema.parse('random')).toThrow();
  });

  it('rejects non-string input', () => {
    expect(() => ContextPruneStrategySchema.parse(42)).toThrow();
  });
});

describe('ContextFilterSchema', () => {
  it('parses valid context filter', () => {
    const result = ContextFilterSchema.parse(validContextFilter());
    expect(result.maxTokens).toBe(8000);
    expect(result.relevanceThreshold).toBe(0.7);
    expect(result.includeHistory).toBe(false);
    expect(result.pruneStrategy).toBe('importance');
  });

  // -- maxTokens boundaries --
  it('accepts maxTokens at lower bound (100)', () => {
    const input = { ...(validContextFilter() as object), maxTokens: 100 };
    expect(ContextFilterSchema.parse(input).maxTokens).toBe(100);
  });

  it('accepts maxTokens at upper bound (1_000_000)', () => {
    const input = { ...(validContextFilter() as object), maxTokens: 1_000_000 };
    expect(ContextFilterSchema.parse(input).maxTokens).toBe(1_000_000);
  });

  it('rejects maxTokens below 100', () => {
    const input = { ...(validContextFilter() as object), maxTokens: 99 };
    expect(() => ContextFilterSchema.parse(input)).toThrow();
  });

  it('rejects maxTokens above 1_000_000', () => {
    const input = { ...(validContextFilter() as object), maxTokens: 1_000_001 };
    expect(() => ContextFilterSchema.parse(input)).toThrow();
  });

  it('rejects non-integer maxTokens', () => {
    const input = { ...(validContextFilter() as object), maxTokens: 100.5 };
    expect(() => ContextFilterSchema.parse(input)).toThrow();
  });

  // -- relevanceThreshold boundaries --
  it('accepts relevanceThreshold at 0', () => {
    const input = { ...(validContextFilter() as object), relevanceThreshold: 0 };
    expect(ContextFilterSchema.parse(input).relevanceThreshold).toBe(0);
  });

  it('accepts relevanceThreshold at 1', () => {
    const input = { ...(validContextFilter() as object), relevanceThreshold: 1 };
    expect(ContextFilterSchema.parse(input).relevanceThreshold).toBe(1);
  });

  it('rejects relevanceThreshold below 0', () => {
    const input = { ...(validContextFilter() as object), relevanceThreshold: -0.01 };
    expect(() => ContextFilterSchema.parse(input)).toThrow();
  });

  it('rejects relevanceThreshold above 1', () => {
    const input = { ...(validContextFilter() as object), relevanceThreshold: 1.01 };
    expect(() => ContextFilterSchema.parse(input)).toThrow();
  });

  // -- missing required fields --
  it('rejects missing maxTokens', () => {
    const { maxTokens: _, ...rest } = validContextFilter() as Record<string, unknown>;
    void _;
    expect(() => ContextFilterSchema.parse(rest)).toThrow();
  });

  it('rejects missing pruneStrategy', () => {
    const { pruneStrategy: _, ...rest } = validContextFilter() as Record<string, unknown>;
    void _;
    expect(() => ContextFilterSchema.parse(rest)).toThrow();
  });

  it('rejects invalid pruneStrategy value', () => {
    const input = { ...(validContextFilter() as object), pruneStrategy: 'unknown' };
    expect(() => ContextFilterSchema.parse(input)).toThrow();
  });
});

describe('ToolSetSchema', () => {
  it('parses valid tool set with capabilities only', () => {
    const result = ToolSetSchema.parse(validToolSet());
    expect(result.capabilities).toEqual(['code_review', 'research']);
    expect(result.restrictions).toBeUndefined();
  });

  it('parses tool set with restrictions', () => {
    const input = { capabilities: ['code_review'], restrictions: ['code_generation'] };
    const result = ToolSetSchema.parse(input);
    expect(result.restrictions).toEqual(['code_generation']);
  });

  it('rejects empty capabilities array', () => {
    expect(() => ToolSetSchema.parse({ capabilities: [] })).toThrow();
  });

  it('rejects capabilities containing empty strings', () => {
    expect(() => ToolSetSchema.parse({ capabilities: [''] })).toThrow();
  });

  it('rejects missing capabilities field', () => {
    expect(() => ToolSetSchema.parse({})).toThrow();
  });

  it('accepts empty restrictions array', () => {
    const input = { capabilities: ['read'], restrictions: [] };
    const result = ToolSetSchema.parse(input);
    expect(result.restrictions).toEqual([]);
  });

  it('rejects restrictions containing empty strings', () => {
    const input = { capabilities: ['read'], restrictions: [''] };
    expect(() => ToolSetSchema.parse(input)).toThrow();
  });
});

describe('ReasoningDepthSchema', () => {
  it.each(['minimal', 'standard', 'extended'])('accepts "%s"', (value) => {
    expect(ReasoningDepthSchema.parse(value)).toBe(value);
  });

  it('rejects unknown reasoning depth', () => {
    expect(() => ReasoningDepthSchema.parse('deep')).toThrow();
  });
});

describe('ModelSelectionSchema', () => {
  it('parses with all optional fields present', () => {
    const input = {
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-20250514',
      temperature: 0.3,
      maxTokens: 4096,
      reasoning: 'extended',
    };
    const result = ModelSelectionSchema.parse(input);
    expect(result.provider).toBe('anthropic');
    expect(result.modelId).toBe('claude-sonnet-4-20250514');
    expect(result.temperature).toBe(0.3);
    expect(result.maxTokens).toBe(4096);
    expect(result.reasoning).toBe('extended');
  });

  it('parses empty object (all fields optional)', () => {
    const result = ModelSelectionSchema.parse({});
    expect(result.provider).toBeUndefined();
    expect(result.modelId).toBeUndefined();
    expect(result.temperature).toBeUndefined();
    expect(result.maxTokens).toBeUndefined();
    expect(result.reasoning).toBeUndefined();
  });

  // -- temperature boundaries --
  it('accepts temperature at 0', () => {
    expect(ModelSelectionSchema.parse({ temperature: 0 }).temperature).toBe(0);
  });

  it('accepts temperature at 2', () => {
    expect(ModelSelectionSchema.parse({ temperature: 2 }).temperature).toBe(2);
  });

  it('rejects temperature below 0', () => {
    expect(() => ModelSelectionSchema.parse({ temperature: -0.1 })).toThrow();
  });

  it('rejects temperature above 2', () => {
    expect(() => ModelSelectionSchema.parse({ temperature: 2.01 })).toThrow();
  });

  // -- maxTokens boundaries --
  it('accepts maxTokens at 1', () => {
    expect(ModelSelectionSchema.parse({ maxTokens: 1 }).maxTokens).toBe(1);
  });

  it('accepts maxTokens at 200_000', () => {
    expect(ModelSelectionSchema.parse({ maxTokens: 200_000 }).maxTokens).toBe(200_000);
  });

  it('rejects maxTokens at 0', () => {
    expect(() => ModelSelectionSchema.parse({ maxTokens: 0 })).toThrow();
  });

  it('rejects maxTokens above 200_000', () => {
    expect(() => ModelSelectionSchema.parse({ maxTokens: 200_001 })).toThrow();
  });

  it('rejects non-integer maxTokens', () => {
    expect(() => ModelSelectionSchema.parse({ maxTokens: 10.5 })).toThrow();
  });

  // -- string field constraints --
  it('rejects empty provider string', () => {
    expect(() => ModelSelectionSchema.parse({ provider: '' })).toThrow();
  });

  it('rejects empty modelId string', () => {
    expect(() => ModelSelectionSchema.parse({ modelId: '' })).toThrow();
  });
});

describe('ICTMConfigSchema', () => {
  it('parses valid ICTM config', () => {
    const result = ICTMConfigSchema.parse(validICTMConfig());
    expect(result.instructions).toBe('Analyze authentication module.');
    expect(result.context.maxTokens).toBe(8000);
    expect(result.tools.capabilities).toEqual(['code_review', 'research']);
  });

  it('parses with metadata', () => {
    const input = { ...(validICTMConfig() as object), metadata: { taskId: '123', priority: 1 } };
    const result = ICTMConfigSchema.parse(input);
    expect(result.metadata).toEqual({ taskId: '123', priority: 1 });
  });

  it('parses without metadata (optional)', () => {
    const result = ICTMConfigSchema.parse(validICTMConfig());
    expect(result.metadata).toBeUndefined();
  });

  it('rejects empty instructions', () => {
    const input = { ...(validICTMConfig() as object), instructions: '' };
    expect(() => ICTMConfigSchema.parse(input)).toThrow();
  });

  it('rejects missing instructions', () => {
    const { instructions: _, ...rest } = validICTMConfig() as Record<string, unknown>;
    void _;
    expect(() => ICTMConfigSchema.parse(rest)).toThrow();
  });

  it('rejects missing context', () => {
    const { context: _, ...rest } = validICTMConfig() as Record<string, unknown>;
    void _;
    expect(() => ICTMConfigSchema.parse(rest)).toThrow();
  });

  it('rejects missing tools', () => {
    const { tools: _, ...rest } = validICTMConfig() as Record<string, unknown>;
    void _;
    expect(() => ICTMConfigSchema.parse(rest)).toThrow();
  });

  it('rejects missing model', () => {
    const { model: _, ...rest } = validICTMConfig() as Record<string, unknown>;
    void _;
    expect(() => ICTMConfigSchema.parse(rest)).toThrow();
  });

  it('propagates nested context validation errors', () => {
    const input = {
      ...(validICTMConfig() as object),
      context: {
        maxTokens: -1,
        relevanceThreshold: 0.5,
        includeHistory: true,
        pruneStrategy: 'recency',
      },
    };
    expect(() => ICTMConfigSchema.parse(input)).toThrow();
  });

  it('propagates nested tools validation errors', () => {
    const input = { ...(validICTMConfig() as object), tools: { capabilities: [] } };
    expect(() => ICTMConfigSchema.parse(input)).toThrow();
  });
});

describe('ICTMInferenceResultSchema', () => {
  const validResult = (): unknown => ({
    config: validICTMConfig(),
    reasoning: {
      instructions: 'Selected focused security audit instructions.',
      context: 'Limited context to auth module only.',
      tools: 'Enabled code_review for static analysis.',
      model: 'Low temperature for deterministic output.',
    },
    confidence: 0.85,
  });

  it('parses valid inference result', () => {
    const result = ICTMInferenceResultSchema.parse(validResult());
    expect(result.confidence).toBe(0.85);
    expect(result.reasoning.instructions).toBe('Selected focused security audit instructions.');
    expect(result.config.instructions).toBe('Analyze authentication module.');
  });

  // -- confidence boundaries --
  it('accepts confidence at 0', () => {
    const input = { ...(validResult() as object), confidence: 0 };
    expect(ICTMInferenceResultSchema.parse(input).confidence).toBe(0);
  });

  it('accepts confidence at 1', () => {
    const input = { ...(validResult() as object), confidence: 1 };
    expect(ICTMInferenceResultSchema.parse(input).confidence).toBe(1);
  });

  it('rejects confidence below 0', () => {
    const input = { ...(validResult() as object), confidence: -0.01 };
    expect(() => ICTMInferenceResultSchema.parse(input)).toThrow();
  });

  it('rejects confidence above 1', () => {
    const input = { ...(validResult() as object), confidence: 1.01 };
    expect(() => ICTMInferenceResultSchema.parse(input)).toThrow();
  });

  // -- required fields --
  it('rejects missing config', () => {
    const { config: _, ...rest } = validResult() as Record<string, unknown>;
    void _;
    expect(() => ICTMInferenceResultSchema.parse(rest)).toThrow();
  });

  it('rejects missing reasoning', () => {
    const { reasoning: _, ...rest } = validResult() as Record<string, unknown>;
    void _;
    expect(() => ICTMInferenceResultSchema.parse(rest)).toThrow();
  });

  it('rejects missing confidence', () => {
    const { confidence: _, ...rest } = validResult() as Record<string, unknown>;
    void _;
    expect(() => ICTMInferenceResultSchema.parse(rest)).toThrow();
  });

  it('rejects incomplete reasoning object', () => {
    const input = {
      ...(validResult() as object),
      reasoning: { instructions: 'ok', context: 'ok' },
    };
    expect(() => ICTMInferenceResultSchema.parse(input)).toThrow();
  });

  it('propagates nested config validation errors', () => {
    const input = {
      ...(validResult() as object),
      config: { ...(validICTMConfig() as object), instructions: '' },
    };
    expect(() => ICTMInferenceResultSchema.parse(input)).toThrow();
  });
});
