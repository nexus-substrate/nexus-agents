/**
 * Tests for the model-drift discovery sources (#6625). Every transport is faked.
 */
import { describe, expect, it, vi } from 'vitest';

import { ConfigError, err, ok } from '../core/index.js';
import type { DriftProbe } from './model-drift.js';
import { buildDriftSources, type DriftSourceDeps } from './model-drift-sources.js';

const GATEWAY = { baseUrl: 'https://gateway.invalid', apiKey: 'gw-test', endpoint: 'gw' };

function deps(overrides: Partial<DriftSourceDeps> = {}): DriftSourceDeps {
  return {
    env: {},
    readGateway: () => null,
    discoverGateway: () => Promise.resolve(ok([])),
    vendorLister: () => ({ listModels: () => Promise.resolve([]) }),
    openRouterCatalog: () => Promise.resolve([]),
    modelsDevCatalog: () => Promise.resolve({}),
    ...overrides,
  };
}

async function probeByName(d: DriftSourceDeps, name: string): Promise<DriftProbe> {
  const source = buildDriftSources(d).find((s) => s.name === name);
  if (source === undefined) throw new Error(`no source ${name}`);
  return source.probe();
}

describe('buildDriftSources', () => {
  it('lists the gateway, three vendor APIs, OpenRouter and models.dev', () => {
    expect(buildDriftSources(deps()).map((s) => s.name)).toEqual([
      'gateway',
      'anthropic-api',
      'openai-api',
      'google-api',
      'openrouter',
      'models-dev',
    ]);
  });

  it('reports a vendor API without a key as unmeasured and never calls it', async () => {
    const vendorLister = vi.fn();
    const probe = await probeByName(deps({ vendorLister }), 'anthropic-api');

    expect(probe).toEqual({ status: 'unmeasured', reason: 'ANTHROPIC_API_KEY is not set' });
    expect(vendorLister).not.toHaveBeenCalled();
  });

  it('lists a vendor API with its key, keeping created time and context length', async () => {
    const vendorLister = vi.fn(() => ({
      listModels: () =>
        Promise.resolve([{ id: 'gpt-7', createdAt: 1_790_000_000, contextLength: 400_000 }]),
    }));
    const probe = await probeByName(
      deps({ env: { OPENAI_API_KEY: 'sk-test-fake' }, vendorLister }),
      'openai-api'
    );

    expect(vendorLister).toHaveBeenCalledWith('openai', 'sk-test-fake');
    expect(probe).toEqual({
      status: 'measured',
      models: [{ id: 'gpt-7', createdAt: 1_790_000_000, contextLength: 400_000 }],
    });
  });

  it('reports an unconfigured gateway as unmeasured', async () => {
    expect(await probeByName(deps(), 'gateway')).toEqual({
      status: 'unmeasured',
      reason: 'no OpenAI-compatible gateway configured',
    });
  });

  it('lists the gateway catalog with created times', async () => {
    const probe = await probeByName(
      deps({
        readGateway: () => GATEWAY,
        discoverGateway: () =>
          Promise.resolve(ok([{ id: 'claude_5_opus', created: 1_790_000_000 }])),
      }),
      'gateway'
    );
    expect(probe).toEqual({
      status: 'measured',
      models: [{ id: 'claude_5_opus', createdAt: 1_790_000_000 }],
    });
  });

  it('throws on a failed gateway discovery so the report records it as failed', async () => {
    const source = buildDriftSources(
      deps({
        readGateway: () => GATEWAY,
        discoverGateway: () => Promise.resolve(err(new ConfigError('HTTP 401'))),
      })
    ).find((s) => s.name === 'gateway');
    await expect(source?.probe()).rejects.toThrow('HTTP 401');
  });

  it('passes OpenRouter listing metadata through', async () => {
    const probe = await probeByName(
      deps({
        openRouterCatalog: () =>
          Promise.resolve([
            { id: 'vendor/model-x', createdAt: 1, pricing: { inputPer1M: 2, outputPer1M: 8 } },
          ]),
      }),
      'openrouter'
    );
    expect(probe).toEqual({
      status: 'measured',
      models: [{ id: 'vendor/model-x', createdAt: 1, pricing: { inputPer1M: 2, outputPer1M: 8 } }],
    });
  });

  it('passes models.dev listing metadata through with context window and pricing', async () => {
    const mockCatalog = {
      anthropic: {
        models: {
          'claude-4-sonnet': {
            id: 'claude-4-sonnet',
            name: 'Claude 4 Sonnet',
            release_date: '2026-05-15',
            cost: { input: 3, output: 15 },
            limit: { context: 500_000, output: 64_000 },
          },
        },
      },
    };
    const probe = await probeByName(
      deps({
        modelsDevCatalog: () => Promise.resolve(mockCatalog),
      }),
      'models-dev'
    );
    expect(probe).toEqual({
      status: 'measured',
      models: [
        {
          id: 'claude-4-sonnet',
          createdAt: Math.floor(Date.parse('2026-05-15') / 1000),
          contextLength: 500_000,
          pricing: { inputPer1M: 3, outputPer1M: 15 },
        },
      ],
    });
  });

  it('throws on failed models.dev fetch so the report records it as failed', async () => {
    const source = buildDriftSources(
      deps({
        modelsDevCatalog: () => Promise.reject(new Error('Network error 503')),
      })
    ).find((s) => s.name === 'models-dev');
    await expect(source?.probe()).rejects.toThrow('Network error 503');
  });
});
