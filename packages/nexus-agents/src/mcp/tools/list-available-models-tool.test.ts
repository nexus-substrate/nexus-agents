/**
 * Tests for the list_available_models validation tool handler (#3406).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, it, expect, vi } from 'vitest';

import { listAvailableModelsHandler } from './list-available-models-tool.js';
import { createLogger } from '../../core/index.js';
import type { AvailableModelsSource } from '../../config/available-models-cache.js';
import { startFakeGateway, type FakeGateway } from '../../testing/gateway/fake-gateway.js';

const logger = createLogger({ tool: 'test' });

function src(name: string, ids: string[] | Error): AvailableModelsSource {
  return {
    name,
    listModels: () =>
      ids instanceof Error ? Promise.reject(ids) : Promise.resolve(ids.map((id) => ({ id }))),
  };
}

function parse(text: string): {
  totalTransports: number;
  healthyTransports: number;
  reachableTransports: number;
  totalModels: number;
  transports: {
    transport: string;
    ok: boolean;
    servesModels: boolean;
    modelCount: number;
    sampleModelIds: string[];
    modelIds?: string[];
    error?: string;
  }[];
} {
  return JSON.parse(text) as ReturnType<typeof parse>;
}

describe('list_available_models handler (#3406)', () => {
  it('reports per-transport health and totals', async () => {
    const sourcesFactory = (): AvailableModelsSource[] => [
      src('openrouter', ['a', 'b', 'c']),
      src('claude', ['claude-x']),
    ];
    const res = await listAvailableModelsHandler({}, { sourcesFactory }, logger);
    const data = parse(res.content[0]?.text ?? '');
    expect(data.totalTransports).toBe(2);
    expect(data.healthyTransports).toBe(2);
    expect(data.totalModels).toBe(4);
  });

  it('marks a failing transport ok:false without failing the whole report', async () => {
    const sourcesFactory = (): AvailableModelsSource[] => [
      src('opencode', new Error('cli down')),
      src('gemini', ['g-1']),
    ];
    const res = await listAvailableModelsHandler({}, { sourcesFactory }, logger);
    const data = parse(res.content[0]?.text ?? '');
    expect(data.healthyTransports).toBe(1);
    const opencode = data.transports.find((t) => t.transport === 'opencode');
    expect(opencode?.ok).toBe(false);
    expect(opencode?.error).toContain('cli down');
  });

  it('returns a 5-id sample by default and the full list when includeModelIds=true', async () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const sourcesFactory = (): AvailableModelsSource[] => [src('openrouter', ids)];

    const sample = parse(
      (await listAvailableModelsHandler({}, { sourcesFactory }, logger)).content[0]?.text ?? ''
    );
    expect(sample.transports[0]?.sampleModelIds.length).toBe(5);
    expect(sample.transports[0]?.modelIds).toBeUndefined();

    const full = parse(
      (await listAvailableModelsHandler({ includeModelIds: true }, { sourcesFactory }, logger))
        .content[0]?.text ?? ''
    );
    expect(full.transports[0]?.modelIds?.length).toBe(6);
  });

  it('rejects invalid input', async () => {
    const res = await listAvailableModelsHandler({ includeModelIds: 'yes' }, {}, logger);
    expect(res.content[0]?.text).toContain('Validation error');
  });
});

describe('reachable is not the same as usable (#5128)', () => {
  /**
   * A probe that succeeds and finds nothing used to report `ok: true,
   * modelCount: 0` and count toward `healthyTransports`. Against a stale
   * install, three of five transports reported exactly that and the summary
   * still said every transport was healthy — a diagnostic that could not
   * distinguish "reachable" from "usable", which is the one distinction it
   * exists to make.
   */
  it('does not count an empty-but-successful probe as healthy', async () => {
    const res = await listAvailableModelsHandler(
      {},
      {
        sourcesFactory: (): AvailableModelsSource[] => [src('full', ['a', 'b']), src('empty', [])],
      },
      logger
    );
    const out = parse(res.content[0]?.text ?? '{}');

    expect(out.healthyTransports).toBe(1);
    expect(out.reachableTransports).toBe(2);
  });

  it('marks the empty transport as reachable but not serving', async () => {
    const res = await listAvailableModelsHandler(
      {},
      { sourcesFactory: (): AvailableModelsSource[] => [src('empty', [])] },
      logger
    );
    const out = parse(res.content[0]?.text ?? '{}');
    const t = out.transports[0];

    // Deliberately NOT ok:false. The probe genuinely succeeded, and saying it
    // failed would trade one misreport for another.
    expect(t?.ok).toBe(true);
    expect(t?.servesModels).toBe(false);
  });

  it('counts a failed probe as neither reachable nor healthy', async () => {
    const res = await listAvailableModelsHandler(
      {},
      {
        sourcesFactory: (): AvailableModelsSource[] => [src('broken', new Error('probe exploded'))],
      },
      logger
    );
    const out = parse(res.content[0]?.text ?? '{}');

    expect(out.healthyTransports).toBe(0);
    expect(out.reachableTransports).toBe(0);
    expect(out.transports[0]?.servesModels).toBe(false);
  });

  it('reports all three counts when every transport serves', async () => {
    // The pair for the first test: without this, a bug making healthyTransports
    // always 0 would still pass everything above.
    const res = await listAvailableModelsHandler(
      {},
      { sourcesFactory: (): AvailableModelsSource[] => [src('a', ['x']), src('b', ['y'])] },
      logger
    );
    const out = parse(res.content[0]?.text ?? '{}');

    expect(out.healthyTransports).toBe(2);
    expect(out.reachableTransports).toBe(2);
    expect(out.totalTransports).toBe(2);
  });
});

describe('list_available_models lists the gateway under the gateway (#6609)', () => {
  let gateway: FakeGateway;
  /** A routing arm that can list models, as `createAllAdapters` returns them. */
  const lister = (ids: string[]): { listModels: () => Promise<{ id: string }[]> } => ({
    listModels: () => Promise.resolve(ids.map((id) => ({ id }))),
  });

  beforeAll(async () => {
    gateway = await startFakeGateway();
  });
  afterAll(async () => {
    await gateway.close();
  });
  beforeEach(() => {
    vi.stubEnv('NEXUS_OPENAI_COMPAT_URL', gateway.baseUrl);
    vi.stubEnv('NEXUS_OPENAI_COMPAT_KEY', 'list-models-key-6609');
    vi.stubEnv('NEXUS_CUSTOM_API_ALLOW_PRIVATE', '1');
    vi.stubEnv('NEXUS_OPENAI_COMPAT_MODELS', undefined);
    vi.stubEnv('NEXUS_OPENCODE_CONFIG', undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function transports(
    arms: ReadonlyMap<string, unknown>
  ): Promise<ReturnType<typeof parse>['transports']> {
    const res = await listAvailableModelsHandler(
      { includeOpenRouter: false },
      { adaptersFactory: () => arms },
      logger
    );
    return parse(res.content[0]?.text ?? '').transports;
  }

  it('plan mode: lists the discovered chat catalogue as a gateway transport', async () => {
    const report = await transports(new Map([['opencode', lister(['oc-1'])]]));

    expect(report.map((t) => [t.transport, t.modelCount])).toEqual([
      ['opencode', 1],
      ['gateway', 12],
    ]);
  });

  it('api mode: the api:custom-openai arm is not listed under "opencode"', async () => {
    const arms = new Map<string, unknown>([
      ['opencode', lister(['oc-1'])],
      ['api:custom-openai', lister(['raw-1', 'raw-2'])],
    ]);

    const report = await transports(arms);

    expect(report.map((t) => [t.transport, t.modelCount])).toEqual([
      ['opencode', 1],
      ['gateway', 12],
    ]);
  });

  it('legacy single-model variables only: that arm is listed under "gateway"', async () => {
    vi.stubEnv('NEXUS_OPENAI_COMPAT_URL', undefined);

    const report = await transports(new Map([['api:custom-openai', lister(['raw-1'])]]));

    expect(report.map((t) => [t.transport, t.modelCount])).toEqual([['gateway', 1]]);
  });

  it('no gateway: no gateway transport', async () => {
    vi.stubEnv('NEXUS_OPENAI_COMPAT_URL', undefined);

    const report = await transports(new Map([['opencode', lister(['oc-1'])]]));

    expect(report.map((t) => t.transport)).toEqual(['opencode']);
  });

  it('an unreachable gateway is a failed gateway transport, not a missing one', async () => {
    vi.stubEnv('NEXUS_OPENAI_COMPAT_URL', 'http://127.0.0.1:1/v1');

    const report = await transports(new Map());

    expect(report).toHaveLength(1);
    expect(report[0]).toMatchObject({ transport: 'gateway', ok: false, servesModels: false });
    expect(report[0]?.error).toContain('127.0.0.1');
    expect(JSON.stringify(report)).not.toContain('list-models-key-6609');
  });
});
