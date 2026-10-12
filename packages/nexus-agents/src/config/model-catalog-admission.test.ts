/**
 * Tests for model catalog admission and provider × model gateway tracking (#7072).
 *
 * Increment C of Epic #4391.
 */
import { describe, it, expect } from 'vitest';
import {
  validateCatalogFetchUrl,
  validateCatalogPayloadSize,
  parseModelsDevCatalog,
  filterAdmittedModels,
  whichGatewaysServe,
  MAX_CATALOG_PAYLOAD_BYTES,
  type ModelsDevCatalog,
  type ServesResult,
} from './model-catalog-admission.js';
import type { ModelsDevSnapshot } from './models-dev-snapshot-loader.js';

describe('validateCatalogFetchUrl (SSRF protection)', () => {
  it('accepts valid HTTPS models.dev endpoint', () => {
    const result = validateCatalogFetchUrl('https://models.dev/api.json');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url.hostname).toBe('models.dev');
    }
  });

  it('rejects non-HTTPS URLs', () => {
    const httpResult = validateCatalogFetchUrl('http://models.dev/api.json');
    expect(httpResult.ok).toBe(false);

    const ftpResult = validateCatalogFetchUrl('ftp://models.dev/api.json');
    expect(ftpResult.ok).toBe(false);
  });

  it('rejects URLs with embedded credentials', () => {
    const result = validateCatalogFetchUrl('https://user:pass@models.dev/api.json');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/credentials/i);
    }
  });

  it('rejects private IPv4 addresses', () => {
    const ips = [
      'https://127.0.0.1/api.json',
      'https://10.0.0.1/api.json',
      'https://172.16.0.1/api.json',
      'https://172.31.255.255/api.json',
      'https://192.168.1.1/api.json',
      'https://169.254.169.254/api.json',
      'https://0.0.0.0/api.json',
    ];
    for (const ip of ips) {
      const result = validateCatalogFetchUrl(ip);
      expect(result.ok).toBe(false);
    }
  });

  it('rejects private and loopback IPv6 addresses', () => {
    const ips = [
      'https://[::1]/api.json',
      'https://[fc00::1]/api.json',
      'https://[fe80::1]/api.json',
    ];
    for (const ip of ips) {
      const result = validateCatalogFetchUrl(ip);
      expect(result.ok).toBe(false);
    }
  });

  it('rejects unallowed hostnames', () => {
    const result = validateCatalogFetchUrl('https://attacker.com/api.json');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/hostname/i);
    }
  });

  it('allows custom hostnames when explicitly provided', () => {
    const result = validateCatalogFetchUrl('https://custom-gateway.internal/api.json', [
      'custom-gateway.internal',
    ]);
    expect(result.ok).toBe(true);
  });
});

describe('validateCatalogPayloadSize', () => {
  it('accepts payloads within the maximum byte limit', () => {
    expect(validateCatalogPayloadSize(1024).ok).toBe(true);
    expect(validateCatalogPayloadSize(MAX_CATALOG_PAYLOAD_BYTES).ok).toBe(true);
  });

  it('rejects payloads exceeding the byte limit', () => {
    const result = validateCatalogPayloadSize(MAX_CATALOG_PAYLOAD_BYTES + 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/oversized/i);
    }
  });

  it('respects a custom byte limit', () => {
    const result = validateCatalogPayloadSize(2000, 1000);
    expect(result.ok).toBe(false);
  });
});

describe('parseModelsDevCatalog (Strict schema validation)', () => {
  it('accepts a well-formed catalog', () => {
    const sample = {
      anthropic: {
        id: 'anthropic',
        name: 'Anthropic',
        models: {
          'claude-3-5-sonnet-20241022': {
            id: 'claude-3-5-sonnet-20241022',
            name: 'Claude 3.5 Sonnet',
            family: 'claude-sonnet',
            tool_call: true,
            cost: { input: 3, output: 15 },
            limit: { context: 200000, output: 8192 },
          },
        },
      },
    };
    const result = parseModelsDevCatalog(sample);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.anthropic?.models?.['claude-3-5-sonnet-20241022']?.name).toBe(
        'Claude 3.5 Sonnet'
      );
    }
  });

  it('rejects non-object catalog inputs', () => {
    expect(parseModelsDevCatalog(null).ok).toBe(false);
    expect(parseModelsDevCatalog('invalid string').ok).toBe(false);
    expect(parseModelsDevCatalog([1, 2, 3]).ok).toBe(false);
  });

  it('rejects malformed provider entries', () => {
    const malformed = {
      anthropic: 'not an object',
    };
    const result = parseModelsDevCatalog(malformed);
    expect(result.ok).toBe(false);
  });

  it('rejects malformed model entries', () => {
    const malformed = {
      anthropic: {
        models: {
          'bad-model': {
            id: 12345, // id must be string
          },
        },
      },
    };
    const result = parseModelsDevCatalog(malformed);
    expect(result.ok).toBe(false);
  });
});

describe('filterAdmittedModels (Admission policy & Provider × Model)', () => {
  const fixtureCatalog: ModelsDevCatalog = {
    anthropic: {
      id: 'anthropic',
      name: 'Anthropic',
      models: {
        'claude-opus': {
          id: 'claude-opus',
          name: 'Claude Opus',
          family: 'claude-opus',
          cost: { input: 15, output: 75 },
        },
        'claude-unadmitted-experimental': {
          id: 'claude-unadmitted-experimental',
          name: 'Experimental Unconfigured',
          family: 'claude-experimental',
        },
      },
    },
    openrouter: {
      id: 'openrouter',
      name: 'OpenRouter',
      models: {
        'anthropic/claude-opus': {
          id: 'anthropic/claude-opus',
          name: 'Claude Opus (via OpenRouter)',
          family: 'claude-opus',
          cost: { input: 15, output: 75 },
        },
        'obscure/random-model-999': {
          id: 'obscure/random-model-999',
          name: 'Random Model 999',
          family: 'unknown',
        },
      },
    },
  };

  it('admits explicitly pinned models and records all providers serving them', () => {
    const { admittedEntries, gatewaysByModel } = filterAdmittedModels(fixtureCatalog, {
      explicitPins: new Set(['claude-opus']),
      configuredGateways: [],
    });

    // Pinned model is admitted; unpinned models are excluded
    const admittedIds = admittedEntries.map((e) => e.id);
    expect(admittedIds).toContain('claude-opus');
    expect(admittedIds).not.toContain('claude-unadmitted-experimental');
    expect(admittedIds).not.toContain('obscure/random-model-999');

    // Records provider x model coverage: both anthropic and openrouter serve claude-opus
    const opusGateways = gatewaysByModel['claude-opus'];
    expect(opusGateways).toBeDefined();
    expect(opusGateways).toContain('anthropic');
    expect(opusGateways).toContain('openrouter');
  });

  it('admits models covered by configured gateway serves() predicates', () => {
    const mockServes = (modelId: string): ServesResult => {
      return modelId.includes('claude-unadmitted-experimental') ? 'yes' : 'unknown';
    };

    const { admittedEntries } = filterAdmittedModels(fixtureCatalog, {
      explicitPins: new Set(),
      servesPredicates: [mockServes],
      configuredGateways: ['claude'],
    });

    const admittedIds = admittedEntries.map((e) => e.id);
    expect(admittedIds).toContain('claude-unadmitted-experimental');
    expect(admittedIds).not.toContain('obscure/random-model-999');
  });

  it('never admits all ~6,250 models without pins or gateway coverage', () => {
    const { admittedEntries } = filterAdmittedModels(fixtureCatalog, {
      explicitPins: new Set(),
      configuredGateways: [],
      includeInTreePins: false,
    });
    expect(admittedEntries).toHaveLength(0);
  });
});

describe('whichGatewaysServe', () => {
  const sampleSnapshot: ModelsDevSnapshot = {
    version: 1,
    fetchedAt: '2026-10-11',
    sourceUrl: 'https://models.dev/api.json',
    entries: [
      {
        id: 'claude-sonnet',
        vendor: 'anthropic',
        family: 'claude-sonnet',
        parallelToolCalls: false,
        promptCaching: 'none',
        toolDefinitionFormat: 'anthropic',
        maxRecommendedTurnBudget: 10,
        strictJson: true,
        quirks: [],
        profileId: 'models-dev-anthropic',
        source: 'models-dev',
        gateways: ['anthropic', 'openrouter', 'bedrock'],
      },
    ],
    gatewaysByModel: {
      'claude-sonnet': ['anthropic', 'openrouter', 'bedrock'],
    },
  };

  it('returns all gateways serving a model when no configured filter is given', () => {
    const gateways = whichGatewaysServe('claude-sonnet', { snapshot: sampleSnapshot });
    expect(gateways).toEqual(['anthropic', 'openrouter', 'bedrock']);
  });

  it('filters to only configured gateways', () => {
    const configured = whichGatewaysServe('claude-sonnet', {
      snapshot: sampleSnapshot,
      configuredGateways: ['claude', 'codex'], // 'claude' maps to 'anthropic'
    });
    expect(configured).toEqual(['claude']);
  });

  it('returns empty array for unknown models', () => {
    const gateways = whichGatewaysServe('nonexistent-model', { snapshot: sampleSnapshot });
    expect(gateways).toEqual([]);
  });
});
