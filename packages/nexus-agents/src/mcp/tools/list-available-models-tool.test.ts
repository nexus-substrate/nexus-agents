/**
 * Tests for the list_available_models validation tool handler (#3406).
 */
import { describe, it, expect } from 'vitest';

import { listAvailableModelsHandler } from './list-available-models-tool.js';
import { createLogger } from '../../core/index.js';
import type { AvailableModelsSource } from '../../config/available-models-cache.js';

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
  totalModels: number;
  transports: {
    transport: string;
    ok: boolean;
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
