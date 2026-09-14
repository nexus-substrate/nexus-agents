/**
 * Endpoint-identity routing arm ids (#4392 increment 1).
 *
 * `ApiArmId` was a closed template over a four-literal `ApiVendor` union, so
 * two custom gateways were indistinguishable (both `api:custom-openai`) and
 * the type could not grow without a compile error. It is now `api:<endpoint>`
 * over a validated endpoint identity. These tests pin three things:
 *
 * - every id string the tree minted before the widening is byte-identical
 *   and still valid, so persisted records keyed on it keep parsing;
 * - the validator refuses anything that could smuggle a credential (a URL
 *   with userinfo, a colon, whitespace) or collide with a CLI slot;
 * - `routingArmDisplaySlot` has an EXPLICIT fallback for an endpoint it does
 *   not know, rather than a compile error or a type lie.
 *
 * @module cli-adapters/routing-arm-id.test
 */

import { describe, it, expect } from 'vitest';
import {
  ApiArmIdSchema,
  apiArmId,
  isApiArmId,
  routingArmDisplaySlot,
  isCliName,
  type ApiArmId,
  type ApiVendor,
  type BuiltInApiVendor,
  type RoutingArmId,
} from './types-core.js';
import { CLI_NAMES } from '../config/model-capabilities-types.js';
import { TaskOutcomeSchema, type OutcomeCli } from '../orchestration/outcomes/outcome-types.js';

/** The four ids the factory minted before #4392, spelled as literals on purpose. */
const PRE_WIDENING_API_ARM_IDS = [
  'api:anthropic',
  'api:openai',
  'api:google',
  'api:custom-openai',
] as const;

const VENDORS: readonly BuiltInApiVendor[] = ['anthropic', 'openai', 'google', 'custom-openai'];

describe('ApiArmIdSchema (#4392)', () => {
  it('accepts every pre-widening literal, byte-identical to apiArmId()', () => {
    for (const [i, vendor] of VENDORS.entries()) {
      expect(apiArmId(vendor)).toBe(PRE_WIDENING_API_ARM_IDS[i]);
      expect(ApiArmIdSchema.safeParse(PRE_WIDENING_API_ARM_IDS[i]).success).toBe(true);
    }
  });

  it('accepts an operator-named endpoint identity', () => {
    for (const id of ['api:gw-prod', 'api:vllm.lab_1', 'api:0', 'api:a.b-c_d']) {
      expect(ApiArmIdSchema.safeParse(id).success).toBe(true);
    }
  });

  it('returns the input string unchanged on parse (no normalisation)', () => {
    expect(ApiArmIdSchema.parse('api:gw-prod')).toBe('api:gw-prod');
  });

  it.each([
    ['empty endpoint segment', 'api:'],
    ['uppercase', 'api:GwProd'],
    ['a URL with userinfo credentials', 'api:https://user:secret@gateway.example.com'],
    ['a bare colon', 'api:a:b'],
    ['an at-sign', 'api:user@host'],
    ['a slash', 'api:host/v1'],
    ['whitespace', 'api:gw prod'],
    ['a leading punctuation char', 'api:-gw'],
    ['65 chars', `api:${'a'.repeat(65)}`],
    ['no api: prefix', 'gw-prod'],
    ['a CLI slot name', 'claude'],
    ['the prefix doubled', 'api:api:x'],
  ])('rejects %s', (_label, value) => {
    expect(ApiArmIdSchema.safeParse(value).success).toBe(false);
  });

  it('accepts a 64-char endpoint segment (the cap is inclusive)', () => {
    expect(ApiArmIdSchema.safeParse(`api:${'a'.repeat(64)}`).success).toBe(true);
  });
});

describe('isApiArmId (#4392)', () => {
  it('agrees with the schema on both sides', () => {
    for (const id of PRE_WIDENING_API_ARM_IDS) expect(isApiArmId(id)).toBe(true);
    expect(isApiArmId('api:gw-prod')).toBe(true);
    for (const bad of ['api:', 'claude', 'api:https://u:p@h', 'api:A']) {
      expect(isApiArmId(bad)).toBe(false);
    }
  });

  it('narrows to ApiArmId', () => {
    const value: string = 'api:gw-prod';
    if (isApiArmId(value)) {
      const arm: ApiArmId = value;
      expect(arm).toBe('api:gw-prod');
    } else {
      expect.unreachable('a valid endpoint id must narrow');
    }
  });
});

describe('persisted outcome records keyed on an arm id (#4392 migration)', () => {
  function record(cli: string): unknown {
    return {
      id: `o-${cli}`,
      cli,
      category: 'code_generation',
      model: 'claude-sonnet-4-6',
      success: true,
      durationMs: 100,
      timestamp: '2026-08-10T00:00:00.000Z',
      source: 'delegate',
    };
  }

  it('still parses every record written under a pre-widening api arm id', () => {
    for (const id of PRE_WIDENING_API_ARM_IDS) {
      const parsed = TaskOutcomeSchema.safeParse(record(id));
      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data.cli).toBe(id);
    }
  });

  it('round-trips a record written under an endpoint-identity arm id', () => {
    const written = JSON.parse(JSON.stringify(record('api:gw-prod'))) as unknown;

    const parsed = TaskOutcomeSchema.safeParse(written);

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.cli).toBe('api:gw-prod');
  });

  it('still parses the four CLI slots and unknown', () => {
    for (const cli of [...CLI_NAMES, 'unknown']) {
      expect(TaskOutcomeSchema.safeParse(record(cli)).success).toBe(true);
    }
  });

  it('rejects a record whose api arm id fails the endpoint validator', () => {
    // The union widened to endpoint identity; it did not become `string`.
    expect(TaskOutcomeSchema.safeParse(record('api:https://u:p@h')).success).toBe(false);
    expect(TaskOutcomeSchema.safeParse(record('api:')).success).toBe(false);
    expect(TaskOutcomeSchema.safeParse(record('not-an-arm')).success).toBe(false);
  });

  it('keeps the inferred OutcomeCli type at api:${string}, not string (compile-time)', () => {
    const endpoint: OutcomeCli = 'api:gw-prod';
    const slot: OutcomeCli = 'claude';
    // @ts-expect-error — a bare string is not an OutcomeCli; the schema's
    // template literal is what keeps the persisted type from collapsing.
    const bare: OutcomeCli = 'gw-prod';
    const parsed: ApiArmId = ApiArmIdSchema.parse('api:gw-prod');

    expect([endpoint, slot, bare, parsed]).toHaveLength(4);
  });
});

// #6290 panel (additive shape): `ApiVendor` stays exported as a deprecated
// alias of `BuiltInApiVendor`, so every pre-#4392 binding still compiles and
// still narrows the `api:${string}` template. Removal is #6291.
describe('ApiVendor deprecated alias (#6290 additive shape)', () => {
  it('is assignable both ways with BuiltInApiVendor and narrows ApiArmId (compile-time)', () => {
    /* eslint-disable @typescript-eslint/no-deprecated -- the alias under test is the deprecated one */
    const legacy: ApiVendor = 'anthropic';
    const current: BuiltInApiVendor = legacy;
    const back: ApiVendor = current;
    const narrowed: ApiArmId = `api:${legacy}`;
    // @ts-expect-error — the alias is still the closed four-literal union.
    const notAVendor: ApiVendor = 'gw-prod';
    /* eslint-enable @typescript-eslint/no-deprecated */

    expect(apiArmId(legacy)).toBe('api:anthropic');
    expect([current, back, narrowed, notAVendor]).toHaveLength(4);
  });
});

describe('isCliName (#6290 filtered views)', () => {
  it('is true for exactly the four CLI slots', () => {
    for (const cli of CLI_NAMES) expect(isCliName(cli)).toBe(true);
  });

  it('is false for api arms, the unknown marker and garbage', () => {
    for (const value of ['api:anthropic', 'api:gw-prod', 'unknown', '', 'Claude']) {
      expect(isCliName(value)).toBe(false);
    }
  });
});

describe('routingArmDisplaySlot (#4392 fallback)', () => {
  it('is identity for every CLI slot', () => {
    for (const cli of CLI_NAMES) expect(routingArmDisplaySlot(cli)).toBe(cli);
  });

  it.each([
    ['api:anthropic', 'claude'],
    ['api:openai', 'codex'],
    ['api:google', 'gemini'],
    ['api:custom-openai', 'opencode'],
  ] as const)('maps the built-in vendor arm %s to %s, unchanged', (arm, slot) => {
    expect(routingArmDisplaySlot(arm)).toBe(slot);
  });

  it('collapses an endpoint-identity arm it does not know to the opencode slot', () => {
    // `opencode` is the slot whose capability profile describes an
    // OpenAI-compatible endpoint of unknown family, and the slot the only
    // pre-existing gateway arm (`api:custom-openai`) already collapses to.
    // Pinned as a literal so a drifted constant fails here, not in a router.
    const unknown: RoutingArmId = 'api:gw-prod';

    expect(routingArmDisplaySlot(unknown)).toBe('opencode');
  });

  it('never returns the raw api id as if it were a CLI slot', () => {
    const slot: string = routingArmDisplaySlot('api:vllm.lab_1');

    expect((CLI_NAMES as readonly string[]).includes(slot)).toBe(true);
  });
});
