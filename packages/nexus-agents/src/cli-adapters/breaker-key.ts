/** Internal breaker identity; deliberately absent from public export barrels (#7070). */
import { createHash } from 'node:crypto';
import { resolveCliModelName } from '../config/model-config-helpers.js';
import { isCliName, isEndpointArmId, type ObservedArmId } from './types.js';

interface BreakerArm {
  readonly name: string;
  readonly model?: string | undefined;
  readonly gatewayArm?: unknown;
}

/** Bounded fallback identity: bookkeeping must never reject an execution. */
function hashedIdentity(identity: string): string {
  return createHash('sha256').update(identity).digest('hex').slice(0, 40);
}

/** Provider from the registry's CLI route; unregistered bare names stay isolated. */
function openCodeProvider(model: string | undefined): string | undefined {
  if (model === undefined) return undefined;
  // OpenCode lists registry gateway models under an additional openrouter/
  // prefix. Resolve that spelling through the registry too, as execution does.
  const canonical =
    resolveCliModelName('opencode', model) ??
    (model.startsWith('openrouter/')
      ? resolveCliModelName('opencode', model.slice('openrouter/'.length))
      : undefined);
  const resolved = canonical ?? model;
  const slash = resolved.indexOf('/');
  if (slash < 0) return hashedIdentity(resolved);
  const provider = resolved.slice(0, slash);
  return provider === 'anthropic' ? undefined : provider;
}

/** One key policy for recorders and readers, without registry aliases or capacity sharing. */
function breakerKey(arm: BreakerArm): ObservedArmId {
  if (typeof arm.gatewayArm === 'string' && isEndpointArmId(arm.gatewayArm)) {
    if (!isCliName(arm.name)) return arm.gatewayArm;
    // Hash only the existing endpoint identity: no URL, credentials or model
    // enters the key. Bounded to the existing endpoint-id grammar (64 chars).
    const endpoint = hashedIdentity(arm.gatewayArm);
    return `api:slot-${endpoint}-${arm.name}`;
  }
  if (isCliName(arm.name)) {
    const provider = arm.name === 'opencode' ? openCodeProvider(arm.model) : undefined;
    // The default Anthropic route retains the key existing slot readers use.
    if (provider === undefined) return arm.name;
    const key = `api:opencode-${provider}`;
    if (isEndpointArmId(key)) return key;
    const identity = hashedIdentity(provider);
    return `api:opencode-${identity}`;
  }
  if (isEndpointArmId(arm.name)) return arm.name;
  const key = `api:${arm.name}`;
  if (isEndpointArmId(key)) return key;
  return `api:${hashedIdentity(arm.name)}`;
}

/** Internal access to the module-private key function; never a published adapter member. */
export const breakerKeys = { forArm: breakerKey };
