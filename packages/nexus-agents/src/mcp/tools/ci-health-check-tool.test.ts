/**
 * Tests for ci_health_check MCP tool (#3076).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CiHealthCheckInputSchema,
  type CiHealthCheckResponse,
  type CiHealthStatus,
  registerCiHealthCheckTool,
  type CiHealthCheckDeps,
} from './ci-health-check-tool.js';

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/** Build a deps stub with no-op logger + permissive rate limiter. */
function makeDeps(): CiHealthCheckDeps {
  return {
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
      setLevel: vi.fn(),
    },
    rateLimiter: { tryAcquire: vi.fn().mockReturnValue(true) },
  } as unknown as CiHealthCheckDeps;
}

/** Captures the handler the tool registers so tests can invoke it directly. */
type RegisteredCallback = (args: unknown) => Promise<{ content: Array<{ text: string }> }>;

function captureRegisteredHandler(): {
  server: { registerTool: ReturnType<typeof vi.fn> };
  getHandler: () => RegisteredCallback;
} {
  let captured: RegisteredCallback | undefined;
  const registerTool = vi.fn((_name: string, _config: unknown, cb: RegisteredCallback): void => {
    captured = cb;
  });
  return {
    server: { registerTool },
    getHandler: () => {
      if (captured === undefined) throw new Error('handler not registered');
      return captured;
    },
  };
}

/** Parse the SDK-shape ToolResult back into our typed response. */
function parseResponse(result: { content: Array<{ text: string }> }): CiHealthCheckResponse {
  const text = result.content[0]?.text;
  if (text === undefined) throw new Error('empty response');
  return JSON.parse(text) as CiHealthCheckResponse;
}

// ----------------------------------------------------------------------------
// Schema
// ----------------------------------------------------------------------------

describe('CiHealthCheckInputSchema', () => {
  it('accepts no arguments — both fields optional', () => {
    const r = CiHealthCheckInputSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it('accepts a valid owner/repo string', () => {
    const r = CiHealthCheckInputSchema.safeParse({ repo: 'nexus-substrate/nexus-agents' });
    expect(r.success).toBe(true);
  });

  it('rejects a repo string without a slash', () => {
    const r = CiHealthCheckInputSchema.safeParse({ repo: 'nexus-agents' });
    expect(r.success).toBe(false);
  });

  it('rejects an activity window below the floor', () => {
    const r = CiHealthCheckInputSchema.safeParse({ activityWindowMinutes: 1 });
    expect(r.success).toBe(false);
  });

  it('rejects an activity window above the ceiling', () => {
    const r = CiHealthCheckInputSchema.safeParse({ activityWindowMinutes: 500 });
    expect(r.success).toBe(false);
  });

  it('defaults activityWindowMinutes to 30', () => {
    const r = CiHealthCheckInputSchema.parse({});
    expect(r.activityWindowMinutes).toBe(30);
  });
});

// ----------------------------------------------------------------------------
// Handler — mocked fetch
// ----------------------------------------------------------------------------

describe('ci_health_check handler', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  /** Build a mocked Response from a JSON body. */
  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  it('returns healthy when GitHub status page reports Actions operational', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ components: [{ name: 'GitHub Actions', status: 'operational' }] })
    );

    const cap = captureRegisteredHandler();
    registerCiHealthCheckTool(cap.server as never, makeDeps());

    const resp = parseResponse(await cap.getHandler()({}));
    expect(resp.status).toBe<CiHealthStatus>('healthy');
    expect(resp.signals).toHaveLength(1);
    expect(resp.signals[0]?.source).toBe('github-status');
    expect(resp.signals[0]?.evidence).toContain('operational');
  });

  it('returns degraded when GitHub status page reports degraded_performance', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        components: [{ name: 'GitHub Actions', status: 'degraded_performance' }],
      })
    );

    const cap = captureRegisteredHandler();
    registerCiHealthCheckTool(cap.server as never, makeDeps());

    const resp = parseResponse(await cap.getHandler()({}));
    expect(resp.status).toBe<CiHealthStatus>('degraded');
  });

  it('returns outage when GitHub status page reports major_outage', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        components: [{ name: 'GitHub Actions', status: 'major_outage' }],
      })
    );

    const cap = captureRegisteredHandler();
    registerCiHealthCheckTool(cap.server as never, makeDeps());

    const resp = parseResponse(await cap.getHandler()({}));
    expect(resp.status).toBe<CiHealthStatus>('outage');
  });

  it('returns outage when GitHub status page reports partial_outage', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        components: [{ name: 'GitHub Actions', status: 'partial_outage' }],
      })
    );

    const cap = captureRegisteredHandler();
    registerCiHealthCheckTool(cap.server as never, makeDeps());

    const resp = parseResponse(await cap.getHandler()({}));
    expect(resp.status).toBe<CiHealthStatus>('outage');
  });

  it('returns unknown when GitHub Actions component is missing from the status page response', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ components: [{ name: 'GitHub Pages', status: 'operational' }] })
    );

    const cap = captureRegisteredHandler();
    registerCiHealthCheckTool(cap.server as never, makeDeps());

    const resp = parseResponse(await cap.getHandler()({}));
    expect(resp.status).toBe<CiHealthStatus>('unknown');
    expect(resp.signals[0]?.evidence).toContain('not found');
  });

  it('returns unknown when the status-page fetch fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const cap = captureRegisteredHandler();
    registerCiHealthCheckTool(cap.server as never, makeDeps());

    const resp = parseResponse(await cap.getHandler()({}));
    expect(resp.status).toBe<CiHealthStatus>('unknown');
    expect(resp.signals[0]?.evidence).toContain('fetch failed');
  });

  it('combines pessimistically — repo activity wedge downgrades a healthy status page to degraded', async () => {
    // status page healthy
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ components: [{ name: 'GitHub Actions', status: 'operational' }] })
    );
    // recent-runs API returns empty
    fetchMock.mockResolvedValueOnce(jsonResponse({ workflow_runs: [] }));

    const cap = captureRegisteredHandler();
    registerCiHealthCheckTool(cap.server as never, makeDeps());

    const resp = parseResponse(await cap.getHandler()({ repo: 'nexus-substrate/nexus-agents' }));
    expect(resp.status).toBe<CiHealthStatus>('degraded');
    expect(resp.signals).toHaveLength(2);
    expect(resp.signals[1]?.source).toBe('repo-activity-window');
    expect(resp.signals[1]?.evidence).toContain('no workflow runs');
  });

  it('returns healthy when both status page and recent-runs window are healthy', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ components: [{ name: 'GitHub Actions', status: 'operational' }] })
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        workflow_runs: [
          { created_at: new Date().toISOString(), status: 'completed' },
          { created_at: new Date(Date.now() - 5 * 60_000).toISOString(), status: 'completed' },
        ],
      })
    );

    const cap = captureRegisteredHandler();
    registerCiHealthCheckTool(cap.server as never, makeDeps());

    const resp = parseResponse(await cap.getHandler()({ repo: 'nexus-substrate/nexus-agents' }));
    expect(resp.status).toBe<CiHealthStatus>('healthy');
    expect(resp.signals[1]?.evidence).toMatch(/2 workflow run\(s\)/);
  });

  it('treats only runs inside the window as activity — older runs ignored', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ components: [{ name: 'GitHub Actions', status: 'operational' }] })
    );
    // Both runs older than the 30-min default window
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        workflow_runs: [
          { created_at: new Date(Date.now() - 90 * 60_000).toISOString(), status: 'completed' },
          { created_at: new Date(Date.now() - 60 * 60_000).toISOString(), status: 'completed' },
        ],
      })
    );

    const cap = captureRegisteredHandler();
    registerCiHealthCheckTool(cap.server as never, makeDeps());

    const resp = parseResponse(await cap.getHandler()({ repo: 'nexus-substrate/nexus-agents' }));
    expect(resp.status).toBe<CiHealthStatus>('degraded');
  });

  it('repo signal returns unknown when the GitHub API rejects', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ components: [{ name: 'GitHub Actions', status: 'operational' }] })
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 502));

    const cap = captureRegisteredHandler();
    registerCiHealthCheckTool(cap.server as never, makeDeps());

    const resp = parseResponse(await cap.getHandler()({ repo: 'nexus-substrate/nexus-agents' }));
    expect(resp.signals[1]?.status).toBe<CiHealthStatus>('unknown');
    // Overall stays healthy — repo signal is unknown, status page is the only definitive one
    expect(resp.status).toBe<CiHealthStatus>('healthy');
  });

  it('returns ISO timestamp in checkedAt', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ components: [{ name: 'GitHub Actions', status: 'operational' }] })
    );

    const cap = captureRegisteredHandler();
    registerCiHealthCheckTool(cap.server as never, makeDeps());

    const resp = parseResponse(await cap.getHandler()({}));
    expect(resp.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('rejects malformed repo input with a structured validation error', async () => {
    const cap = captureRegisteredHandler();
    registerCiHealthCheckTool(cap.server as never, makeDeps());

    const result = await cap.getHandler()({ repo: 'not-a-valid-form' });
    const text = result.content[0]?.text ?? '';
    // toolStructuredError serializes message under content
    expect(text).toContain('Validation error');
  });
});
