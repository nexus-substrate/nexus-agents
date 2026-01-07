/**
 * Tests for Gemini CLI Adapter
 *
 * Verifies Gemini-specific adapter functionality.
 * Base adapter behavior is tested in base-adapter.test.ts
 * (Source: Issue #114)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiCliAdapter } from './gemini-adapter.js';

describe('GeminiCliAdapter', () => {
  let adapter: GeminiCliAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new GeminiCliAdapter();
  });

  afterEach(async () => {
    await adapter.dispose();
  });

  describe('constructor', () => {
    it('should create adapter with default model', () => {
      expect(adapter.name).toBe('gemini');
    });

    it('should use custom model when provided', () => {
      const customAdapter = new GeminiCliAdapter({ model: 'gemini-2.5-pro' });
      expect(customAdapter.getModelInfo().id).toBe('gemini-2.5-pro');
    });

    it('should accept custom logger', () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn().mockReturnThis(),
        setLevel: vi.fn(),
      };
      const adapterWithLogger = new GeminiCliAdapter({ logger: mockLogger });
      expect(adapterWithLogger).toBeDefined();
    });
  });

  describe('capabilities', () => {
    it('should return correct capability profile', () => {
      const caps = adapter.capabilities;

      expect(caps.reasoning).toBe(8);
      expect(caps.contextWindow).toBe(1_000_000);
      expect(caps.codeGeneration).toBe(7);
      expect(caps.speed).toBe(8);
      expect(caps.cost).toBe(9);
    });
  });

  describe('getModelInfo()', () => {
    it('should return correct model info for default model', () => {
      const info = adapter.getModelInfo();

      expect(info.id).toBe('gemini-2.5-flash');
      expect(info.name).toBe('Gemini 2.5 Flash');
      expect(info.contextWindow).toBe(1_000_000);
      expect(info.maxOutput).toBe(8_192);
    });

    it('should return correct cost info for flash', () => {
      const info = adapter.getModelInfo();

      expect(info.costPerMillionInput).toBe(0.075);
      expect(info.costPerMillionOutput).toBe(0.3);
    });

    it('should return correct info for pro model', () => {
      const proAdapter = new GeminiCliAdapter({ model: 'gemini-2.5-pro' });
      const info = proAdapter.getModelInfo();

      expect(info.id).toBe('gemini-2.5-pro');
      expect(info.name).toBe('Gemini 2.5 Pro');
      expect(info.costPerMillionInput).toBe(1.25);
      expect(info.costPerMillionOutput).toBe(10.0);
    });

    it('should return correct info for flash-lite model', () => {
      const liteAdapter = new GeminiCliAdapter({ model: 'gemini-2.5-flash-lite' });
      const info = liteAdapter.getModelInfo();

      expect(info.id).toBe('gemini-2.5-flash-lite');
      expect(info.name).toBe('Gemini 2.5 Flash Lite');
      expect(info.costPerMillionInput).toBe(0.015);
      expect(info.costPerMillionOutput).toBe(0.06);
    });

    it('should use default costs for unknown model', () => {
      const unknownAdapter = new GeminiCliAdapter({ model: 'gemini-unknown' });
      const info = unknownAdapter.getModelInfo();

      expect(info.costPerMillionInput).toBe(0.075);
      expect(info.costPerMillionOutput).toBe(0.3);
      expect(info.contextWindow).toBe(1_000_000);
    });
  });

  describe('context window', () => {
    it('should return 1M context for all Gemini models', () => {
      const models = ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];

      for (const model of models) {
        const modelAdapter = new GeminiCliAdapter({ model });
        expect(modelAdapter.getModelInfo().contextWindow).toBe(1_000_000);
      }
    });
  });

  describe('transport', () => {
    it('should use subprocess transport', () => {
      expect(adapter.transport).toBe('subprocess');
    });
  });

  describe('lifecycle', () => {
    it('should initialize successfully', async () => {
      await expect(adapter.initialize()).resolves.not.toThrow();
    });

    it('should dispose successfully', async () => {
      await adapter.initialize();
      await expect(adapter.dispose()).resolves.not.toThrow();
    });
  });
});
