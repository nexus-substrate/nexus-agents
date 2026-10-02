/** Server registration keeps pipeline events off the V1 bus (#5120, seam 5). */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerMcpTools } from './cli-server-tools.js';
import { logFinalEventBusStats } from './cli-server-lifecycle.js';
import type { ILogger } from './core/index.js';
import {
  createEvent,
  getGlobalEventBus,
  resetGlobalEventBus,
} from './agents/collaboration/event-bus.js';
import { initializeEventBusBridge } from './mcp/eventbus-bridge.js';
import { shutdownImprovementReviewScheduler } from './mcp/tools/improvement-review-scheduler.js';
import {
  SwarmObserver,
  setSwarmObserver,
  shutdownSwarmHealthSignals,
  shutdownFailoverSignals,
} from './observability/index.js';
import { getPipelineEventBus, resetPipelineEventBus } from './pipeline/event-bus.js';
import { shutdownTuneStage } from './pipeline/tune-stage.js';
import type { PipelineEvent } from './pipeline/event-types.js';

function makeLogger(): ILogger {
  const logger: ILogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => logger,
    setLevel: vi.fn(),
  };
  return logger;
}

function recordObserverControl(observer: SwarmObserver): void {
  const bus = getGlobalEventBus();
  const before = bus.getStats();
  bus.emit(
    createEvent('agent.started', { agentId: 'seam-agent' }, { correlationId: 'v1-agent-control' })
  );
  expect(observer.getEventsByTrace('v1-agent-control')).toHaveLength(1);
  expect(bus.getStats().eventsEmitted).toBe(before.eventsEmitted + 1);
  expect(bus.getStats().historySize).toBe(before.historySize + 1);
}

function modelCallProbe(): Extract<PipelineEvent, { type: 'model.called' }> {
  return {
    type: 'model.called',
    timestamp: Date.now(),
    executionId: 'pipeline-seam-probe',
    agentId: 'seam-agent',
    cli: 'codex',
    model: 'seam-probe-model',
    tokensIn: 0,
    tokensOut: 0,
    durationMs: 0,
  };
}

afterEach(() => {
  shutdownTuneStage();
  shutdownSwarmHealthSignals();
  shutdownFailoverSignals();
  shutdownImprovementReviewScheduler();
  resetPipelineEventBus();
  resetGlobalEventBus();
  vi.unstubAllEnvs();
});

describe('server registration → pipeline event → V1 bus (#5120)', () => {
  it('leaves V1 history and emission counts unchanged for pipeline events', async () => {
    vi.stubEnv('NEXUS_IMPROVEMENT_REVIEW_INTERVAL_MS', '0');
    const logger = makeLogger();
    const observer = new SwarmObserver();
    setSwarmObserver(observer);
    const observerBridge = initializeEventBusBridge(observer, logger);
    const server = new McpServer({ name: 'pipeline-seam', version: '1.0.0' });
    try {
      registerMcpTools({ server, logger, builtInTemplates: new Map() });
      const v1Bus = getGlobalEventBus();
      v1Bus.clearHistory();
      expect(v1Bus.getHistory(), 'empty history is the measured baseline').toEqual([]);
      recordObserverControl(observer);
      const before = v1Bus.getStats();
      const historyBefore = v1Bus.getHistory();
      const pipelineBus = getPipelineEventBus();
      const pipelineCountBefore = pipelineBus.totalEmitted;
      const probe = modelCallProbe();

      pipelineBus.emit(probe);

      expect(pipelineBus.totalEmitted).toBe(pipelineCountBefore + 1);
      expect(pipelineBus.query({ executionId: probe.executionId })).toContainEqual(probe);
      expect(v1Bus.getStats().eventsEmitted).toBe(before.eventsEmitted);
      expect(v1Bus.getStats().historySize).toBe(before.historySize);
      expect(v1Bus.getHistory()).toEqual(historyBefore);
      // No matching observer event is expected; the native control reaches it.
      expect(observer.getEventsByTrace('pipeline-seam-probe')).toEqual([]);
      logFinalEventBusStats(logger);
      expect(logger.info).toHaveBeenCalledWith(
        'Final EventBus statistics',
        expect.objectContaining({
          eventsEmitted: before.eventsEmitted,
          historySize: before.historySize,
        })
      );
    } finally {
      observerBridge.cleanup();
      await server.close();
    }
  });
});
