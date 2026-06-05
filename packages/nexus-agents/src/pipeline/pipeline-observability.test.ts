/**
 * Tests for Pipeline Observability — shared stage event emission (#1734)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  emitStageStarted,
  emitStageCompleted,
  emitStageFailed,
  emitPipelineStageEvent,
  emitModelCalled,
} from './pipeline-observability.js';
import type { IEventBus } from './event-types.js';

// Mock the event bus module
vi.mock('./event-bus.js', () => ({
  getPipelineEventBus: vi.fn(),
}));

function createMockBus(): IEventBus {
  return {
    emit: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => undefined),
    query: vi.fn().mockReturnValue([]),
    totalEmitted: 0,
    bufferSize: 0,
  };
}

describe('pipeline-observability', () => {
  let mockBus: IEventBus;

  beforeEach(() => {
    mockBus = createMockBus();
    vi.resetAllMocks();
  });

  describe('emitStageStarted', () => {
    it('emits stage.started event with provided bus', () => {
      emitStageStarted({
        bus: mockBus,
        executionId: 'exec-1',
        stageId: 'research',
      });

      expect(mockBus.emit).toHaveBeenCalledOnce();
      const event = vi.mocked(mockBus.emit).mock.calls[0]?.[0];
      expect(event).toMatchObject({
        type: 'stage.started',
        executionId: 'exec-1',
        stageId: 'research',
        pluginId: 'research',
      });
    });

    it('uses custom pluginId when provided', () => {
      emitStageStarted({
        bus: mockBus,
        executionId: 'exec-1',
        stageId: 'research',
        pluginId: 'research-v2',
      });

      const event = vi.mocked(mockBus.emit).mock.calls[0]?.[0];
      expect(event).toMatchObject({ pluginId: 'research-v2' });
    });

    it('does not emit when bus is undefined', () => {
      emitStageStarted({
        bus: undefined,
        executionId: 'exec-1',
        stageId: 'research',
      });

      expect(mockBus.emit).not.toHaveBeenCalled();
    });
  });

  describe('emitStageCompleted', () => {
    it('emits stage.completed with duration and success', () => {
      emitStageCompleted({
        bus: mockBus,
        executionId: 'exec-1',
        stageId: 'plan',
        durationMs: 1500,
        success: true,
      });

      const event = vi.mocked(mockBus.emit).mock.calls[0]?.[0];
      expect(event).toMatchObject({
        type: 'stage.completed',
        executionId: 'exec-1',
        stageId: 'plan',
        durationMs: 1500,
        success: true,
      });
    });

    it('defaults success to true', () => {
      emitStageCompleted({
        bus: mockBus,
        executionId: 'exec-1',
        stageId: 'plan',
        durationMs: 500,
      });

      const event = vi.mocked(mockBus.emit).mock.calls[0]?.[0];
      expect(event).toMatchObject({ success: true });
    });
  });

  describe('emitStageFailed', () => {
    it('emits stage.failed with error message', () => {
      emitStageFailed({
        bus: mockBus,
        executionId: 'exec-1',
        stageId: 'security',
        error: 'Scan failed',
      });

      const event = vi.mocked(mockBus.emit).mock.calls[0]?.[0];
      expect(event).toMatchObject({
        type: 'stage.failed',
        executionId: 'exec-1',
        stageId: 'security',
        error: 'Scan failed',
      });
    });
  });

  describe('emitPipelineStageEvent', () => {
    beforeEach(async () => {
      const { getPipelineEventBus } = await import('./event-bus.js');
      vi.mocked(getPipelineEventBus).mockReturnValue(mockBus);
    });

    it('emits started event via global bus', () => {
      emitPipelineStageEvent('dev-pipeline', 'research', 'started');

      const event = vi.mocked(mockBus.emit).mock.calls[0]?.[0];
      expect(event).toMatchObject({
        type: 'stage.started',
        executionId: 'dev-pipeline-research',
        stageId: 'research',
      });
    });

    it('emits completed event with duration', () => {
      emitPipelineStageEvent('dev-pipeline', 'plan', 'completed', {
        durationMs: 2000,
      });

      const event = vi.mocked(mockBus.emit).mock.calls[0]?.[0];
      expect(event).toMatchObject({
        type: 'stage.completed',
        stageId: 'plan',
        durationMs: 2000,
      });
    });

    it('emits failed event with error', () => {
      emitPipelineStageEvent('dev-pipeline', 'security', 'failed', {
        error: 'Critical finding',
      });

      const event = vi.mocked(mockBus.emit).mock.calls[0]?.[0];
      expect(event).toMatchObject({
        type: 'stage.failed',
        stageId: 'security',
        error: 'Critical finding',
      });
    });

    it('defaults error to Unknown when not provided', () => {
      emitPipelineStageEvent('dev-pipeline', 'qa', 'failed');

      const event = vi.mocked(mockBus.emit).mock.calls[0]?.[0];
      expect(event).toMatchObject({ error: 'Unknown' });
    });
  });

  describe('emitModelCalled (#3387)', () => {
    it('emits a model.called event with full attribution', () => {
      emitModelCalled({
        bus: mockBus,
        executionId: 'plan',
        cli: 'claude',
        model: 'claude-opus',
        tokensIn: 100,
        tokensOut: 50,
        durationMs: 1200,
      });

      expect(mockBus.emit).toHaveBeenCalledOnce();
      const event = vi.mocked(mockBus.emit).mock.calls[0]?.[0];
      expect(event).toMatchObject({
        type: 'model.called',
        executionId: 'plan',
        cli: 'claude',
        model: 'claude-opus',
        tokensIn: 100,
        tokensOut: 50,
        durationMs: 1200,
      });
      expect((event as { timestamp: number }).timestamp).toBeTypeOf('number');
    });

    it('includes optional agentId/role when provided', () => {
      emitModelCalled({
        bus: mockBus,
        executionId: 'vote',
        cli: 'gemini',
        model: 'gemini-3-pro',
        tokensIn: 10,
        tokensOut: 5,
        durationMs: 300,
        agentId: 'agent-7',
        role: 'security_expert',
      });

      const event = vi.mocked(mockBus.emit).mock.calls[0]?.[0];
      expect(event).toMatchObject({ agentId: 'agent-7', role: 'security_expert' });
    });
  });
});
