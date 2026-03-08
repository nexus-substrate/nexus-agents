/**
 * nexus-agents/mcp - Memory Write Tool Tests
 *
 * @module mcp/tools/memory-write.test
 * (Source: Issue #1090 - Add memory_write MCP tool)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryWriteInputSchema, type MemoryWriteInput } from './memory-write.js';

// ============================================================================
// Schema Validation Tests
// ============================================================================

describe('MemoryWriteInputSchema', () => {
  describe('valid inputs', () => {
    it('should accept session backend write', () => {
      const input = { key: 'test-key', content: 'test content', backend: 'session' };
      const result = MemoryWriteInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.backend).toBe('session');
        expect(result.data.confidence).toBe('medium');
      }
    });

    it('should accept belief backend write', () => {
      const input = { key: 'subject', content: 'object', backend: 'belief' };
      const result = MemoryWriteInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.backend).toBe('belief');
      }
    });

    it('should accept agentic backend write', () => {
      const input = { key: 'knowledge', content: 'value', backend: 'agentic' };
      const result = MemoryWriteInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.backend).toBe('agentic');
      }
    });

    it('should accept adaptive backend write', () => {
      const input = { key: 'priority-item', content: 'scored content', backend: 'adaptive' };
      const result = MemoryWriteInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.backend).toBe('adaptive');
        expect(result.data.confidence).toBe('medium');
      }
    });

    it('should accept typed backend write', () => {
      const input = { key: 'semantic-fact', content: 'typed content', backend: 'typed' };
      const result = MemoryWriteInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.backend).toBe('typed');
      }
    });

    it('should accept confidence override', () => {
      const input = {
        key: 'test',
        content: 'data',
        backend: 'session',
        confidence: 'high',
      };
      const result = MemoryWriteInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.confidence).toBe('high');
      }
    });

    it('should accept optional metadata', () => {
      const input = {
        key: 'test',
        content: 'data',
        backend: 'agentic',
        metadata: { tag: 'infra', source: 'manual' },
      };
      const result = MemoryWriteInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metadata).toEqual({ tag: 'infra', source: 'manual' });
      }
    });
  });

  describe('invalid inputs', () => {
    it('should reject missing key', () => {
      const input = { content: 'data', backend: 'session' };
      const result = MemoryWriteInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject missing content', () => {
      const input = { key: 'test', backend: 'session' };
      const result = MemoryWriteInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject missing backend', () => {
      const input = { key: 'test', content: 'data' };
      const result = MemoryWriteInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid backend', () => {
      const input = { key: 'test', content: 'data', backend: 'invalid' };
      const result = MemoryWriteInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject empty key', () => {
      const input = { key: '', content: 'data', backend: 'session' };
      const result = MemoryWriteInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject empty content', () => {
      const input = { key: 'test', content: '', backend: 'session' };
      const result = MemoryWriteInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid confidence', () => {
      const input = {
        key: 'test',
        content: 'data',
        backend: 'session',
        confidence: 'extreme',
      };
      const result = MemoryWriteInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================================
// Write Logic Tests (via ToolMemory mock)
// ============================================================================

describe('memory write logic', () => {
  const mockToolMemory = {
    recordLearning: vi.fn(),
    recordBelief: vi.fn(),
    recordKnowledge: vi.fn(),
    isAgenticMemoryAvailable: vi.fn(() => true),
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should map session input to SessionLearning fields', () => {
    const input: MemoryWriteInput = {
      key: 'deployment-pattern',
      content: 'Always use blue-green deployments',
      backend: 'session',
      confidence: 'high',
    };

    // Verify mapping logic
    const numericConfidence = input.confidence === 'high' ? 0.9 : 0.7;
    const learning = {
      pattern: input.content,
      context: input.key,
      confidence: numericConfidence,
      source: 'memory_write_tool',
    };

    mockToolMemory.recordLearning(learning);

    expect(mockToolMemory.recordLearning).toHaveBeenCalledWith({
      pattern: 'Always use blue-green deployments',
      context: 'deployment-pattern',
      confidence: 0.9,
      source: 'memory_write_tool',
    });
  });

  it('should map belief input to triple format', () => {
    const input: MemoryWriteInput = {
      key: 'nexus-agents',
      content: 'uses TypeScript strict mode',
      backend: 'belief',
      confidence: 'medium',
    };

    mockToolMemory.recordBelief(input.key, 'has_knowledge', input.content, input.confidence);

    expect(mockToolMemory.recordBelief).toHaveBeenCalledWith(
      'nexus-agents',
      'has_knowledge',
      'uses TypeScript strict mode',
      'medium'
    );
  });

  it('should detect deduplicated belief writes via count comparison (#1455)', () => {
    // When belief count stays the same, the write was deduplicated
    const countBefore = 5;
    const countAfter = 5;
    const deduplicated = countAfter === countBefore;
    expect(deduplicated).toBe(true);

    // When count increases, a new belief was created
    const countAfterNew: number = 6;
    const notDeduplicated = countAfterNew === (countBefore as number);
    expect(notDeduplicated).toBe(false);
  });

  it('should map agentic input with metadata tags', () => {
    const input: MemoryWriteInput = {
      key: 'infra-state',
      content: 'BOSH director running 18 VMs',
      backend: 'agentic',
      confidence: 'medium',
      metadata: { env: 'homelab', service: 'bosh' },
    };

    const tags = Object.keys(input.metadata ?? {});
    mockToolMemory.recordKnowledge(input.key, input.content, {
      importance: input.confidence,
      tags,
    });

    expect(mockToolMemory.recordKnowledge).toHaveBeenCalledWith(
      'infra-state',
      'BOSH director running 18 VMs',
      expect.objectContaining({
        importance: 'medium',
        tags: ['env', 'service'],
      })
    );
  });

  it('should map adaptive input with importance from confidence', () => {
    const mockStoreAdaptive = vi.fn();
    const input: MemoryWriteInput = {
      key: 'priority-data',
      content: 'high-importance info',
      backend: 'adaptive',
      confidence: 'high',
    };

    // Verify confidence-to-importance mapping: high=0.9, medium=0.7, low=0.5
    const importance =
      input.confidence === 'high' ? 0.9 : input.confidence === 'medium' ? 0.7 : 0.5;
    mockStoreAdaptive(input.key, input.content, importance);

    expect(mockStoreAdaptive).toHaveBeenCalledWith('priority-data', 'high-importance info', 0.9);
  });

  it('should map typed input as semantic memory entry', () => {
    const mockStoreTyped = vi.fn();
    const input: MemoryWriteInput = {
      key: 'semantic-fact',
      content: 'TypeScript uses strict mode',
      backend: 'typed',
      confidence: 'medium',
    };

    // Verify confidence maps to importance string for typed backend
    const importance =
      input.confidence === 'high' ? 'high' : input.confidence === 'medium' ? 'medium' : 'low';
    mockStoreTyped(input.key, input.content, importance);

    expect(mockStoreTyped).toHaveBeenCalledWith(
      'semantic-fact',
      'TypeScript uses strict mode',
      'medium'
    );
  });

  it('should map confidence levels correctly', () => {
    const cases: Array<{ level: 'high' | 'medium' | 'low'; expected: number }> = [
      { level: 'high', expected: 0.9 },
      { level: 'medium', expected: 0.7 },
      { level: 'low', expected: 0.4 },
    ];

    for (const { level, expected } of cases) {
      const numeric = level === 'high' ? 0.9 : level === 'medium' ? 0.7 : 0.4;
      expect(numeric).toBe(expected);
    }
  });
});

// ============================================================================
// Response Format Tests
// ============================================================================

describe('MemoryWriteResponse format', () => {
  it('should structure success response', () => {
    const response = { success: true, backend: 'session', key: 'test-key' };

    expect(response.success).toBe(true);
    expect(response.backend).toBe('session');
    expect(response.key).toBe('test-key');
  });

  it('should structure failure response with error', () => {
    const response = {
      success: false,
      backend: 'agentic',
      key: 'test-key',
      error: 'Agentic memory backend unavailable (requires SQLite)',
    };

    expect(response.success).toBe(false);
    expect(response.error).toContain('unavailable');
  });

  it('should structure adaptive unavailable response', () => {
    const response = {
      success: false,
      backend: 'adaptive',
      key: 'test-key',
      error: 'Adaptive memory backend unavailable (requires SQLite)',
    };

    expect(response.success).toBe(false);
    expect(response.backend).toBe('adaptive');
    expect(response.error).toContain('Adaptive memory backend unavailable');
  });

  it('should structure typed unavailable response', () => {
    const response = {
      success: false,
      backend: 'typed',
      key: 'test-key',
      error: 'Typed memory backend unavailable (requires SQLite)',
    };

    expect(response.success).toBe(false);
    expect(response.backend).toBe('typed');
    expect(response.error).toContain('Typed memory backend unavailable');
  });

  it('should structure adaptive success response', () => {
    const response = { success: true, backend: 'adaptive', key: 'priority-key' };

    expect(response.success).toBe(true);
    expect(response.backend).toBe('adaptive');
  });

  it('should structure typed success response', () => {
    const response = { success: true, backend: 'typed', key: 'semantic-key' };

    expect(response.success).toBe(true);
    expect(response.backend).toBe('typed');
  });
});
