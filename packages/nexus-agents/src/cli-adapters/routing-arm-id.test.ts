/**
 * Endpoint-identity routing arm ids (#4392 increment 1, B shape per the
 * #6290 follow-up panel).
 *
 * The published ids do NOT widen in this increment: `ApiArmId` stays the
 * closed `api:${ApiVendor}` template (four literals), `RoutingArmId` stays
 * `CliName | ApiArmId`, and `OutcomeCli` is byte-identical to before. What is
 * added is a SEPARATE `EndpointArmId = api:${string}` with a charset
 * validator, and an `ObservedArmId = RoutingArmId | EndpointArmId` union that
 * only the breaker / adapter-registry arm-typed siblings accept, so a dynamic
 * endpoint can be registered and observed without entering outcome records.
 * The union into `RoutingArmId` / `OutcomeCli` is the 9.0 item (#6291).
 *
 * These tests pin four things:
 *
 * - the four-literal contract on `ApiArmId` and the eight-literal contract on
 *   `RoutingArmId`, at compile time, via exhaustive switches with an
 *   `assertNever` default — widening either union fails `tsc`, not a review;
 * - `EndpointArmId` is NOT assignable to `RoutingArmId` or `OutcomeCli`, and
 *   the persisted-record schema still refuses an endpoint id;
 * - the endpoint validator refuses anything that could smuggle a credential (a
 *   URL with userinfo, a colon, whitespace) or collide with a CLI slot;
 * - `observedArmDisplaySlot` has an EXPLICIT fallback for an endpoint it does
 *   not know, while `routingArmDisplaySlot` is unchanged.
 *
 * @module cli-adapters/routing-arm-id.test
 */

import { describe, it, expect } from 'vitest';
import {
  ApiArmIdSchema,
  apiArmId,
  isEndpointArmId,
  isCliName,
  observedArmDisplaySlot,
  routingArmDisplaySlot,
  type ApiArmId,
  type ApiVendor,
  type CliName,
  type EndpointArmId,
  type ObservedArmId,
  type RoutingArmId,
} from './types-core.js';
import { CLI_NAMES } from '../config/model-capabilities-types.js';
import { TaskOutcomeSchema, type OutcomeCli } from '../orchestration/outcomes/outcome-types.js';

/** The four ids the factory mints, spelled as literals on purpose. */
const BUILT_IN_API_ARM_IDS = [
  'api:anthropic',
  'api:openai',
  'api:google',
  'api:custom-openai',
] as const;

const VENDORS: readonly ApiVendor[] = ['anthropic', 'openai', 'google', 'custom-openai'];

function assertNever(value: never): never {
  throw new Error(`Unexpected arm id: ${String(value)}`);
}

/**
 * Exhaustive over {@link ApiArmId}. If the union gains or loses a literal the
 * `default` arm stops being `never` and `tsc` fails here — this is the pin the
 * #6290 panel asked for, held until #6291 removes it deliberately.
 */
function apiArmSlotByExhaustiveSwitch(arm: ApiArmId): CliName {
  switch (arm) {
    case 'api:anthropic':
      return 'claude';
    case 'api:openai':
      return 'codex';
    case 'api:google':
      return 'gemini';
    case 'api:custom-openai':
      return 'opencode';
    default:
      return assertNever(arm);
  }
}

/** Exhaustive over {@link RoutingArmId}: the four CLI slots plus the four API literals. */
function routingArmKindByExhaustiveSwitch(arm: RoutingArmId): 'cli' | 'api' {
  switch (arm) {
    case 'claude':
    case 'gemini':
    case 'codex':
    case 'opencode':
      return 'cli';
    case 'api:anthropic':
    case 'api:openai':
    case 'api:google':
    case 'api:custom-openai':
      return 'api';
    default:
      return assertNever(arm);
  }
}

describe('ApiArmId stays the closed four-literal template (#6290 panel pin)', () => {
  it('the exhaustive switch covers every literal apiArmId() can mint (compile-time + runtime)', () => {
    for (const [i, vendor] of VENDORS.entries()) {
      const arm = apiArmId(vendor);
      expect(arm).toBe(BUILT_IN_API_ARM_IDS[i]);
      expect(apiArmSlotByExhaustiveSwitch(arm)).toBe(routingArmDisplaySlot(arm));
    }
  });

  it('RoutingArmId is exactly the four CLI slots plus the four api literals', () => {
    for (const cli of CLI_NAMES) expect(routingArmKindByExhaustiveSwitch(cli)).toBe('cli');
    for (const arm of BUILT_IN_API_ARM_IDS)
      expect(routingArmKindByExhaustiveSwitch(arm)).toBe('api');
  });

  it('a value outside the union is unreachable at runtime, not silently mapped', () => {
    // The cast is the only way to get here; the test proves the default arm
    // throws rather than returning a slot for an id the type does not admit.
    expect(() => apiArmSlotByExhaustiveSwitch('api:gw-prod' as ApiArmId)).toThrow(
      /Unexpected arm id: api:gw-prod/
    );
  });

  it('an EndpointArmId is NOT a RoutingArmId, an ApiArmId or an OutcomeCli (compile-time)', () => {
    const endpoint: EndpointArmId = 'api:gw-prod';
    // @ts-expect-error — EndpointArmId is deliberately not unioned into RoutingArmId (#6291).
    const routing: RoutingArmId = endpoint;
    // @ts-expect-error — ApiArmId is still the closed four-literal template.
    const api: ApiArmId = endpoint;
    // @ts-expect-error — OutcomeCli is byte-identical; endpoint ids do not enter outcome records.
    const outcome: OutcomeCli = endpoint;
    // The other direction holds: every published arm id is observable.
    const observedCli: ObservedArmId = 'claude';
    const observedApi: ObservedArmId = 'api:anthropic';
    const observedEndpoint: ObservedArmId = endpoint;

    expect([routing, api, outcome, observedCli, observedApi, observedEndpoint]).toHaveLength(6);
  });
});

describe('ApiArmIdSchema is unchanged: the four literals and nothing else', () => {
  it('accepts every built-in literal, byte-identical to apiArmId()', () => {
    for (const id of BUILT_IN_API_ARM_IDS) {
      expect(ApiArmIdSchema.safeParse(id).success).toBe(true);
    }
  });

  it('rejects an endpoint-identity id that isEndpointArmId accepts', () => {
    expect(isEndpointArmId('api:gw-prod')).toBe(true);
    expect(ApiArmIdSchema.safeParse('api:gw-prod').success).toBe(false);
  });
});

describe('isEndpointArmId (#4392 charset validator)', () => {
  it('accepts every built-in api arm id (the four literals satisfy the charset)', () => {
    for (const id of BUILT_IN_API_ARM_IDS) expect(isEndpointArmId(id)).toBe(true);
  });

  it('accepts an operator-named endpoint identity', () => {
    for (const id of ['api:gw-prod', 'api:vllm.lab_1', 'api:0', 'api:a.b-c_d']) {
      expect(isEndpointArmId(id)).toBe(true);
    }
  });

  it('accepts a 64-char endpoint segment (the cap is inclusive)', () => {
    expect(isEndpointArmId(`api:${'a'.repeat(64)}`)).toBe(true);
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
    ['the empty string', ''],
  ])('rejects %s', (_label, value) => {
    expect(isEndpointArmId(value)).toBe(false);
  });

  it('narrows to EndpointArmId', () => {
    const value: string = 'api:gw-prod';
    if (isEndpointArmId(value)) {
      const arm: EndpointArmId = value;
      expect(arm).toBe('api:gw-prod');
    } else {
      expect.unreachable('a valid endpoint id must narrow');
    }
  });
});

describe('persisted outcome records keyed on an arm id (OutcomeCli byte-identical)', () => {
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

  it('parses every record written under a built-in api arm id', () => {
    for (const id of BUILT_IN_API_ARM_IDS) {
      const parsed = TaskOutcomeSchema.safeParse(record(id));
      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data.cli).toBe(id);
    }
  });

  it('parses the four CLI slots and unknown', () => {
    for (const cli of [...CLI_NAMES, 'unknown']) {
      expect(TaskOutcomeSchema.safeParse(record(cli)).success).toBe(true);
    }
  });

  it('REJECTS a record keyed on an endpoint-identity id until #6291 widens OutcomeCli', () => {
    expect(TaskOutcomeSchema.safeParse(record('api:gw-prod')).success).toBe(false);
    expect(TaskOutcomeSchema.safeParse(record('api:')).success).toBe(false);
    expect(TaskOutcomeSchema.safeParse(record('not-an-arm')).success).toBe(false);
  });
});

describe('isCliName (#6290 filtered views)', () => {
  it('is true for exactly the four CLI slots', () => {
    for (const cli of CLI_NAMES) expect(isCliName(cli)).toBe(true);
  });

  it('is false for api arms, endpoint arms, the unknown marker and garbage', () => {
    for (const value of ['api:anthropic', 'api:gw-prod', 'unknown', '', 'Claude']) {
      expect(isCliName(value)).toBe(false);
    }
  });
});

describe('routingArmDisplaySlot is unchanged', () => {
  it('is identity for every CLI slot', () => {
    for (const cli of CLI_NAMES) expect(routingArmDisplaySlot(cli)).toBe(cli);
  });

  it.each([
    ['api:anthropic', 'claude'],
    ['api:openai', 'codex'],
    ['api:google', 'gemini'],
    ['api:custom-openai', 'opencode'],
  ] as const)('maps the built-in vendor arm %s to %s', (arm, slot) => {
    expect(routingArmDisplaySlot(arm)).toBe(slot);
  });
});

describe('observedArmDisplaySlot (#4392 fallback for endpoint arms)', () => {
  it('agrees with routingArmDisplaySlot on every published arm id', () => {
    for (const cli of CLI_NAMES) expect(observedArmDisplaySlot(cli)).toBe(cli);
    for (const arm of BUILT_IN_API_ARM_IDS) {
      expect(observedArmDisplaySlot(arm)).toBe(routingArmDisplaySlot(arm));
    }
  });

  it('collapses an endpoint-identity arm it does not know to the opencode slot', () => {
    // `opencode` is the slot whose capability profile describes an
    // OpenAI-compatible endpoint of unknown family, and the slot the only
    // pre-existing gateway arm (`api:custom-openai`) already collapses to.
    // Pinned as a literal so a drifted constant fails here, not in a router.
    const unknown: ObservedArmId = 'api:gw-prod';

    expect(observedArmDisplaySlot(unknown)).toBe('opencode');
  });

  it('never returns the raw endpoint id as if it were a CLI slot', () => {
    const slot: string = observedArmDisplaySlot('api:vllm.lab_1');

    expect((CLI_NAMES as readonly string[]).includes(slot)).toBe(true);
  });
});
