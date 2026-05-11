/**
 * Tests for RequestContext middleware.
 * (Source: Issue #185 Phase 1)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  generateRequestId,
  generateSessionId,
  createRequestContext,
  extractCallerInfo,
  contextForLogging,
  isRequestContext,
  type RequestContext,
} from './request-context.js';

describe('RequestContext', () => {
  describe('generateRequestId', () => {
    it('should generate IDs with req_ prefix', () => {
      const id = generateRequestId();
      expect(id).toMatch(/^req_[a-f0-9]{16}$/);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateRequestId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('generateSessionId', () => {
    it('should generate IDs with sess_ prefix', () => {
      const id = generateSessionId();
      expect(id).toMatch(/^sess_[a-f0-9]{12}$/);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateSessionId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('createRequestContext', () => {
    it('should create context with required fields', () => {
      const ctx = createRequestContext({ toolName: 'orchestrate' });

      expect(ctx.requestId).toMatch(/^req_/);
      expect(ctx.toolName).toBe('orchestrate');
      expect(ctx.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(ctx.caller).toEqual({});
    });

    it('should include caller info when provided', () => {
      const ctx = createRequestContext({
        toolName: 'delegate_to_model',
        caller: {
          clientId: 'claude-cli',
          sessionId: 'sess_abc123',
        },
      });

      expect(ctx.caller.clientId).toBe('claude-cli');
      expect(ctx.caller.sessionId).toBe('sess_abc123');
    });

    it('should include trace IDs when provided', () => {
      const ctx = createRequestContext({
        toolName: 'run_workflow',
        traceId: 'trace_xyz',
        parentSpanId: 'span_123',
      });

      expect(ctx.traceId).toBe('trace_xyz');
      expect(ctx.parentSpanId).toBe('span_123');
    });

    it('should create immutable context', () => {
      const ctx = createRequestContext({ toolName: 'test' });

      expect(() => {
        (ctx as { requestId: string }).requestId = 'modified';
      }).toThrow();
    });
  });

  describe('extractCallerInfo', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return empty object when no metadata', () => {
      const caller = extractCallerInfo();
      expect(caller).toEqual({});
    });

    it('should extract clientId from metadata', () => {
      const caller = extractCallerInfo({ clientId: 'test-client' });
      expect(caller.clientId).toBe('test-client');
    });

    it('should detect Claude CLI from environment', () => {
      process.env['CLAUDE_SESSION_ID'] = 'claude_sess_123';
      const caller = extractCallerInfo();
      expect(caller.clientId).toBe('claude-cli');
      expect(caller.sessionId).toBe('claude_sess_123');
    });

    it('should detect Gemini CLI from environment', () => {
      process.env['GEMINI_SESSION_ID'] = 'gemini_sess_456';
      const caller = extractCallerInfo();
      expect(caller.clientId).toBe('gemini-cli');
      expect(caller.sessionId).toBe('gemini_sess_456');
    });
  });

  describe('contextForLogging', () => {
    it('should extract essential fields for logging', () => {
      const ctx = createRequestContext({
        toolName: 'orchestrate',
        caller: { clientId: 'claude-cli' },
        traceId: 'trace_abc',
      });

      const logCtx = contextForLogging(ctx);

      expect(logCtx['requestId']).toBe(ctx.requestId);
      expect(logCtx['toolName']).toBe('orchestrate');
      expect(logCtx['clientId']).toBe('claude-cli');
      expect(logCtx['traceId']).toBe('trace_abc');
    });

    it('should omit undefined optional fields', () => {
      const ctx = createRequestContext({ toolName: 'test' });
      const logCtx = contextForLogging(ctx);

      expect(logCtx).not.toHaveProperty('clientId');
      expect(logCtx).not.toHaveProperty('traceId');
    });
  });

  describe('isRequestContext', () => {
    it('should return true for valid context', () => {
      const ctx = createRequestContext({ toolName: 'test' });
      expect(isRequestContext(ctx)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isRequestContext(null)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(isRequestContext('string')).toBe(false);
      expect(isRequestContext(123)).toBe(false);
    });

    it('should return false for objects missing required fields', () => {
      expect(isRequestContext({})).toBe(false);
      expect(isRequestContext({ requestId: 'req_abc' })).toBe(false);
      expect(isRequestContext({ requestId: 'invalid', toolName: 'test' })).toBe(false);
    });

    it('should return false for objects with wrong requestId format', () => {
      const invalid: Partial<RequestContext> = {
        requestId: 'wrong_format',
        timestamp: '2026-01-11T12:00:00',
        toolName: 'test',
        caller: {},
      };
      expect(isRequestContext(invalid)).toBe(false);
    });
  });
});
