/** Internal host authority for one attempted completion spawn, not process settlement. */
import { err, getTimeProvider, ok, type Result } from '../core/index.js';
import { isTimeoutAbortReason } from '../adapters/abort-utils.js';
import type { ExecutionOptions, ResolvedExecutionOptions } from './types-capability.js';
import type { CliError, RoutingArmId } from './types-core.js';
import { NativeResourceObserver } from './native-resource-observer.js';
import {
  createCallerAbortCliError,
  createNativePreSpawnRefusal,
  type NativePreSpawnRefusalReason,
} from './cli-error-helpers.js';

export const NATIVE_EXECUTION_POLICY: unique symbol = Symbol('native-execution-policy');
const issuedBrand: unique symbol = Symbol('issued-native-execution-policy');
// Node timers above this limit overflow to 1 ms rather than the requested budget.
const MAX_TIMER_MS = 2_147_483_647;

export interface NativeExecutionPolicy {
  readonly [issuedBrand]: true;
}

export interface NativePolicyRefusal {
  readonly reason: NativePreSpawnRefusalReason | 'cancelled-before-spawn';
}

interface PolicyState {
  readonly deadlineAt: number;
  readonly signal: AbortSignal;
  attempted: boolean;
  retired: boolean;
  readonly resources: NativeResourceObserver;
}
const issued = new WeakMap<object, PolicyState>();

/** Issued host policy forbids retries even when callers override ordinary options. */
export function hasIssuedNativeExecutionPolicy(options: ExecutionOptions): boolean {
  const policy = options[NATIVE_EXECUTION_POLICY];
  return policy !== undefined && issued.has(policy);
}

/**
 * Minted by trusted host code once per logical operation, never from model JSON.
 * Actual request refusal ends that operation; later work needs a fresh policy and observer.
 */
export function issueNativeExecutionPolicy(input: {
  readonly deadlineAt: number;
  readonly signal?: AbortSignal;
  readonly resources?: NativeResourceObserver;
}): Result<NativeExecutionPolicy, NativePolicyRefusal> {
  const remaining = input.deadlineAt - getTimeProvider().now();
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > MAX_TIMER_MS) {
    return err({ reason: 'invalid-deadline' });
  }
  const resources = input.resources ?? new NativeResourceObserver();
  if (!resources.claimForPolicy()) return err({ reason: 'invalid-policy' });
  const deadlineSignal = AbortSignal.timeout(Math.ceil(remaining));
  const signal =
    input.signal === undefined ? deadlineSignal : AbortSignal.any([input.signal, deadlineSignal]);
  const policy: NativeExecutionPolicy = Object.freeze({ [issuedBrand]: true as const });
  issued.set(policy, {
    deadlineAt: input.deadlineAt,
    signal,
    attempted: false,
    retired: false,
    resources,
  });
  return ok(policy);
}

/** Host-owned handle registered before launch; never reconstructed from request JSON. */
export function nativeResourcesForPolicy(policy: unknown): NativeResourceObserver | undefined {
  return typeof policy === 'object' && policy !== null ? issued.get(policy)?.resources : undefined;
}

/** Validate identity and elapsed host budget without spending the spawn allowance. */
export function nativeExecutionBudget(
  policy: unknown,
  signal?: AbortSignal
): Result<{ readonly timeoutMs: number; readonly signal: AbortSignal }, NativePolicyRefusal> {
  const state = typeof policy === 'object' && policy !== null ? issued.get(policy) : undefined;
  if (state === undefined) return err({ reason: 'invalid-policy' });
  if (state.retired) return err({ reason: 'policy-retired' });
  const remaining = state.deadlineAt - getTimeProvider().now();
  if (remaining <= 0) return err({ reason: 'expired-before-spawn' });
  const combined = signal === undefined ? state.signal : AbortSignal.any([state.signal, signal]);
  if (combined.aborted) {
    return err({
      reason: isTimeoutAbortReason(combined.reason)
        ? 'expired-before-spawn'
        : 'cancelled-before-spawn',
    });
  }
  return ok({ timeoutMs: Math.ceil(remaining), signal: combined });
}

/** Retire logical authority before any refusal observer can synchronously reenter. */
function recordPolicyRefusal(policy: unknown): void {
  const state = typeof policy === 'object' && policy !== null ? issued.get(policy) : undefined;
  if (state === undefined) return;
  state.retired = true;
  state.resources.recordRefusal();
}

/**
 * Existing execute/default spreads preserve this optional symbol and exact capability.
 * An actual refusal retires the operation; pure budget inquiry and thrown wrappers do not.
 */
export function nativeExecutionOptions(
  policy: unknown,
  signal?: AbortSignal
): Result<ExecutionOptions, NativePolicyRefusal> {
  const budget = nativeExecutionBudget(policy, signal);
  if (!budget.ok) {
    recordPolicyRefusal(policy);
    return budget;
  }
  return ok({
    ...budget.value,
    allowRetry: false,
    maxRetries: 0,
    [NATIVE_EXECUTION_POLICY]: policy as NativeExecutionPolicy,
  });
}

/** Synchronous check-and-consume immediately before the canonical physical spawn. */
export function consumeNativeSpawnPermit(
  policy: unknown,
  signal?: AbortSignal
): Result<{ readonly timeoutMs: number; readonly signal: AbortSignal }, NativePolicyRefusal> {
  const budget = nativeExecutionBudget(policy, signal);
  if (!budget.ok) return budget;
  // Budget validation established exact WeakMap identity; no await splits this reservation.
  const state = issued.get(policy as NativeExecutionPolicy);
  if (state === undefined) return err({ reason: 'invalid-policy' });
  if (state.attempted) return err({ reason: 'permit-consumed' });
  state.attempted = true;
  return budget;
}

/** Preserve actual cancellation; other bounded reasons are distinct host refusals. */
export function nativePolicyRefusalError(
  refusal: NativePolicyRefusal,
  cli: RoutingArmId
): CliError {
  return refusal.reason === 'cancelled-before-spawn'
    ? createCallerAbortCliError(undefined, 'Caller cancelled before native spawn', cli)
    : createNativePreSpawnRefusal(refusal.reason, cli);
}

/** Same optional authority at preflight and at the final physical spawn boundary. */
export function resolveNativeSpawnOptions(
  options: ResolvedExecutionOptions,
  cli: RoutingArmId,
  consume: boolean
): Result<ResolvedExecutionOptions, CliError> {
  const policy = options[NATIVE_EXECUTION_POLICY];
  if (policy === undefined) {
    return options.signal?.aborted === true
      ? err(createCallerAbortCliError(options.signal.reason, 'Aborted before spawn', cli))
      : ok(options);
  }
  const budget = consume
    ? consumeNativeSpawnPermit(policy, options.signal)
    : nativeExecutionBudget(policy, options.signal);
  if (!budget.ok) {
    recordPolicyRefusal(policy);
    return err(nativePolicyRefusalError(budget.error, cli));
  }
  return ok({
    ...options,
    signal: budget.value.signal,
    timeoutMs: Math.min(options.timeoutMs, budget.value.timeoutMs),
  });
}
