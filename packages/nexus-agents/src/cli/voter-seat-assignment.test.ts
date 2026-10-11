/**
 * Tests for panel seat assignment (voter-seat-assignment.ts).
 * (Source: Issue #7349, Issue #6962, Issue #845, Issue #4040)
 */

import { describe, it, expect, vi } from 'vitest';
import type { IModelAdapter, ILogger } from '../core/index.js';
import type { VoterRole } from './vote-types.js';
import {
  assignPanelSeats,
  assignUniformAdapter,
  createCliAdapterMap,
  assignRoundRobinAdapters,
  resolveGatewayRoleAdapters,
} from './voter-seat-assignment.js';

function createMockAdapter(modelId: string, providerId = 'mock'): IModelAdapter {
  return {
    modelId,
    providerId,
    complete: vi.fn(),
  } as unknown as IModelAdapter;
}

function createMockLogger(): ILogger & {
  debugs: unknown[];
  infos: unknown[];
  warns: unknown[];
  errors: unknown[];
} {
  const debugs: unknown[] = [];
  const infos: unknown[] = [];
  const warns: unknown[] = [];
  const errors: unknown[] = [];
  return {
    debug: vi.fn((...args: unknown[]) => debugs.push(args)),
    info: vi.fn((...args: unknown[]) => infos.push(args)),
    warn: vi.fn((...args: unknown[]) => warns.push(args)),
    error: vi.fn((...args: unknown[]) => errors.push(args)),
    debugs,
    infos,
    warns,
    errors,
  } as unknown as ILogger & {
    debugs: unknown[];
    infos: unknown[];
    warns: unknown[];
    errors: unknown[];
  };
}

describe('voter-seat-assignment', () => {
  const roles: readonly VoterRole[] = ['architect', 'security', 'scope_steward'];
  const fallbackAdapter = createMockAdapter('fallback-model', 'fallback-provider');

  describe('assignUniformAdapter', () => {
    it('assigns the same adapter to every role', () => {
      const result = assignUniformAdapter(roles, fallbackAdapter);
      expect(result.size).toBe(roles.length);
      for (const role of roles) {
        expect(result.get(role)).toBe(fallbackAdapter);
      }
    });

    it('handles empty roles gracefully', () => {
      const result = assignUniformAdapter([], fallbackAdapter);
      expect(result.size).toBe(0);
    });
  });

  describe('assignRoundRobinAdapters', () => {
    it('round-robins across entries and logs assignment', () => {
      const logger = createMockLogger();
      const a1 = createMockAdapter('model-1');
      const a2 = createMockAdapter('model-2');
      const entries = [
        { label: 'cli-1', adapter: a1 },
        { label: 'cli-2', adapter: a2 },
      ];
      const result = assignRoundRobinAdapters(roles, entries, logger, 'cli');
      expect(result.get('architect')).toBe(a1);
      expect(result.get('security')).toBe(a2);
      expect(result.get('scope_steward')).toBe(a1);
      expect(logger.info).toHaveBeenCalledWith(
        'Diverse adapters assigned',
        expect.objectContaining({
          source: 'cli',
          count: 2,
        })
      );
    });
  });

  describe('resolveGatewayRoleAdapters', () => {
    it('warns when collapsed to a single gateway model with multiple roles', () => {
      const logger = createMockLogger();
      const gateway = [createMockAdapter('single-gw')];
      const result = resolveGatewayRoleAdapters(roles, gateway, fallbackAdapter, logger);
      expect(result.size).toBe(roles.length);
      for (const role of roles) {
        expect(result.get(role)?.modelId).toBe('single-gw');
      }
      expect(logger.warn).toHaveBeenCalledWith(
        'Consensus panel collapsed to a single gateway model — votes may correlate',
        expect.objectContaining({ model: 'single-gw', roleCount: roles.length })
      );
    });
  });

  describe('assignPanelSeats', () => {
    it('returns uniform assignment when options.adapter is set', async () => {
      const logger = createMockLogger();
      const explicitAdapter = createMockAdapter('explicit-model');
      const result = await assignPanelSeats(
        fallbackAdapter,
        { roles, adapter: explicitAdapter },
        logger
      );
      expect(result.size).toBe(roles.length);
      for (const role of roles) {
        expect(result.get(role)).toBe(fallbackAdapter);
      }
    });

    it('returns roleAdapters verbatim when provided', async () => {
      const logger = createMockLogger();
      const customMap = new Map<VoterRole, IModelAdapter>([
        ['architect', createMockAdapter('arch-model')],
        ['security', createMockAdapter('sec-model')],
      ]);
      const result = await assignPanelSeats(
        fallbackAdapter,
        { roles, roleAdapters: customMap },
        logger
      );
      expect(result.get('architect')?.modelId).toBe('arch-model');
      expect(result.get('security')?.modelId).toBe('sec-model');
    });

    it('routes to resolveGatewayRoleAdapters when gatewayAdapters are provided', async () => {
      const logger = createMockLogger();
      const gateway = [createMockAdapter('gw-1')];
      const result = await assignPanelSeats(
        fallbackAdapter,
        { roles, gatewayAdapters: gateway },
        logger
      );
      expect(result.get('architect')?.modelId).toBe('gw-1');
      expect(result.get('security')?.modelId).toBe('gw-1');
    });
  });

  describe('createCliAdapterMap', () => {
    it('maps available CLIs to their registered adapters', () => {
      const map = createCliAdapterMap(['codex']);
      expect(map.size).toBe(1);
      expect(map.get('codex')).toBeDefined();
    });
  });
});
