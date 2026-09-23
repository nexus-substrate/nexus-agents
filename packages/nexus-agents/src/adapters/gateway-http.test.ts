/**
 * Corporate-network transport for in-process gateway calls (#6608): the auth
 * header option, extra static headers and the proxy. These run the real
 * `openai` SDK against loopback servers, so what is asserted is what went on
 * the wire, not what a mock was handed.
 */

import http from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createOpenAICompatAdapter,
  discoverModels,
  readOpenAICompatEnv,
} from './openai-compat-adapter.js';
import { gatewayProxyUrl, parseGatewayExtraHeaders, readGatewayTransport } from './gateway-http.js';
import { GatewayHostRefusedError } from './gateway-host-status.js';
import type { ILogger } from '../core/index.js';

vi.mock('../learning/usage-log.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../learning/usage-log.js')>();
  return { ...actual, recordUsageEvent: vi.fn() };
});
vi.mock('../config/opencode-bridge.js', () => ({ readOpencodeGateway: vi.fn(() => null) }));

const ENV_NAMES = [
  'NEXUS_OPENAI_COMPAT_URL',
  'NEXUS_OPENAI_COMPAT_KEY',
  'NEXUS_OPENAI_COMPAT_AUTH_HEADER',
  'NEXUS_OPENAI_COMPAT_EXTRA_HEADERS',
  'NEXUS_OPENAI_COMPAT_MODELS',
  'NEXUS_OPENAI_COMPAT_ENDPOINT',
  'NEXUS_OPENCODE_CONFIG',
  'NEXUS_CUSTOM_API_ALLOW_PRIVATE',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
] as const;

/** A key shape no fixture header value shares, so a leak is unambiguous. */
const GATEWAY_KEY = 'gw-secret-7Qx2-not-a-header-value';

type Headers = Readonly<Record<string, string | string[] | undefined>>;

interface FakeGateway {
  readonly server: http.Server;
  readonly port: number;
  readonly seen: Map<string, Headers>;
}

/** An OpenAI-shaped gateway that records each request's headers by path. */
async function startFakeGateway(): Promise<FakeGateway> {
  const seen = new Map<string, Headers>();
  const server = http.createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0] ?? '';
    seen.set(path, { ...req.headers });
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      if (path.endsWith('/models')) {
        res.end(JSON.stringify({ object: 'list', data: [{ id: 'gw-model-a', object: 'model' }] }));
        return;
      }
      res.end(
        JSON.stringify({
          id: 'cmpl-1',
          object: 'chat.completion',
          created: 1,
          model: 'gw-model-a',
          choices: [
            { index: 0, message: { role: 'assistant', content: 'pong' }, finish_reason: 'stop' },
          ],
          usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
        })
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: (server.address() as AddressInfo).port, seen };
}

/** A CONNECT proxy that records each tunnel target and pipes it to `targetPort`. */
async function startTunnelProxy(
  targetPort: number
): Promise<{ server: http.Server; port: number; tunnels: string[] }> {
  const tunnels: string[] = [];
  const server = http.createServer((_req, res) => {
    res.writeHead(405);
    res.end();
  });
  server.on('connect', (req, client: net.Socket, head: Buffer) => {
    tunnels.push(req.url ?? '');
    const upstream = net.connect(targetPort, '127.0.0.1', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length > 0) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.on('error', () => client.destroy());
    client.on('error', () => upstream.destroy());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: (server.address() as AddressInfo).port, tunnels };
}

function makeLogger(): ILogger & { warn: ReturnType<typeof vi.fn> } {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    setLevel: vi.fn(),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger;
}

const servers: http.Server[] = [];

beforeEach(() => {
  // Unset every variable the tests read; unstubAllEnvs restores the originals.
  for (const name of ENV_NAMES) vi.stubEnv(name, undefined);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    servers.splice(0).map(
      (s) =>
        new Promise<void>((resolve) => {
          s.closeAllConnections();
          s.close(() => {
            resolve();
          });
        })
    )
  );
});

describe('gateway auth header option (#6608 item 1)', () => {
  it('sends the key in the configured header plus the extra headers, with no bearer, on discovery AND completions', async () => {
    const gateway = await startFakeGateway();
    servers.push(gateway.server);
    process.env['NEXUS_OPENAI_COMPAT_URL'] = `http://127.0.0.1:${String(gateway.port)}/v1`;
    process.env['NEXUS_OPENAI_COMPAT_KEY'] = GATEWAY_KEY;
    process.env['NEXUS_OPENAI_COMPAT_AUTH_HEADER'] = 'Api-Key';
    process.env['NEXUS_OPENAI_COMPAT_EXTRA_HEADERS'] = ' X-Tenant = blue-team ,X-Route=eu-1';
    process.env['NEXUS_CUSTOM_API_ALLOW_PRIVATE'] = '1';

    const config = readOpenAICompatEnv();
    expect(config).not.toBeNull();
    if (config === null) return;
    const listed = await discoverModels(config);
    expect(listed.ok && listed.value.map((m) => m.id)).toEqual(['gw-model-a']);
    const reply = await createOpenAICompatAdapter('gw-model-a', config).complete({
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 8,
    });
    expect(reply.ok).toBe(true);

    for (const path of ['/v1/models', '/v1/chat/completions']) {
      const headers = gateway.seen.get(path);
      expect(headers, path).toBeDefined();
      expect(headers?.['api-key'], path).toBe(GATEWAY_KEY);
      expect(headers?.['authorization'], path).toBeUndefined();
      expect(headers?.['x-tenant'], path).toBe('blue-team');
      expect(headers?.['x-route'], path).toBe('eu-1');
    }
  });

  it('keeps the bearer default when the option is unset', async () => {
    const gateway = await startFakeGateway();
    servers.push(gateway.server);
    process.env['NEXUS_CUSTOM_API_ALLOW_PRIVATE'] = '1';
    const listed = await discoverModels({
      baseUrl: `http://127.0.0.1:${String(gateway.port)}/v1`,
      apiKey: GATEWAY_KEY,
    });
    expect(listed.ok).toBe(true);
    const headers = gateway.seen.get('/v1/models');
    expect(headers?.['authorization']).toBe(`Bearer ${GATEWAY_KEY}`);
    expect(headers?.['api-key']).toBeUndefined();
  });

  it('discovery refuses a private host with the typed error the bootstrap reports (#6608 item 3)', async () => {
    const listed = await discoverModels({
      baseUrl: 'http://10.44.0.9:4000/v1',
      apiKey: GATEWAY_KEY,
    });
    expect(listed.ok).toBe(false);
    if (listed.ok) return;
    expect(listed.error).toBeInstanceOf(GatewayHostRefusedError);
    expect(listed.error.message).not.toContain(GATEWAY_KEY);
  });

  it('refuses an extra-headers value carrying a newline, and never logs a value', () => {
    const logger = makeLogger();
    const transport = readGatewayTransport(
      'https://gw.example.com/v1',
      {
        NEXUS_OPENAI_COMPAT_EXTRA_HEADERS: 'X-Tenant=blue-team\r\nX-Injected=evil-value',
        NEXUS_OPENAI_COMPAT_AUTH_HEADER: 'bad header:name',
      },
      logger
    );
    expect(transport.extraHeaders).toBeUndefined();
    expect(transport.authHeader).toBeUndefined();
    const logged = JSON.stringify(logger.warn.mock.calls);
    expect(logged).toContain('NEXUS_OPENAI_COMPAT_EXTRA_HEADERS');
    expect(logged).toContain('NEXUS_OPENAI_COMPAT_AUTH_HEADER');
    expect(logged).not.toContain('blue-team');
    expect(logged).not.toContain('evil-value');
  });

  it.each([
    ['X-A=1,X-A=2', 'duplicate'],
    ['Authorization=Bearer other', 'authorization'],
    ['=no-name', 'name'],
    ['X-No-Equals', '='],
    ['X-Ctl=a\u0007b', 'control'],
  ])('rejects %j', (raw, reasonFragment) => {
    const parsed = parseGatewayExtraHeaders(raw);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason.toLowerCase()).toContain(reasonFragment);
  });
});

describe('gateway proxy (#6608 item 2)', () => {
  it('tunnels discovery and completions through HTTP_PROXY to a host only the proxy can reach', async () => {
    const gateway = await startFakeGateway();
    const proxy = await startTunnelProxy(gateway.port);
    servers.push(gateway.server, proxy.server);
    // `.invalid` never resolves (RFC 6761): only the proxy's tunnel reaches it.
    process.env['NEXUS_OPENAI_COMPAT_URL'] = 'http://gateway.corp.invalid/v1';
    process.env['NEXUS_OPENAI_COMPAT_KEY'] = GATEWAY_KEY;
    process.env['NEXUS_CUSTOM_API_ALLOW_PRIVATE'] = '1';
    process.env['HTTP_PROXY'] = `http://127.0.0.1:${String(proxy.port)}`;

    const config = readOpenAICompatEnv();
    if (config === null) throw new Error('config expected');
    const listed = await discoverModels(config);
    expect(listed.ok && listed.value.map((m) => m.id)).toEqual(['gw-model-a']);
    const reply = await createOpenAICompatAdapter('gw-model-a', config).complete({
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 8,
    });
    expect(reply.ok).toBe(true);
    expect(proxy.tunnels.length).toBeGreaterThanOrEqual(1);
    expect(new Set(proxy.tunnels)).toEqual(new Set(['gateway.corp.invalid:80']));
    expect([...gateway.seen.keys()].sort()).toEqual(['/v1/chat/completions', '/v1/models']);
  });

  it.each<[string, Record<string, string>, string | undefined]>([
    [
      'https://gw.corp.example/v1',
      { HTTPS_PROXY: 'http://proxy.one:3128' },
      'http://proxy.one:3128',
    ],
    ['http://gw.corp.example/v1', { HTTPS_PROXY: 'http://proxy.one:3128' }, undefined],
    ['http://gw.corp.example/v1', { HTTP_PROXY: 'http://proxy.two:8080' }, 'http://proxy.two:8080'],
    [
      'https://gw.corp.example/v1',
      { https_proxy: 'http://lower:1', HTTPS_PROXY: 'http://upper:2' },
      'http://lower:1',
    ],
    [
      'https://gw.corp.example/v1',
      { HTTPS_PROXY: 'http://p:1', NO_PROXY: '.corp.example' },
      undefined,
    ],
    [
      'https://gw.corp.example/v1',
      { HTTPS_PROXY: 'http://p:1', NO_PROXY: 'corp.example' },
      undefined,
    ],
    ['https://gw.corp.example/v1', { HTTPS_PROXY: 'http://p:1', no_proxy: '*' }, undefined],
    [
      'https://gw.corp.example/v1',
      { HTTPS_PROXY: 'http://p:1', NO_PROXY: 'other.example, xcorp.example' },
      'http://p:1',
    ],
    [
      'https://gw.corp.example:8443/v1',
      { HTTPS_PROXY: 'http://p:1', NO_PROXY: 'gw.corp.example:443' },
      'http://p:1',
    ],
    [
      'https://gw.corp.example:8443/v1',
      { HTTPS_PROXY: 'http://p:1', NO_PROXY: 'gw.corp.example:8443' },
      undefined,
    ],
  ])('selects the proxy for %s under %j', (baseUrl, env, expected) => {
    expect(gatewayProxyUrl(baseUrl, env)).toBe(expected);
  });

  it('ignores a proxy URL it cannot use, warning without echoing it', () => {
    const logger = makeLogger();
    const transport = readGatewayTransport(
      'https://gw.corp.example/v1',
      { HTTPS_PROXY: 'socks5://user:hunter2@proxy.corp:1080' },
      logger
    );
    expect(transport.proxyUrl).toBeUndefined();
    const logged = JSON.stringify(logger.warn.mock.calls);
    expect(logged).toContain('HTTPS_PROXY');
    expect(logged).not.toContain('hunter2');
  });
});
