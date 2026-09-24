/**
 * `doctor --gateway` measurement and report (#6609), against the fake
 * OpenAI-spec gateway over real HTTP.
 *
 * @module cli/doctor-gateway.test
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  checkGatewayHealth,
  cliFailsVerdict,
  gatewaySlotWarnings,
  gatewayVerdict,
  unservedSlotLines,
} from './doctor-gateway.js';
import type { GatewayHealth } from './doctor-gateway.js';
import { formatGatewayReport } from './doctor-gateway-report.js';
import { gatewaySlotServing } from './doctor-gateway-slots.js';
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
    routerAdmits: false,
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

describe('slot coverage in the verdict (#6658)', () => {
  const missing = (name: CliCheckResult['name']): CliCheckResult => ({
    name,
    installed: false,
    authenticated: false,
    authState: 'unverified',
    routerAdmits: false,
    version: 'N/A',
    versionStatus: 'unsupported',
  });
  const familyClis = (['claude', 'gemini', 'codex'] as const).map(missing);
  const allClis = [...familyClis, missing('opencode')];
  const openAiOnly = THREE_FAMILY_CATALOG.filter((r) => r.owned_by === 'openai');
  const mistral: CatalogEntry = {
    id: 'mistral-large-2411',
    object: 'model',
    created: 1731000000,
    owned_by: 'mistral',
  };

  it('an OpenAI-only catalog passes, naming the claude and gemini slots unavailable', async () => {
    gateway.setCatalog(openAiOnly);

    const health = healthy(await checkGatewayHealth());

    expect(unservedSlotLines(health)).toEqual([
      'claude slot unavailable: the gateway has no anthropic model',
      'gemini slot unavailable: the gateway has no google model',
    ]);
    expect(gatewayVerdict(health)).toBe('pass');
    const warnings = gatewaySlotWarnings(health, familyClis);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatch(/^claude slot unavailable: .*no anthropic model/);
    expect(warnings[1]).toMatch(/^gemini slot unavailable: .*no google model/);
    expect(formatGatewayReport(health).join('\n')).toContain('claude slot unavailable');
  });

  it('an empty chat catalog fails', async () => {
    gateway.setCatalog([]);

    const health = await checkGatewayHealth();

    expect(health.state).toBe('no_chat_models');
    expect(gatewayVerdict(health)).toBe('fail');
    expect(gatewaySlotWarnings(health, allClis)).toEqual([]);
  });

  it('a catalog whose chat models serve no slot fails: zero usable slots', async () => {
    gateway.setCatalog([mistral]);

    const health = healthy(await checkGatewayHealth());

    expect(unservedSlotLines(health)).toEqual([
      'no slot has a gateway model: every pinned claude, codex or gemini slot is unavailable',
    ]);
    expect(gatewayVerdict(health)).toBe('fail');
    expect(formatGatewayReport(health).join('\n')).toContain('no slot has a gateway model');
  });

  it('a full three-family catalog passes with no slot warning', async () => {
    const health = healthy(await checkGatewayHealth());

    expect(unservedSlotLines(health)).toEqual([]);
    expect(gatewayVerdict(health)).toBe('pass');
    expect(gatewaySlotWarnings(health, familyClis)).toEqual([]);
  });

  it('a missing opencode is a named warning, not a failure', async () => {
    const health = healthy(await checkGatewayHealth());

    const warnings = gatewaySlotWarnings(health, allClis);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^opencode slot unavailable: /);
    expect(cliFailsVerdict(missing('opencode'), gatewayVerdict(health))).toBe(false);
  });

  it('names no slot whose CLI is installed', async () => {
    gateway.setCatalog(openAiOnly);
    const installedClaude: CliCheckResult = {
      ...missing('claude'),
      installed: true,
      authenticated: true,
      authState: 'authenticated',
      version: '1.0.0',
      versionStatus: 'supported',
    };

    const health = healthy(await checkGatewayHealth());

    const warnings = gatewaySlotWarnings(health, [installedClaude, missing('gemini')]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^gemini slot unavailable/);
  });

  it('--probe: a no_model family counts as an unavailable slot', async () => {
    gateway.setCatalog(openAiOnly);

    const health = healthy(await checkGatewayHealth({ probe: true }));

    expect(health.probes).not.toBe('skipped');
    if (health.probes === 'skipped') return;
    expect(health.probes.map((p) => p.outcome)).toEqual(['no_model', 'ok', 'no_model']);
    expect(unservedSlotLines(health)).toHaveLength(2);
    expect(gatewaySlotWarnings(health, familyClis)).toHaveLength(2);
    expect(gatewayVerdict(health)).toBe('pass');
  });

  it('--probe: no_model for every family fails', async () => {
    gateway.setCatalog([mistral]);

    const health = healthy(await checkGatewayHealth({ probe: true }));

    expect(gatewayVerdict(health)).toBe('fail');
  });
});

describe('slot serving under NEXUS_DISABLED_CLIS (#6720)', () => {
  const cli = (
    name: CliCheckResult['name'],
    installed: boolean,
    authenticated = installed
  ): CliCheckResult => ({
    name,
    installed,
    authenticated,
    authState: authenticated ? 'authenticated' : 'not-authenticated',
    routerAdmits: authenticated,
    version: installed ? '1.0.0' : 'N/A',
    versionStatus: installed ? 'supported' : 'unsupported',
  });
  const openAiOnly = THREE_FAMILY_CATALOG.filter((r) => r.owned_by === 'openai');

  it('reports a disabled claude as gateway-served when the gateway lists anthropic', async () => {
    vi.stubEnv('NEXUS_DISABLED_CLIS', 'claude');
    const health = healthy(await checkGatewayHealth());
    // doctor does not probe a disabled CLI, so it is absent from the list.
    const clis = [cli('gemini', false), cli('codex', true), cli('opencode', false)];

    const serving = gatewaySlotServing(health, clis);
    expect(serving.map((s) => [s.slot, s.serving])).toEqual([
      ['claude', 'gateway'],
      ['codex', 'cli'],
      ['gemini', 'gateway'],
    ]);
    expect(serving[0]?.disabled).toBe(true);
    const report = formatGatewayReport(health, clis).join('\n');
    expect(report).toContain(
      `claude → ${health.slots.claude} (gateway; CLI disabled by NEXUS_DISABLED_CLIS)`
    );
    expect(report).toContain('codex → CLI');
    expect(gatewaySlotWarnings(health, clis).some((w) => w.startsWith('claude'))).toBe(false);
  });

  it('reports a disabled claude as unavailable when the gateway has no anthropic model', async () => {
    vi.stubEnv('NEXUS_DISABLED_CLIS', 'claude');
    gateway.setCatalog(openAiOnly);
    const health = healthy(await checkGatewayHealth());
    const clis = [cli('gemini', true), cli('codex', false), cli('opencode', true)];

    expect(gatewaySlotServing(health, clis).find((s) => s.slot === 'claude')?.serving).toBe(
      'unavailable'
    );
    expect(formatGatewayReport(health, clis).join('\n')).toContain(
      'claude → unavailable (CLI disabled by NEXUS_DISABLED_CLIS; the gateway has no anthropic model)'
    );
    expect(gatewaySlotWarnings(health, clis)).toEqual([
      'claude slot unavailable: disabled by NEXUS_DISABLED_CLIS, and the gateway has no anthropic model',
    ]);
  });

  it('follows the router predicate where the CLI fields alone would say CLI', async () => {
    const health = healthy(await checkGatewayHealth());
    // Installed, supported version, auth unverified — but the health check
    // failed, so `isCliAdmitted` (the router's predicate) rejects it.
    const unhealthyClaude: CliCheckResult = {
      ...cli('claude', true),
      authenticated: false,
      authState: 'unverified',
      routerAdmits: false,
    };

    expect(gatewaySlotServing(health, [unhealthyClaude])[0]?.serving).toBe('gateway');
  });

  it('reports an installed, logged-out CLI as gateway-served, as the router probe decides', async () => {
    const health = healthy(await checkGatewayHealth());
    const clis = [cli('claude', true, false), cli('gemini', true), cli('codex', true)];

    expect(gatewaySlotServing(health, clis).map((s) => s.serving)).toEqual([
      'gateway',
      'cli',
      'cli',
    ]);
  });
});
