/**
 * Tests for gateway configuration schema.
 * @module config/schemas-gateway.test
 * (Source: Issue #897, Epic #888)
 */

import { describe, it, expect } from 'vitest';
import { GatewayConfigSchema } from './schemas-gateway.js';

describe('GatewayConfigSchema', () => {
  it('accepts minimal empty config with defaults', () => {
    const result = GatewayConfigSchema.parse({});
    expect(result.enabled).toBe(true);
    expect(result.tierOverrides).toBeUndefined();
  });

  it('accepts enabled: false', () => {
    const result = GatewayConfigSchema.parse({ enabled: false });
    expect(result.enabled).toBe(false);
  });

  it('accepts valid tier overrides', () => {
    const input = {
      tierOverrides: {
        delegate_to_model: 'DIRECT',
        consensus_vote: 'ORCHESTRATED',
        list_experts: 'ANALYZED',
      },
    };
    const result = GatewayConfigSchema.parse(input);
    expect(result.tierOverrides).toEqual(input.tierOverrides);
  });

  it('rejects invalid tier names', () => {
    const input = {
      tierOverrides: { some_tool: 'INVALID_TIER' },
    };
    expect(() => GatewayConfigSchema.parse(input)).toThrow();
  });

  it('accepts empty tierOverrides object', () => {
    const result = GatewayConfigSchema.parse({ tierOverrides: {} });
    expect(result.tierOverrides).toEqual({});
  });

  it('rejects non-boolean enabled', () => {
    expect(() => GatewayConfigSchema.parse({ enabled: 'yes' })).toThrow();
  });

  it('rejects non-string tier override keys', () => {
    // Zod record keys are always strings, this tests invalid values
    const input = {
      tierOverrides: { tool: 123 },
    };
    expect(() => GatewayConfigSchema.parse(input)).toThrow();
  });
});
