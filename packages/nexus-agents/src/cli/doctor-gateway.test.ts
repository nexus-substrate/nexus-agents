/**
 * `doctor --gateway` measurement and report (#6609), against the fake
 * OpenAI-spec gateway over real HTTP.
 *
 * @module cli/doctor-gateway.test
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { checkGatewayHealth, cliFailsVerdict, gatewayVerdict } from './doctor-gateway.js';
import type { GatewayHealth } from './doctor-gateway.js';
import { formatGatewayReport } from './doctor-gateway-report.js';
import type { CliCheckResult } from './doctor.js';
import {
  echoModelScript,
  startFakeGateway,
  type FakeGateway,
} from '../testing/gateway/fake-gateway.js';
import {
  THREE_FAMILY_CATALOG,
  type CatalogEntry,
} from '../testing/gateway/three-family-catalog.js';

const KEY = 'doctor-gateway-secret-key-6609';
const HEADER_VALUE = 'doctor-gateway-secret-header-6609';

let gateway: FakeGateway;

beforeAll(async () => {
  gateway = await startFakeGateway();
});

afterAll(async () => {
  await gateway.close();
});

beforeEach(() => {
  vi.stubEnv('NEXUS_OPENAI_COMPAT_URL', gateway.baseUrl);
  vi.stubEnv('NEXUS_OPENAI_COMPAT_KEY', KEY);
  vi.stubEnv('NEXUS_OPENAI_COMPAT_EXTRA_HEADERS', `X-Tenant=${HEADER_VALUE}`);
  vi.stubEnv('NEXUS_CUSTOM_API_ALLOW_PRIVATE', '1');
  vi.stubEnv('NEXUS_OPENAI_COMPAT_MODELS', undefined);
  vi.stubEnv('NEXUS_OPENCODE_CONFIG', undefined);
  for (const name of ['HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy']) {
    vi.stubEnv(name, undefined);
  }
  vi.stubEnv('NO_PROXY', undefined);
  vi.stubEnv('no_proxy', undefined);
  for (const family of ['ANTHROPIC', 'OPENAI', 'GOOGLE']) {
    vi.stubEnv(`NEXUS_GATEWAY_MODEL_${family}`, undefined);
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  gateway.setCatalog(THREE_FAMILY_CATALOG);
  gateway.setScript(echoModelScript);
  gateway.clearRequests();
});

/** Everything a health value could leak, rendered. */
function rendered(health: GatewayHealth): string {
  return `${JSON.stringify(health)}\n${formatGatewayReport(health).join('\n')}`;
}

function expectNoSecret(text: string): void {
  expect(text).not.toContain(KEY);
  expect(text).not.toContain(HEADER_VALUE);
}

function healthy(health: GatewayHealth): Extract<GatewayHealth, { state: 'healthy' }> {
  if (health.state !== 'healthy') throw new Error(`expected healthy, got ${rendered(health)}`);
  return health;
}

describe('checkGatewayHealth', () => {
  it('is not_configured, with no network call, when no gateway is set', async () => {
    vi.stubEnv('NEXUS_OPENAI_COMPAT_URL', undefined);

    const health = await checkGatewayHealth();

    expect(health).toEqual({ state: 'not_configured' });
    expect(gateway.requests).toHaveLength(0);
    expect(gatewayVerdict(health)).toBe('absent');
  });

  it('reports the model count before and after the chat filter', async () => {
    const health = healthy(await checkGatewayHealth());

    // 24 rows listed; 12 chat models after dedup and the non-chat filter.
    expect(health.listedCount).toBe(24);
    expect(health.chatCount).toBe(12);
    expect(health.allowlistActive).toBe(false);
    expect(gatewayVerdict(health)).toBe('pass');
  });

  it('counts chat models per family, with an unknown bucket', async () => {
    const extra: CatalogEntry = {
      id: 'mistral-large-2411',
      object: 'model',
      created: 1731000000,
      owned_by: 'mistral',
    };
    gateway.setCatalog([...THREE_FAMILY_CATALOG, extra]);

    const health = healthy(await checkGatewayHealth());

    expect(health.census).toEqual({ anthropic: 4, openai: 5, google: 3, unknown: 1 });
    expect(formatGatewayReport(health).join('\n')).toContain(
      'Families: anthropic 4, openai 5, google 3, unknown 1'
    );
  });

  it('resolves each vendor slot to a model of its own family, or unavailable', async () => {
    gateway.setCatalog(THREE_FAMILY_CATALOG.filter((r) => !r.id.includes('gemini')));

    const health = healthy(await checkGatewayHealth());

    expect(health.slots.claude).toMatch(/claude/);
    expect(health.slots.codex).toMatch(/gpt|o3/);
    expect(health.slots.gemini).toBe('unavailable');
  });

  it('does not send a completion unless probe is requested', async () => {
    const health = healthy(await checkGatewayHealth());

    expect(health.probes).toBe('skipped');
    expect(gateway.chatRequests()).toHaveLength(0);
    expect(formatGatewayReport(health).join('\n')).toContain('spends gateway tokens');
  });

  it('with probe, sends exactly one completion per family and says it spent tokens', async () => {
    const health = healthy(await checkGatewayHealth({ probe: true }));

    expect(gateway.chatRequests()).toHaveLength(3);
    expect(health.probes).not.toBe('skipped');
    if (health.probes === 'skipped') return;
    expect(health.probes.map((p) => [p.family, p.outcome])).toEqual([
      ['anthropic', 'ok'],
      ['openai', 'ok'],
      ['google', 'ok'],
    ]);
    const report = formatGatewayReport(health).join('\n');
    expect(report).toContain('Completion probe (one tiny completion per family; this spends');
    expectNoSecret(rendered(health));
  });

  it('fails a probe that the gateway refuses, and the verdict with it', async () => {
    gateway.setScript(() => ({ kind: 'empty_choices' }));

    const health = healthy(await checkGatewayHealth({ probe: true }));

    expect(gatewayVerdict(health)).toBe('fail');
  });

  it('fails an unreachable gateway and names its host', async () => {
    vi.stubEnv('NEXUS_OPENAI_COMPAT_URL', 'http://127.0.0.1:1/v1');

    const health = await checkGatewayHealth();

    expect(health.state).toBe('discovery_failed');
    expect(gatewayVerdict(health)).toBe('fail');
    expect(formatGatewayReport(health).join('\n')).toContain('Gateway 127.0.0.1: FAILED');
    expectNoSecret(rendered(health));
  });

  it('fails a host the private-address guard refuses, naming the host and the remedy', async () => {
    vi.stubEnv('NEXUS_CUSTOM_API_ALLOW_PRIVATE', undefined);

    const health = await checkGatewayHealth();

    expect(health.state).toBe('refused_private_host');
    expect(gatewayVerdict(health)).toBe('fail');
    const report = formatGatewayReport(health).join('\n');
    expect(report).toContain('Gateway 127.0.0.1: FAILED');
    expect(report).toContain('NEXUS_CUSTOM_API_ALLOW_PRIVATE=1');
    expect(gateway.requests).toHaveLength(0);
  });

  it('fails a gateway that lists no chat model', async () => {
    gateway.setCatalog(THREE_FAMILY_CATALOG.filter((r) => r.id.includes('embedding')));

    const health = await checkGatewayHealth();

    expect(health.state).toBe('no_chat_models');
    expect(gatewayVerdict(health)).toBe('fail');
  });

  describe('a gateway that echoes the credentials in its 401 body', () => {
    let echo: Server;
    let echoUrl: string;

    beforeAll(async () => {
      echo = createServer((req, res) => {
        res.writeHead(401, { 'content-type': 'application/json' });
        const seen = `${String(req.headers['authorization'])} ${String(req.headers['x-tenant'])}`;
        res.end(JSON.stringify({ error: { message: `bad credentials: ${seen}` } }));
      });
      await new Promise<void>((resolve) => echo.listen(0, '127.0.0.1', resolve));
      echoUrl = `http://127.0.0.1:${String((echo.address() as AddressInfo).port)}/v1`;
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => {
        echo.close(() => {
          resolve();
        });
      });
    });

    it('fails, and keeps the key and the header value out of the result and report', async () => {
      vi.stubEnv('NEXUS_OPENAI_COMPAT_URL', echoUrl);

      const health = await checkGatewayHealth();

      expect(health.state).toBe('discovery_failed');
      expect(rendered(health)).toContain('<redacted>');
      expectNoSecret(rendered(health));
    });
  });

  describe('proxy status', () => {
    it('reports a proxy by host only, never its credentials', async () => {
      vi.stubEnv('HTTP_PROXY', 'http://proxyuser:proxypass6609@127.0.0.1:1');

      const health = await checkGatewayHealth();

      expect(health.state).not.toBe('not_configured');
      if (health.state === 'not_configured') return;
      expect(health.proxy).toEqual({ kind: 'proxy', proxyHost: '127.0.0.1:1' });
      expect(rendered(health)).not.toContain('proxypass6609');
      expect(rendered(health)).not.toContain('proxyuser');
    });

    it('reports a NO_PROXY exemption as direct', async () => {
      vi.stubEnv('HTTP_PROXY', 'http://127.0.0.1:1');
      vi.stubEnv('NO_PROXY', '127.0.0.1');

      const health = healthy(await checkGatewayHealth());

      expect(health.proxy).toEqual({ kind: 'exempt' });
    });

    it('reports direct when no proxy variable is set', async () => {
      const health = healthy(await checkGatewayHealth());

      expect(health.proxy).toEqual({ kind: 'direct' });
    });
  });
});

describe('cliFailsVerdict', () => {
  const missing: CliCheckResult = {
    name: 'claude',
    installed: false,
    authenticated: false,
    authState: 'unverified',
    version: 'N/A',
    versionStatus: 'unsupported',
  };
  const unauthenticated: CliCheckResult = {
    ...missing,
    installed: true,
    authState: 'not-authenticated',
    version: '1.0.0',
    versionStatus: 'supported',
  };

  it('does not count a missing CLI when the gateway passes', () => {
    expect(cliFailsVerdict(missing, 'pass')).toBe(false);
  });

  it('counts a missing CLI when there is no passing gateway', () => {
    expect(cliFailsVerdict(missing, 'absent')).toBe(true);
    expect(cliFailsVerdict(missing, 'fail')).toBe(true);
  });

  it('still counts an installed CLI that is not authenticated', () => {
    expect(cliFailsVerdict(unauthenticated, 'pass')).toBe(true);
  });
});
