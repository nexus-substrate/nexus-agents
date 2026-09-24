/**
 * What serves each gateway family slot, as `doctor` reports it (#6720).
 *
 * The decision is the router's own: `decideSlotServing` from
 * `cli-adapters/gateway-slot-arm.ts`, the function `buildGatewaySlotRouterArm`
 * reads. Only its inputs come from doctor's measurement: the gateway's slot
 * mapping, `NEXUS_DISABLED_CLIS`, and the CLI checks. Where the router defers
 * to its availability probe (`cli-or-gateway`), doctor has already run that
 * probe, so it resolves the slot to whichever target the probe would pick.
 *
 * @module cli/doctor-gateway-slots
 */

import { isCliDisabled } from '../cli-adapters/disabled-clis.js';
import { decideSlotServing } from '../cli-adapters/gateway-slot-arm.js';
import type { GatewayFamily, GatewaySlotMapping } from '../adapters/gateway-family-slots.js';
import type { CliCheckResult } from './doctor.js';
import type { GatewayHealth } from './doctor-gateway.js';

/** A family slot of the gateway mapping. */
export type GatewayFamilySlot = keyof GatewaySlotMapping;

/** The family slots in report order, with the family each one is served by. */
const FAMILY_SLOTS: readonly (readonly [GatewayFamilySlot, GatewayFamily])[] = [
  ['claude', 'anthropic'],
  ['codex', 'openai'],
  ['gemini', 'google'],
];

/** One slot: the target that serves it, and why. */
export interface GatewaySlotServing {
  readonly slot: GatewayFamilySlot;
  readonly family: GatewayFamily;
  /** The gateway model for the slot, or `'unavailable'` when the gateway has none. */
  readonly model: string;
  readonly serving: 'cli' | 'gateway' | 'unavailable';
  /** Disabled by `NEXUS_DISABLED_CLIS`. */
  readonly disabled: boolean;
}

/**
 * Whether the router's availability probe (`isCliAvailable`: health AND auth)
 * would admit this CLI. `unverified` auth is admitted, as the probe admits it.
 */
function probeAdmits(cli: CliCheckResult): boolean {
  return (
    cli.installed && cli.authState !== 'not-authenticated' && cli.versionStatus !== 'unsupported'
  );
}

/**
 * Each family slot's serving target on a healthy gateway; empty for any other
 * state, which has no slot mapping. A CLI absent from `clis` counts as not
 * installed: doctor checks every CLI it does not skip as disabled.
 */
export function gatewaySlotServing(
  health: GatewayHealth,
  clis: readonly CliCheckResult[]
): readonly GatewaySlotServing[] {
  if (health.state !== 'healthy') return [];
  return FAMILY_SLOTS.map(([slot, family]) => {
    const model = health.slots[slot];
    const check = clis.find((c) => c.name === slot);
    const disabled = isCliDisabled(slot);
    const decided = decideSlotServing({
      disabled,
      onPath: () => check?.installed === true,
      gateway: model === 'unavailable' ? 'unavailable' : 'resolved',
    });
    if (decided !== 'cli-or-gateway') return { slot, family, model, serving: decided, disabled };
    const serving = check !== undefined && probeAdmits(check) ? 'cli' : 'gateway';
    return { slot, family, model, serving, disabled };
  });
}

/** Why the CLI does not serve its slot, for a report line. */
function cliAbsence(s: GatewaySlotServing): string {
  return s.disabled ? 'CLI disabled by NEXUS_DISABLED_CLIS' : 'CLI not available';
}

/** The `doctor --gateway` line for one slot. */
export function formatSlotServing(s: GatewaySlotServing): string {
  switch (s.serving) {
    case 'gateway':
      return `${s.slot} → ${s.model} (gateway; ${cliAbsence(s)})`;
    case 'unavailable':
      return `${s.slot} → unavailable (${cliAbsence(s)}; the gateway has no ${s.family} model)`;
    case 'cli':
      return s.model === 'unavailable'
        ? `${s.slot} → CLI (the gateway has no ${s.family} model)`
        : `${s.slot} → CLI (installed and authenticated; ${s.model} if it stops being available)`;
  }
}
