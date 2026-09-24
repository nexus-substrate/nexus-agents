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

/**
 * The githubstatus.com components feed as observed on 2026-09-24 (#6772):
 * the Actions component is named `Actions`, not `GitHub Actions`, and carries
 * the stable id `br0l2tvcx85d`. `actionsStatus` sets that one row's status;
 * every other row is `major_outage`, so matching the wrong row cannot read as
 * the Actions row.
 */
function currentFeed(actionsStatus: string): {
  components: Array<{ id: string; name: string; status: string }>;
} {
  const rows: Array<[string, string]> = [
    ['8l4ygp009s5s', 'Git Operations'],
    ['4230lsnqdsld', 'Webhooks'],
    ['0l2p9nhqnxpd', 'Visit www.githubstatus.com for more information'],
    ['brv1bkgrwx7q', 'API Requests'],
    ['kr09ddfgbfsf', 'Issues'],
    ['hhtssxt0f5v2', 'Pull Requests'],
    ['br0l2tvcx85d', 'Actions'],
    ['st3j38cctv9l', 'Packages'],
    ['vg70hn9s2tyj', 'Pages'],
    ['pjmpxvq2cmr2', 'Copilot'],
    ['h2ftsgbw7kmk', 'Codespaces'],
    ['cnnb39dkkk82', 'Copilot AI Model Providers'],
  ];
  return {
    components: rows.map(([id, name]) => ({
      id,
      name,
      status: id === 'br0l2tvcx85d' ? actionsStatus : 'major_outage',
    })),
  };
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
    fetchMock.mockResolvedValueOnce(jsonResponse(currentFeed('operational')));

    const cap = captureRegisteredHandler();
    registerCiHealthCheckTool(cap.server as never, makeDeps());

    const resp = parseResponse(await cap.getHandler()({}));
    expect(resp.status).toBe<CiHealthStatus>('healthy');
    expect(resp.signals).toHaveLength(1);
    expect(resp.signals[0]?.source).toBe('github-status');
    expect(resp.signals[0]?.evidence).toContain('operational');
  });

  it('returns degraded when GitHub status page reports degraded_performance', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(currentFeed('degraded_performance')));

    const cap = captureRegisteredHandler();
    registerCiHealthCheckTool(cap.server as never, makeDeps());

    const resp = parseResponse(await cap.getHandler()({}));
    expect(resp.status).toBe<CiHealthStatus>('degraded');
  });

  it('returns outage when GitHub status page reports major_outage', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(currentFeed('major_outage')));

    const cap = captureRegisteredHandler();
    registerCiHealthCheckTool(cap.server as never, makeDeps());

    const resp = parseResponse(await cap.getHandler()({}));
    expect(resp.status).toBe<CiHealthStatus>('outage');
  });

  it('returns outage when GitHub status page reports partial_outage', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(currentFeed('partial_outage')));

    const cap = captureRegisteredHandler();
    registerCiHealthCheckTool(cap.server as never, makeDeps());

    const resp = parseResponse(await cap.getHandler()({}));
    expect(resp.status).toBe<CiHealthStatus>('outage');
  });

  it('matches the current feed shape: component named Actions with its stable id (#6772)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(currentFeed('operational')));

    const cap = captureRegisteredHandler();
    registerCiHealthCheckTool(cap.server as never, makeDeps());

    const resp = parseResponse(await cap.getHandler()({}));
    expect(resp.status).toBe<CiHealthStatus>('healthy');
    expect(resp.signals[0]?.evidence).toContain('Actions component reports: operational');
  });

  it('matches by stable id even when the component is renamed (#6772)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        components: [
          { id: 'br0l2tvcx85d', name: 'Actions and Runners', status: 'partial_outage' },
          { id: 'vg70hn9s2tyj', name: 'Pages', status: 'operational' },
        ],
      })
    );

    const cap = captureRegisteredHandler();
    registerCiHealthCheckTool(cap.server as never, makeDeps());

    const resp = parseResponse(await cap.getHandler()({}));
    expect(resp.status).toBe<CiHealthStatus>('outage');
  });

  it('prefers the id match over a name match on a different component (#6772)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        components: [
          { id: 'zzzzzzzzzzzz', name: 'Actions', status: 'operational' },
          { id: 'br0l2tvcx85d', name: 'Workflows', status: 'major_outage' },
        ],
      })
    );

    const cap = captureRegisteredHandler();
    registerCiHealthCheckTool(cap.server as never, makeDeps());

    const resp = parseResponse(await cap.getHandler()({}));
    expect(resp.status).toBe<CiHealthStatus>('outage');
  });

  it('falls back to the exact current name Actions when the id changes (#6772)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        components: [
          { id: 'cccccccccccc', name: 'Git Operations', status: 'operational' },
          { id: 'dddddddddddd', name: 'Actions', status: 'major_outage' },
        ],
      })
    );

    const cap = captureRegisteredHandler();
    registerCiHealthCheckTool(cap.server as never, makeDeps());

    const resp = parseResponse(await cap.getHandler()({}));
    expect(resp.status).toBe<CiHealthStatus>('outage');
  });

  it('still matches the old feed shape: component named GitHub Actions, no id', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        components: [
          { name: 'Git Operations', status: 'major_outage' },
          { name: 'GitHub Actions', status: 'degraded_performance' },
        ],
      })
    );

    const cap = captureRegisteredHandler();
    registerCiHealthCheckTool(cap.server as never, makeDeps());

    const resp = parseResponse(await cap.getHandler()({}));
    expect(resp.status).toBe<CiHealthStatus>('degraded');
  });

  it('does not substring- or case-match an unrelated component whose name contains Actions', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        components: [
          { id: 'aaaaaaaaaaaa', name: 'GitHub Actions Importer', status: 'major_outage' },
          { id: 'bbbbbbbbbbbb', name: 'actions', status: 'major_outage' },
        ],
      })
    );

    const cap = captureRegisteredHandler();
    registerCiHealthCheckTool(cap.server as never, makeDeps());

    const resp = parseResponse(await cap.getHandler()({}));
    expect(resp.status).toBe<CiHealthStatus>('unknown');
    expect(resp.signals[0]?.evidence).toContain('component not found in status feed');
  });

  it('says the component is not in the feed, and names what the feed had, when nothing matches', async () => {
    const withoutActions = {
      components: currentFeed('operational').components.filter((c) => c.id !== 'br0l2tvcx85d'),
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(withoutActions));

    const cap = captureRegisteredHandler();
    registerCiHealthCheckTool(cap.server as never, makeDeps());

    const resp = parseResponse(await cap.getHandler()({}));
    expect(resp.status).toBe<CiHealthStatus>('unknown');
    const evidence = resp.signals[0]?.evidence ?? '';
    expect(evidence).toContain('component not found in status feed');
    expect(evidence).toContain('br0l2tvcx85d');
    expect(evidence).toContain('11 components');
    expect(evidence).toContain('Copilot AI Model Providers');
  });

  it('distinguishes a feed with no components array from a feed without the component', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ page: {} }));

    const cap = captureRegisteredHandler();
    registerCiHealthCheckTool(cap.server as never, makeDeps());

    const resp = parseResponse(await cap.getHandler()({}));
    expect(resp.status).toBe<CiHealthStatus>('unknown');
    expect(resp.signals[0]?.evidence).toContain('no components array');
  });

  it('reports a matched component that carries no status, instead of calling it missing', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ components: [{ id: 'br0l2tvcx85d', name: 'Actions' }] })
    );

    const cap = captureRegisteredHandler();
    registerCiHealthCheckTool(cap.server as never, makeDeps());

    const resp = parseResponse(await cap.getHandler()({}));
    expect(resp.status).toBe<CiHealthStatus>('unknown');
    const evidence = resp.signals[0]?.evidence ?? '';
    expect(evidence).toContain('has no status');
    expect(evidence).not.toContain('not found');
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
    fetchMock.mockResolvedValueOnce(jsonResponse(currentFeed('operational')));
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
    fetchMock.mockResolvedValueOnce(jsonResponse(currentFeed('operational')));
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
    fetchMock.mockResolvedValueOnce(jsonResponse(currentFeed('operational')));
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
    fetchMock.mockResolvedValueOnce(jsonResponse(currentFeed('operational')));
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 502));

    const cap = captureRegisteredHandler();
    registerCiHealthCheckTool(cap.server as never, makeDeps());

    const resp = parseResponse(await cap.getHandler()({ repo: 'nexus-substrate/nexus-agents' }));
    expect(resp.signals[1]?.status).toBe<CiHealthStatus>('unknown');
    // Overall stays healthy — repo signal is unknown, status page is the only definitive one
    expect(resp.status).toBe<CiHealthStatus>('healthy');
  });

  it('returns ISO timestamp in checkedAt', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(currentFeed('operational')));

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
