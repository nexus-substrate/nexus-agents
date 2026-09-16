/**
 * Tests for the gateway cost declaration (#4392 increment 2, step 1).
 *
 * `NEXUS_GATEWAY_COST` is the operator's statement of what a gateway arm
 * costs. Undeclared is a real value (fail-closed for cost-weighted routing),
 * so the tests pin both the grammar and the "unset means undefined" contract.
 */

import { describe, it, expect, vi } from 'vitest';
import type { ILogger } from '../../core/index.js';
import {
  describeGatewayCostDeclaration,
  gatewayCostRates,
  isGatewayArmId,
  parseGatewayCostEnv,
  resolveGatewayCostDeclaration,
  warnIfGatewayCostUndeclared,
} from './gateway-cost.js';
import { GATEWAY_COST_ENV } from './types.js';

function mockLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as ILogger;
}

describe('GATEWAY_COST_ENV', () => {
  it('names the documented variable', () => {
    expect(GATEWAY_COST_ENV).toBe('NEXUS_GATEWAY_COST');
  });
});

describe('parseGatewayCostEnv — grammar', () => {
  it.each([
    ['free', { kind: 'free' }],
    ['local', { kind: 'local' }],
    ['priced', { kind: 'priced' }],
    ['priced:2,10', { kind: 'priced', inputPer1M: 2, outputPer1M: 10 }],
    ['priced:0.5,1.25', { kind: 'priced', inputPer1M: 0.5, outputPer1M: 1.25 }],
    ['  FREE  ', { kind: 'free' }],
  ])('accepts bare %j as the default declaration', (raw, expected) => {
    const parsed = parseGatewayCostEnv(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.default).toEqual(expected);
    expect(parsed.value.byEndpoint.size).toBe(0);
  });

  it.each([
    ['priced:1', /both/i],
    ['priced:a,b', /number/i],
    ['priced:-1,2', /negative|non-negative/i],
    ['', /empty/i],
    ['   ', /empty/i],
    ['cheap', /free|local|priced/i],
    ['priced:1,2,3', /both|two/i],
  ])('rejects %j with a reason', (raw, reason) => {
    const parsed = parseGatewayCostEnv(raw);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.message).toMatch(reason);
  });

  it('parses an endpoint-scoped map with an optional bare default', () => {
    const parsed = parseGatewayCostEnv('corp-proxy=free; local-vllm=local; priced:2,10');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.default).toEqual({ kind: 'priced', inputPer1M: 2, outputPer1M: 10 });
    expect(parsed.value.byEndpoint.get('corp-proxy')).toEqual({ kind: 'free' });
    expect(parsed.value.byEndpoint.get('local-vllm')).toEqual({ kind: 'local' });
  });

  it('rejects a second bare declaration', () => {
    const parsed = parseGatewayCostEnv('free;local');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.message).toMatch(/one bare|more than one/i);
  });

  it('rejects a duplicate endpoint', () => {
    const parsed = parseGatewayCostEnv('corp=free;corp=local');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.message).toMatch(/duplicate/i);
  });

  it('rejects an endpoint key that is not a valid endpoint identity (a URL, for one)', () => {
    const parsed = parseGatewayCostEnv('https://user:secret@gw=free');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.message).toMatch(/endpoint/i);
    // Never echo a credential-bearing key back in the error.
    expect(parsed.error.message).not.toContain('secret');
  });
});

describe('isGatewayArmId', () => {
  it.each(['api:custom-openai', 'api:corp-proxy', 'api:local-vllm'])('is true for %s', (arm) => {
    expect(isGatewayArmId(arm)).toBe(true);
  });

  it.each([
    'api:anthropic',
    'api:openai',
    'api:google',
    'claude',
    'gemini',
    'codex',
    'opencode',
    'api:https://gw',
    'https://gw',
    '',
  ])('is false for %j (vendor arm, CLI slot, or not an arm id)', (arm) => {
    expect(isGatewayArmId(arm)).toBe(false);
  });
});

describe('resolveGatewayCostDeclaration', () => {
  it('returns undefined (UNDECLARED) when the variable is unset', () => {
    expect(resolveGatewayCostDeclaration('api:custom-openai', {})).toBeUndefined();
  });

  it('returns undefined when the variable is set but unparsable', () => {
    expect(
      resolveGatewayCostDeclaration('api:custom-openai', { [GATEWAY_COST_ENV]: 'priced:1' })
    ).toBeUndefined();
  });

  it('applies a bare declaration to every gateway arm', () => {
    const env = { [GATEWAY_COST_ENV]: 'free' };
    expect(resolveGatewayCostDeclaration('api:custom-openai', env)).toEqual({ kind: 'free' });
    expect(resolveGatewayCostDeclaration('api:corp-proxy', env)).toEqual({ kind: 'free' });
  });

  it('prefers the endpoint-scoped entry over the bare default', () => {
    const env = { [GATEWAY_COST_ENV]: 'corp-proxy=priced:2,10;free' };
    expect(resolveGatewayCostDeclaration('api:corp-proxy', env)).toEqual({
      kind: 'priced',
      inputPer1M: 2,
      outputPer1M: 10,
    });
    expect(resolveGatewayCostDeclaration('api:custom-openai', env)).toEqual({ kind: 'free' });
  });

  it('is undefined for an arm with no scoped entry when there is no bare default', () => {
    const env = { [GATEWAY_COST_ENV]: 'corp-proxy=free' };
    expect(resolveGatewayCostDeclaration('api:custom-openai', env)).toBeUndefined();
  });

  it('is undefined for a vendor arm even when a bare declaration is set', () => {
    // A vendor arm is priced by the registry, never by a gateway declaration.
    expect(resolveGatewayCostDeclaration('api:anthropic', { [GATEWAY_COST_ENV]: 'free' })).toBe(
      undefined
    );
  });
});

describe('gatewayCostRates', () => {
  it('free and local are $0 for every token', () => {
    expect(gatewayCostRates({ kind: 'free' })).toEqual({ inputPer1M: 0, outputPer1M: 0 });
    expect(gatewayCostRates({ kind: 'local' })).toEqual({ inputPer1M: 0, outputPer1M: 0 });
  });

  it('priced with rates is that flat rate', () => {
    expect(gatewayCostRates({ kind: 'priced', inputPer1M: 2, outputPer1M: 10 })).toEqual({
      inputPer1M: 2,
      outputPer1M: 10,
    });
  });

  it('priced without rates defers to the registry', () => {
    expect(gatewayCostRates({ kind: 'priced' })).toBe('registry');
  });
});

describe('describeGatewayCostDeclaration', () => {
  it.each([
    [{ kind: 'free' } as const, 'free'],
    [{ kind: 'local' } as const, 'local'],
    [{ kind: 'priced' } as const, 'priced (registry rates)'],
    [{ kind: 'priced', inputPer1M: 2, outputPer1M: 10 } as const, 'priced ($2/$10 per 1M)'],
  ])('renders %j as %j', (decl, text) => {
    expect(describeGatewayCostDeclaration(decl)).toBe(text);
  });
});

describe('warnIfGatewayCostUndeclared', () => {
  it('warns once, naming the variable, when a gateway arm is undeclared', () => {
    const logger = mockLogger();
    warnIfGatewayCostUndeclared('api:corp-proxy', logger, {});
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [message, meta] = vi.mocked(logger.warn).mock.calls[0] ?? [];
    expect(String(message)).toContain(GATEWAY_COST_ENV);
    expect(meta).toMatchObject({ arm: 'api:corp-proxy' });
  });

  it('is silent when the gateway arm is declared', () => {
    const logger = mockLogger();
    warnIfGatewayCostUndeclared('api:corp-proxy', logger, { [GATEWAY_COST_ENV]: 'free' });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('is silent for a vendor arm', () => {
    const logger = mockLogger();
    warnIfGatewayCostUndeclared('api:anthropic', logger, {});
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
