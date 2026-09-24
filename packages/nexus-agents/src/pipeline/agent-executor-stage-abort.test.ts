/**
 * The research and security-scan stages forward their abort signal and end on
 * it (#6747), reporting a timeout or a cancel by the abort's reason.
 *
 * The quality-gate stage has its own real-process test
 * (`agent-executor-quality-gate-abort.test.ts`).
 *
 * @module pipeline/agent-executor-stage-abort.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { recordOutcomeMock, discoveryMock, analyzeMock, securityCheckMock } = vi.hoisted(() => ({
  recordOutcomeMock: vi.fn(),
  discoveryMock: vi.fn(),
  analyzeMock: vi.fn(),
  securityCheckMock: vi.fn(),
}));

vi.mock('./agent-executor-core.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./agent-executor-core.js')>()),
  recordOutcome: recordOutcomeMock,
}));
vi.mock('../mcp/tools/research-discover.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../mcp/tools/research-discover.js')>()),
  executeDiscovery: discoveryMock,
}));
vi.mock('../mcp/tools/research-analyze.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../mcp/tools/research-analyze.js')>()),
  analyzeGaps: analyzeMock,
}));
vi.mock('./security-gate.js', () => ({
  checkSecurityScan: () => securityCheckMock,
}));

import { createAgentStages } from './agent-executor.js';
import { DevPipelineCancelledError } from './dev-pipeline-deadlines.js';
import { AbortError } from '../adapters/abort-utils.js';

const EMPTY_DISCOVERY = {
  topic: 't',
  sourcesQueried: [],
  failedSources: [],
  items: [],
  totalFound: 0,
  alreadyInRegistry: 0,
};

const TIMEOUT_REASON = new DOMException('Dev pipeline research stage timed out', 'TimeoutError');

beforeEach(() => {
  recordOutcomeMock.mockClear();
  discoveryMock.mockReset();
  analyzeMock.mockReset();
  securityCheckMock.mockReset();
});

describe('research stage and the abort signal (#6747)', () => {
  it('hands the signal to discovery', async () => {
    discoveryMock.mockResolvedValue(EMPTY_DISCOVERY);
    analyzeMock.mockResolvedValue({ analysis: [] });
    const signal = new AbortController().signal;

    await createAgentStages().research('task', signal);

    expect(discoveryMock.mock.calls[0]?.[2]).toBe(signal);
  });

  it('a cancel during discovery ends the stage as cancelled, not degraded', async () => {
    const controller = new AbortController();
    discoveryMock.mockImplementation(() => {
      controller.abort('cancel_job');
      return Promise.reject(new AbortError('fetch aborted'));
    });

    await expect(createAgentStages().research('task', controller.signal)).rejects.toBeInstanceOf(
      DevPipelineCancelledError
    );
    expect(analyzeMock).not.toHaveBeenCalled();
    expect(recordOutcomeMock).not.toHaveBeenCalled();
  });

  it('a deadline during discovery ends the stage with the timeout', async () => {
    const controller = new AbortController();
    discoveryMock.mockImplementation(() => {
      controller.abort(TIMEOUT_REASON);
      return Promise.resolve(EMPTY_DISCOVERY);
    });

    await expect(createAgentStages().research('task', controller.signal)).rejects.toBe(
      TIMEOUT_REASON
    );
    expect(recordOutcomeMock).not.toHaveBeenCalled();
  });
});

describe('security-scan stage and the abort signal (#6747)', () => {
  it('hands the signal to the scan', async () => {
    securityCheckMock.mockResolvedValue({
      name: 'security_scan',
      verdict: 'pass',
      details: 'clean',
      durationMs: 1,
    });
    const signal = new AbortController().signal;

    await createAgentStages().securityScan(signal);

    expect(securityCheckMock).toHaveBeenCalledWith(signal);
  });

  it('a cancel ends the stage as cancelled instead of reporting the scan as not run', async () => {
    const controller = new AbortController();
    securityCheckMock.mockImplementation(() => {
      controller.abort('cancel_job');
      // What a scan cut short would otherwise have produced.
      return Promise.resolve({
        name: 'security_scan',
        verdict: 'skip',
        details: 'Scan failed: semgrep aborted',
        durationMs: 1,
      });
    });

    await expect(createAgentStages().securityScan(controller.signal)).rejects.toBeInstanceOf(
      DevPipelineCancelledError
    );
    expect(recordOutcomeMock).not.toHaveBeenCalled();
  });

  it('a deadline ends the stage with the timeout', async () => {
    const controller = new AbortController();
    securityCheckMock.mockImplementation(() => {
      controller.abort(TIMEOUT_REASON);
      return Promise.reject(new AbortError('Security scan aborted'));
    });

    await expect(createAgentStages().securityScan(controller.signal)).rejects.toBe(TIMEOUT_REASON);
  });
});
