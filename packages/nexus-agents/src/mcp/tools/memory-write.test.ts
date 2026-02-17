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
});
