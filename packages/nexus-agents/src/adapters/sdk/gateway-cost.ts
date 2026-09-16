/**
 * Gateway cost declaration (#4392 increment 2, step 1).
 *
 * A gateway arm (`api:custom-openai`, or any operator-named endpoint arm)
 * fronts models nexus-agents cannot price from its own registry: the same
 * endpoint may be a free tier, a local vLLM, or a metered corporate proxy.
 * Before this module an undeclared gateway was silently priced as opencode's
 * default model inside the task-class cost ceiling — a number that measured
 * nothing. `NEXUS_GATEWAY_COST` is the operator's statement, and its absence
 * is a real value: UNDECLARED, which both cost filters fail closed on — the
 * task-class cost ceiling (`filterByTaskClassCeiling`) and the per-task
 * budget (`checkBudget`, #6393).
 *
 * Grammar (whitespace-tolerant, kind case-insensitive):
 *
 *   decl     := free | local | priced | priced:<inputPer1M>,<outputPer1M>
 *   entry    := decl | <endpoint>=decl
 *   env      := entry (';' entry)*
 *
 * At most one bare `decl` (it applies to every gateway arm without a scoped
 * entry); `<endpoint>` is the identity segment of an endpoint arm id
 * (`corp-proxy` for `api:corp-proxy`), validated by the same rule, so a URL
 * — or a credential inside one — can never become a key.
 *
 * @module adapters/sdk/gateway-cost
 */

import { z } from 'zod';
import { ConfigError, err, ok, type ILogger, type Result } from '../../core/index.js';
import {
  ApiArmIdSchema,
  isEndpointArmId,
  type EndpointArmId,
} from '../../cli-adapters/types-core.js';
import type { TokenRates } from '../../learning/token-cost-core.js';
import { GATEWAY_COST_ENV } from './types.js';

const PricedSchema = z
  .object({
    kind: z.literal('priced'),
    inputPer1M: z.number().nonnegative().optional(),
    outputPer1M: z.number().nonnegative().optional(),
  })
  .refine((v) => (v.inputPer1M === undefined) === (v.outputPer1M === undefined), {
    message: 'priced rates need both inputPer1M and outputPer1M, or neither',
  });

/**
 * One gateway's declared cost. `free` and `local` are $0 for every token;
 * `priced` without rates defers to registry pricing; `priced` with rates is
 * a flat per-1M rate for the whole endpoint (both rates or neither — the
 * `PricedSchema` refinement is the single place that rule is enforced).
 */
export type GatewayCostDeclaration =
  { readonly kind: 'free' } | { readonly kind: 'local' } | z.infer<typeof PricedSchema>;

/** The parsed variable: an optional bare default plus endpoint-scoped entries. */
export interface GatewayCostMap {
  readonly default?: GatewayCostDeclaration;
  readonly byEndpoint: ReadonlyMap<string, GatewayCostDeclaration>;
}

const GRAMMAR_HINT = 'free | local | priced | priced:<inputPer1M>,<outputPer1M>';

/** Parse one `decl` token. Never echoes more than the token itself. */
function parseDeclaration(token: string): Result<GatewayCostDeclaration, ConfigError> {
  const [kindRaw, ratesRaw, ...rest] = token.split(':');
  const kind = (kindRaw ?? '').trim().toLowerCase();
  if (kind === '') return err(new ConfigError(`${GATEWAY_COST_ENV}: empty declaration`));
  if (kind !== 'free' && kind !== 'local' && kind !== 'priced') {
    return err(new ConfigError(`${GATEWAY_COST_ENV}: "${kind}" is not one of ${GRAMMAR_HINT}`));
  }
  if (ratesRaw === undefined) return ok({ kind });
  if (kind !== 'priced' || rest.length > 0) {
    return err(new ConfigError(`${GATEWAY_COST_ENV}: only priced takes rates (${GRAMMAR_HINT})`));
  }
  return parsePricedRates(ratesRaw);
}

function parsePricedRates(ratesRaw: string): Result<GatewayCostDeclaration, ConfigError> {
  const parts = ratesRaw.split(',').map((p) => p.trim());
  if (parts.length !== 2) {
    return err(
      new ConfigError(
        `${GATEWAY_COST_ENV}: priced rates need both values, exactly two: priced:<inputPer1M>,<outputPer1M>`
      )
    );
  }
  const numbers = parts.map((p) => (p === '' ? Number.NaN : Number(p)));
  if (numbers.some((n) => Number.isNaN(n))) {
    return err(new ConfigError(`${GATEWAY_COST_ENV}: priced rates must be numbers`));
  }
  const parsed = PricedSchema.safeParse({
    kind: 'priced',
    inputPer1M: numbers[0],
    outputPer1M: numbers[1],
  });
  if (!parsed.success) {
    return err(
      new ConfigError(`${GATEWAY_COST_ENV}: priced rates must be non-negative finite numbers`)
    );
  }
  return ok(parsed.data);
}

/** Split `endpoint=decl` from a bare `decl`; the first `=` is the separator. */
function splitEntry(entry: string): { endpoint?: string; token: string } {
  const eq = entry.indexOf('=');
  if (eq === -1) return { token: entry };
  return { endpoint: entry.slice(0, eq).trim(), token: entry.slice(eq + 1) };
}

/**
 * Parse the whole `NEXUS_GATEWAY_COST` value. A `Result`, never a throw: the
 * env schema reports the reason at startup and every runtime reader treats
 * a failed parse as UNDECLARED.
 */
export function parseGatewayCostEnv(raw: string): Result<GatewayCostMap, ConfigError> {
  if (raw.trim() === '') return err(new ConfigError(`${GATEWAY_COST_ENV}: empty value`));
  const byEndpoint = new Map<string, GatewayCostDeclaration>();
  let bare: GatewayCostDeclaration | undefined;
  for (const entry of raw.split(';')) {
    const { endpoint, token } = splitEntry(entry);
    const decl = parseDeclaration(token);
    if (!decl.ok) return decl;
    if (endpoint === undefined) {
      if (bare !== undefined) {
        return err(new ConfigError(`${GATEWAY_COST_ENV}: more than one bare declaration`));
      }
      bare = decl.value;
      continue;
    }
    // Reject the key by shape without echoing it: a URL pasted here can carry
    // a credential, and the error line goes to the log.
    if (!isEndpointArmId(`api:${endpoint}`)) {
      return err(
        new ConfigError(`${GATEWAY_COST_ENV}: an endpoint key is not a valid endpoint id`)
      );
    }
    // Not echoed either: a token can satisfy the endpoint-id shape.
    if (byEndpoint.has(endpoint)) {
      return err(new ConfigError(`${GATEWAY_COST_ENV}: duplicate endpoint key`));
    }
    byEndpoint.set(endpoint, decl.value);
  }
  return ok(bare === undefined ? { byEndpoint } : { default: bare, byEndpoint });
}

/**
 * True iff `arm` is a GATEWAY arm: a valid endpoint arm id that is not one
 * of the three vendor arms (`api:anthropic|openai|google`). `api:custom-openai`
 * is a gateway. Decided on the arm id only — never on a URL. A type guard
 * (#4392 step 2) so a caller can hand a confirmed gateway arm to the
 * `EndpointArmId`-typed catalogue without a cast.
 */
export function isGatewayArmId(arm: string): arm is EndpointArmId {
  if (!isEndpointArmId(arm)) return false;
  return arm === 'api:custom-openai' || !ApiArmIdSchema.safeParse(arm).success;
}

/**
 * The `<vendor>` segments of the built-in vendor arms (`api:anthropic|openai|google`),
 * read from the vendor arm ids rather than retyped, so this list cannot drift
 * from `ApiArmIdSchema` (#6409).
 */
const VENDOR_ENDPOINT_SEGMENTS: readonly string[] = ApiArmIdSchema.options
  .filter((arm): boolean => !isGatewayArmId(arm))
  .map((arm) => arm.slice('api:'.length));

/**
 * Why `endpoint` cannot name a GATEWAY arm, or `undefined` when `api:<endpoint>`
 * is one (#6409). The single rule behind `NEXUS_OPENAI_COMPAT_ENDPOINT`'s env
 * schema and its runtime reader, so the two cannot disagree. Two refusals:
 * the endpoint-id shape (a URL, or a credential inside one, must never become
 * an arm id), and a built-in vendor segment — `api:openai` is a VENDOR arm,
 * where a gateway's `NEXUS_GATEWAY_COST` declaration is unreachable and the
 * cost ceiling prices it as the vendor. Neither message echoes the value.
 */
export function gatewayEndpointRejection(endpoint: string): string | undefined {
  const arm = `api:${endpoint}`;
  if (!isEndpointArmId(arm)) {
    return 'must be an endpoint id: lowercase alphanumerics plus . _ -, 1-64 chars';
  }
  if (isGatewayArmId(arm)) return undefined;
  return `must not be a built-in vendor segment (${VENDOR_ENDPOINT_SEGMENTS.join(', ')}): api:<value> would collide with that vendor's arm id`;
}

/**
 * The variable's state, telling unset apart from set-but-invalid (a set
 * value the operator meant to work is a different fix from a missing one).
 * `declared` carries the parsed map; whether it names a given arm is
 * {@link resolveGatewayCostDeclaration}'s question.
 */
export type GatewayCostStatus =
  | { readonly kind: 'unset' }
  | { readonly kind: 'invalid'; readonly reason: string }
  | { readonly kind: 'declared'; readonly map: GatewayCostMap };

export function gatewayCostStatus(env: NodeJS.ProcessEnv = process.env): GatewayCostStatus {
  const raw = env[GATEWAY_COST_ENV];
  if (raw === undefined) return { kind: 'unset' };
  const parsed = parseGatewayCostEnv(raw);
  if (!parsed.ok) return { kind: 'invalid', reason: parsed.error.message };
  return { kind: 'declared', map: parsed.value };
}

/**
 * The declaration that applies to `arm`, or `undefined` for UNDECLARED —
 * unset, unparsable, no bare default and no scoped entry, or not a gateway
 * arm at all (a vendor arm is registry-priced and never declared here).
 * One sentinel for every gap on purpose: it is the fail-closed input to cost
 * estimation. {@link gatewayCostGap} names which gap it was.
 */
export function resolveGatewayCostDeclaration(
  arm: string,
  env: NodeJS.ProcessEnv = process.env
): GatewayCostDeclaration | undefined {
  if (!isGatewayArmId(arm)) return undefined;
  const status = gatewayCostStatus(env);
  if (status.kind !== 'declared') return undefined;
  return status.map.byEndpoint.get(arm.slice('api:'.length)) ?? status.map.default;
}

/**
 * Why `arm` has no declaration, as a short phrase for a log line —
 * `unset`, `invalid (<reason>)`, or `undeclared for <arm> (…)` when the value
 * is valid but names neither the arm nor a default. `undefined` when the arm
 * is declared, or is not a gateway arm.
 */
export function gatewayCostGap(
  arm: string,
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  if (!isGatewayArmId(arm)) return undefined;
  if (resolveGatewayCostDeclaration(arm, env) !== undefined) return undefined;
  const status = gatewayCostStatus(env);
  if (status.kind === 'unset') return 'unset';
  if (status.kind === 'invalid') return `invalid (${status.reason})`;
  return `undeclared for ${arm} (no bare declaration and no ${arm.slice('api:'.length)}= entry)`;
}

/**
 * Token rates a declaration implies: $0 for `free`/`local`, the flat rate
 * for `priced:<in>,<out>`, and the sentinel `'registry'` for bare `priced`
 * (the caller looks the model up; an unpriced model stays fail-closed).
 */
export function gatewayCostRates(decl: GatewayCostDeclaration): TokenRates | 'registry' {
  if (decl.kind !== 'priced') return { inputPer1M: 0, outputPer1M: 0 };
  if (decl.inputPer1M === undefined || decl.outputPer1M === undefined) return 'registry';
  return { inputPer1M: decl.inputPer1M, outputPer1M: decl.outputPer1M };
}

/** One-line rendering for `doctor` and logs. */
export function describeGatewayCostDeclaration(decl: GatewayCostDeclaration): string {
  const rates = gatewayCostRates(decl);
  if (decl.kind !== 'priced') return decl.kind;
  if (rates === 'registry') return 'priced (registry rates)';
  return `priced ($${String(rates.inputPer1M)}/$${String(rates.outputPer1M)} per 1M)`;
}

/**
 * Registration-time loudness: warn at each registration of a gateway arm that
 * has no declaration (no per-process dedupe — a re-registration is a new
 * fact). Silent for vendor arms and for declared gateways. The message names
 * the gap (unset / invalid / undeclared for this arm) and the consequence —
 * the task-class cost ceiling and the per-task budget both exclude the arm
 * (#6393) — so the entry is actionable.
 */
export function warnIfGatewayCostUndeclared(
  arm: string,
  logger: ILogger,
  env: NodeJS.ProcessEnv = process.env
): void {
  const gap = gatewayCostGap(arm, env);
  if (gap === undefined) return;
  logger.warn(
    `Gateway cost for ${arm} is ${gap}: set ${GATEWAY_COST_ENV}=free|local|priced[:<in>,<out>] ` +
      `(or ${arm.slice('api:'.length)}=<decl>); the task-class cost ceiling and the per-task budget exclude this gateway until declared`,
    { arm, env: GATEWAY_COST_ENV, gap }
  );
}
