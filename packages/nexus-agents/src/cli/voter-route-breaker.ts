/** Internal availability gate for a resolved voter model/route (#7070). */
import type { IModelAdapter } from '../core/index.js';
import { breakerKeys } from '../cli-adapters/breaker-key.js';
import { getDefaultCliCircuitBreakerRegistry } from '../cli-adapters/cli-circuit-breaker.js';
import { isCliName } from '../cli-adapters/types-core.js';
import { ModelBoundAdapter } from '../adapters/model-bound-adapter.js';
import { UNRESOLVED_MODEL_ID } from '../config/model-equivalence.js';
import { bareCliName } from './voter-fallback.js';
import { createErrorVoteResult } from './voter-execution.js';
import type { AgentVoteResult, VoterRole } from './vote-types.js';

/** Refuse the resolved seat's route, rather than the CLI's unrelated default route. */
export function unavailableSeat(
  adapter: IModelAdapter,
  role: VoterRole
): AgentVoteResult | undefined {
  // CliToModelAdapter and CLI-pinned resilient proxies use this provider id.
  // A gateway/API adapter has its own execution gate; never infer a CLI from
  // its model's vendor (the same weights can run on different transports).
  const cli = typeof adapter.providerId === 'string' ? bareCliName(adapter.providerId) : undefined;
  if (cli === undefined || !isCliName(cli)) return undefined;
  const gatewayArm = 'gatewayArm' in adapter ? adapter.gatewayArm : undefined;
  const requested = adapter instanceof ModelBoundAdapter ? adapter.boundModel : adapter.modelId;
  // A lazy slot has not detected its transport; it may become a gateway arm.
  // Leave that decision to detection instead of treating absence as a default CLI.
  if (requested === UNRESOLVED_MODEL_ID && gatewayArm === undefined) return undefined;
  const model = requested === UNRESOLVED_MODEL_ID ? undefined : requested;
  const key = breakerKeys.forArm({ name: cli, model, gatewayArm });
  if (!getDefaultCliCircuitBreakerRegistry().isArmOpen(key)) return undefined;
  return createErrorVoteResult(
    role,
    `Model route unavailable: circuit breaker open (${key})`,
    0,
    adapter.providerId
  );
}
