/**
 * Tests for MCP resource registration and payload building (Issue #1349).
 *
 * Covers: research-resource, experts-resource, models-resource.
 * Verifies resource payload structure, graceful error handling, and JSON output.
 */

import { describe, it, expect, vi } from 'vitest';

// ============================================================================
// Mock dependencies
// ============================================================================

vi.mock('../../indexer/research-index/index.js', () => ({
  parseRegistry: vi.fn(() => ({
    ok: true,
    value: {
      schemaVersion: '1.0',
      generatedAt: '2026-03-01T00:00:00Z',
      papers: [
        {
          id: 'p1',
          title: 'Test Paper',
          topics: ['ai'],
          arxiv_id: '2401.00001',
          url: 'https://arxiv.org/abs/2401.00001',
          reviewed_date: '2026-01-01',
        },
      ],
      techniques: [
        {
          id: 't1',
          name: 'Test Technique',
          status: 'implemented',
          priority: 'P1',
          topic: 'ai',
        },
      ],
      stats: { totalPapers: 1, totalTechniques: 1 },
    },
  })),
}));

vi.mock('../tools/create-expert.js', () => ({
  getAvailableRoles: vi.fn(() => ['code_expert', 'security_expert', 'architecture_expert']),
  getCapabilitiesForRole: vi.fn((role: string) => {
    const caps: Record<string, string[]> = {
      code_expert: ['code generation', 'refactoring'],
      security_expert: ['vulnerability analysis', 'threat modeling'],
      architecture_expert: ['system design', 'pattern analysis'],
    };
    return caps[role] ?? [];
  }),
}));

vi.mock('../../agents/index.js', () => ({
  BUILT_IN_EXPERTS: {
    code: { name: 'Code Expert', id: 'code' },
    security: { name: 'Security Expert', id: 'security' },
    architecture: { name: 'Architecture Expert', id: 'architecture' },
  },
}));

// ============================================================================
// research-resource
// ============================================================================

describe('research-resource', () => {
  it('registerResearchResource registers with correct URI and name', async () => {
    const { registerResearchResource } = await import('./research-resource.js');
    const registerResource = vi.fn();
    const server = { registerResource } as never;
    const logger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as never;

    registerResearchResource(server, logger);

    expect(registerResource).toHaveBeenCalledOnce();
    expect(registerResource).toHaveBeenCalledWith(
      'research-papers',
      'nexus://research/papers',
      expect.objectContaining({
        mimeType: 'application/json',
      }),
      expect.any(Function)
    );
  });

  it('resource callback returns valid JSON with papers and techniques', async () => {
    const { registerResearchResource } = await import('./research-resource.js');
    const registerResource = vi.fn();
    const server = { registerResource } as never;
    const logger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as never;

    registerResearchResource(server, logger);

    const callback = registerResource.mock.calls[0]?.[3] as () => {
      contents: Array<{ uri: string; mimeType: string; text: string }>;
    };
    const result = callback();

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0]?.uri).toBe('nexus://research/papers');
    expect(result.contents[0]?.mimeType).toBe('application/json');

    const payload = JSON.parse(result.contents[0]?.text ?? '{}') as Record<string, unknown>;
    expect(payload).toHaveProperty('schemaVersion', '1.0');
    expect(payload).toHaveProperty('paperCount', 1);
    expect(payload).toHaveProperty('techniqueCount', 1);
    expect(Array.isArray(payload['papers'])).toBe(true);
    expect(Array.isArray(payload['techniques'])).toBe(true);
  });

  it('resource callback returns empty payload on registry error', async () => {
    const { parseRegistry } = await import('../../indexer/research-index/index.js');
    (parseRegistry as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      ok: false,
      error: new Error('Registry not found'),
    });

    const { registerResearchResource } = await import('./research-resource.js');
    const registerResource = vi.fn();
    const server = { registerResource } as never;
    const logger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as never;

    registerResearchResource(server, logger);

    const callback = registerResource.mock.calls[0]?.[3] as () => {
      contents: Array<{ text: string }>;
    };
    const result = callback();
    const payload = JSON.parse(result.contents[0]?.text ?? '{}') as Record<string, unknown>;
    expect(payload).toHaveProperty('papers');
    expect(Array.isArray(payload['papers'])).toBe(true);
    expect((payload['papers'] as unknown[]).length).toBe(0);
  });

  it('resource callback returns empty payload on exception', async () => {
    const { parseRegistry } = await import('../../indexer/research-index/index.js');
    (parseRegistry as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('Unexpected parse failure');
    });

    const { registerResearchResource } = await import('./research-resource.js');
    const registerResource = vi.fn();
    const server = { registerResource } as never;
    const logger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as never;

    registerResearchResource(server, logger);

    const callback = registerResource.mock.calls[0]?.[3] as () => {
      contents: Array<{ text: string }>;
    };
    const result = callback();
    const payload = JSON.parse(result.contents[0]?.text ?? '{}') as Record<string, unknown>;
    expect(payload).toHaveProperty('papers');
  });
});

// ============================================================================
// experts-resource
// ============================================================================

describe('experts-resource', () => {
  it('registerExpertsResource registers with correct URI', async () => {
    const { registerExpertsResource } = await import('./experts-resource.js');
    const registerResource = vi.fn();
    const server = { registerResource } as never;
    const logger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as never;

    registerExpertsResource(server, logger);

    expect(registerResource).toHaveBeenCalledOnce();
    expect(registerResource).toHaveBeenCalledWith(
      'experts',
      'nexus://experts',
      expect.objectContaining({ mimeType: 'application/json' }),
      expect.any(Function)
    );
  });

  it('resource callback returns expert list with capabilities', async () => {
    const { registerExpertsResource } = await import('./experts-resource.js');
    const registerResource = vi.fn();
    const server = { registerResource } as never;
    const logger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as never;

    registerExpertsResource(server, logger);

    const callback = registerResource.mock.calls[0]?.[3] as () => {
      contents: Array<{ uri: string; text: string }>;
    };
    const result = callback();

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0]?.uri).toBe('nexus://experts');

    const payload = JSON.parse(result.contents[0]?.text ?? '{}') as Record<string, unknown>;
    expect(payload).toHaveProperty('expertCount', 3);

    const experts = payload['experts'] as Array<{
      role: string;
      capabilities: string[];
    }>;
    expect(experts).toHaveLength(3);
    expect(experts[0]?.role).toBe('code_expert');
    expect(experts[0]?.capabilities).toContain('code generation');
  });

  it('expert entries include name and id from BUILT_IN_EXPERTS', async () => {
    const { registerExpertsResource } = await import('./experts-resource.js');
    const registerResource = vi.fn();
    const server = { registerResource } as never;
    const logger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as never;

    registerExpertsResource(server, logger);

    const callback = registerResource.mock.calls[0]?.[3] as () => {
      contents: Array<{ text: string }>;
    };
    const result = callback();
    const payload = JSON.parse(result.contents[0]?.text ?? '{}') as Record<string, unknown>;
    const experts = payload['experts'] as Array<{ name: string; id: string }>;
    expect(experts[0]?.name).toBe('Code Expert');
    expect(experts[0]?.id).toBe('code');
  });
});

// ============================================================================
// models-resource
// ============================================================================

describe('models-resource', () => {
  it('registerModelsResource registers with correct URI', async () => {
    const { registerModelsResource } = await import('./models-resource.js');
    const registerResource = vi.fn();
    const server = { registerResource } as never;
    const logger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as never;

    registerModelsResource(server, logger);

    expect(registerResource).toHaveBeenCalledOnce();
    expect(registerResource).toHaveBeenCalledWith(
      'models',
      'nexus://models',
      expect.objectContaining({ mimeType: 'application/json' }),
      expect.any(Function)
    );
  });

  it('resource callback returns model capabilities matrix', async () => {
    const { registerModelsResource } = await import('./models-resource.js');
    const registerResource = vi.fn();
    const server = { registerResource } as never;
    const logger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as never;

    registerModelsResource(server, logger);

    const callback = registerResource.mock.calls[0]?.[3] as () => {
      contents: Array<{ uri: string; text: string }>;
    };
    const result = callback();

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0]?.uri).toBe('nexus://models');

    const payload = JSON.parse(result.contents[0]?.text ?? '{}') as Record<string, unknown>;
    expect(payload).toHaveProperty('version');
    expect(payload).toHaveProperty('modelCount');
    expect(typeof payload['modelCount']).toBe('number');
    expect(payload['modelCount'] as number).toBeGreaterThan(0);

    const models = payload['models'] as Array<{
      id: string;
      provider: string;
      contextWindow: number;
    }>;
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]).toHaveProperty('id');
    expect(models[0]).toHaveProperty('provider');
    expect(models[0]).toHaveProperty('contextWindow');
    expect(models[0]).toHaveProperty('pricing');
  });

  it('model entries include CLI mapping fields', async () => {
    const { registerModelsResource } = await import('./models-resource.js');
    const registerResource = vi.fn();
    const server = { registerResource } as never;
    const logger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as never;

    registerModelsResource(server, logger);

    const callback = registerResource.mock.calls[0]?.[3] as () => {
      contents: Array<{ text: string }>;
    };
    const result = callback();
    const payload = JSON.parse(result.contents[0]?.text ?? '{}') as Record<string, unknown>;
    const models = payload['models'] as Array<{
      cliName: string;
      cliModelName: string;
    }>;
    expect(models[0]).toHaveProperty('cliName');
    expect(models[0]).toHaveProperty('cliModelName');
  });
});
