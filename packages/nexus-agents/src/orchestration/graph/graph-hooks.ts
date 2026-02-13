/**
 * nexus-agents/orchestration - Graph Workflow Hooks
 *
 * Execution logic for precondition and post-step verification hooks.
 * Keeps hook concerns separate from the core executor flow.
 *
 * @module orchestration/graph/graph-hooks
 * (Source: Issue #994 — Post-step verification, Issue #997 — Pre-condition hooks)
 */

import type { Result } from '../../core/index.js';
import { ok, err, createLogger, getTimeProvider } from '../../core/index.js';
import type {
  GraphNode,
  GraphState,
  NodeHookContext,
  HookError,
  PreconditionConfig,
  GraphExecuteOptions,
} from './graph-types.js';

const logger = createLogger({ component: 'GraphHooks' });

// ============================================================================
// Hook Result Types
// ============================================================================

/** Result of running all preconditions for a node. */
export interface PreconditionResult {
  readonly passed: boolean;
  readonly results: readonly PreconditionOutcome[];
}

/** Outcome of a single precondition hook. */
export interface PreconditionOutcome {
  readonly name: string;
  readonly passed: boolean;
  readonly durationMs: number;
  readonly error?: string | undefined;
}

/** Result of running verification on a node. */
export interface VerificationResult {
  readonly passed: boolean;
  readonly durationMs: number;
  readonly error?: string | undefined;
}

// ============================================================================
// Hook Execution
// ============================================================================

/**
 * Runs all precondition hooks for a node.
 * If any required precondition fails, returns passed=false.
 * Optional precondition failures are logged but don't block execution.
 */
export async function runPreconditions(
  node: GraphNode,
  state: Readonly<GraphState>,
  stepNumber: number,
  options?: GraphExecuteOptions
): Promise<PreconditionResult> {
  const preconditions = node.preconditions;
  if (preconditions === undefined || preconditions.length === 0) {
    return { passed: true, results: [] };
  }

  const ctx: NodeHookContext = { nodeId: node.id, state, stepNumber };
  const outcomes: PreconditionOutcome[] = [];
  let allPassed = true;

  for (const config of preconditions) {
    const outcome = await runSinglePrecondition(config, ctx, options);
    outcomes.push(outcome);

    if (!outcome.passed) {
      const isRequired = config.required !== false;
      if (isRequired) {
        allPassed = false;
        logger.warn('Required precondition failed', {
          nodeId: node.id,
          hook: config.name,
          error: outcome.error,
        });
        break;
      }
      logger.info('Optional precondition failed, continuing', {
        nodeId: node.id,
        hook: config.name,
      });
    }
  }

  return { passed: allPassed, results: outcomes };
}

/**
 * Runs the post-step verification hook for a node.
 * Returns the verification result.
 */
export async function runVerification(
  node: GraphNode,
  state: Readonly<GraphState>,
  stepNumber: number,
  options?: GraphExecuteOptions
): Promise<VerificationResult> {
  if (node.verify === undefined) {
    return { passed: true, durationMs: 0 };
  }

  const ctx: NodeHookContext = { nodeId: node.id, state, stepNumber };
  const startTime = getTimeProvider().now();

  emitHookEvent({
    type: 'hook_started',
    nodeId: node.id,
    hookName: 'verify',
    hookPhase: 'verify',
    stepNumber,
    options,
  });

  try {
    const result = await node.verify(ctx);
    const durationMs = getTimeProvider().now() - startTime;

    if (result.ok) {
      emitHookEvent({
        type: 'hook_completed',
        nodeId: node.id,
        hookName: 'verify',
        hookPhase: 'verify',
        stepNumber,
        options,
        durationMs,
      });
      return { passed: true, durationMs };
    }

    const errorMsg = result.error.message;
    emitHookFailed({
      nodeId: node.id,
      hookName: 'verify',
      hookPhase: 'verify',
      error: errorMsg,
      stepNumber,
      options,
    });
    logger.warn('Verification failed', { nodeId: node.id, error: errorMsg });
    return { passed: false, durationMs, error: errorMsg };
  } catch (error: unknown) {
    const durationMs = getTimeProvider().now() - startTime;
    const msg = error instanceof Error ? error.message : String(error);
    emitHookFailed({
      nodeId: node.id,
      hookName: 'verify',
      hookPhase: 'verify',
      error: msg,
      stepNumber,
      options,
    });
    logger.warn('Verification threw', { nodeId: node.id, error: msg });
    return { passed: false, durationMs, error: msg };
  }
}

// ============================================================================
// Built-in Hooks
// ============================================================================

/**
 * Creates a state-comparison verification hook.
 * Checks that specified state fields changed after node execution.
 */
export function createStateComparisonVerifier(
  fields: readonly string[]
): (preState: Readonly<GraphState>) => PreconditionConfig['hook'] {
  return (preState: Readonly<GraphState>) => {
    const hook: PreconditionConfig['hook'] = (
      ctx: NodeHookContext
    ): Promise<Result<void, HookError>> => {
      for (const field of fields) {
        if (ctx.state[field] === preState[field]) {
          return Promise.resolve(
            err({
              hookName: 'state-comparison',
              nodeId: ctx.nodeId,
              message: `Field '${field}' unchanged after execution`,
            })
          );
        }
      }
      return Promise.resolve(ok(undefined));
    };
    return hook;
  };
}

/**
 * Creates a precondition that checks state field values.
 * Useful for enforcing invariants before node execution.
 */
export function createStateGuard(
  name: string,
  predicate: (state: Readonly<GraphState>) => boolean,
  errorMessage: string
): PreconditionConfig {
  return {
    name,
    required: true,
    hook: (ctx: NodeHookContext): Promise<Result<void, HookError>> => {
      if (predicate(ctx.state)) {
        return Promise.resolve(ok(undefined));
      }
      return Promise.resolve(err({ hookName: name, nodeId: ctx.nodeId, message: errorMessage }));
    },
  };
}

// ============================================================================
// Event Emission Helpers
// ============================================================================

interface HookEventOpts {
  readonly type: 'hook_started' | 'hook_completed';
  readonly nodeId: string;
  readonly hookName: string;
  readonly hookPhase: 'precondition' | 'verify';
  readonly stepNumber: number;
  readonly options?: GraphExecuteOptions;
  readonly durationMs?: number;
}

function emitHookEvent(opts: HookEventOpts): void {
  const emit = opts.options?.onEvent;
  if (emit === undefined) return;
  const ts = getTimeProvider().now();

  if (opts.type === 'hook_started') {
    emit({
      type: 'hook_started',
      nodeId: opts.nodeId,
      hookName: opts.hookName,
      hookPhase: opts.hookPhase,
      stepNumber: opts.stepNumber,
      timestamp: ts,
    });
  } else {
    emit({
      type: 'hook_completed',
      nodeId: opts.nodeId,
      hookName: opts.hookName,
      hookPhase: opts.hookPhase,
      durationMs: opts.durationMs ?? 0,
      stepNumber: opts.stepNumber,
      timestamp: ts,
    });
  }
}

interface HookFailedOpts {
  readonly nodeId: string;
  readonly hookName: string;
  readonly hookPhase: 'precondition' | 'verify';
  readonly error: string;
  readonly stepNumber: number;
  readonly options?: GraphExecuteOptions;
}

function emitHookFailed(opts: HookFailedOpts): void {
  const emit = opts.options?.onEvent;
  if (emit === undefined) return;
  emit({
    type: 'hook_failed',
    nodeId: opts.nodeId,
    hookName: opts.hookName,
    hookPhase: opts.hookPhase,
    error: opts.error,
    stepNumber: opts.stepNumber,
    timestamp: getTimeProvider().now(),
  });
}

// ============================================================================
// Internal Helpers
// ============================================================================

async function runSinglePrecondition(
  config: PreconditionConfig,
  ctx: NodeHookContext,
  options?: GraphExecuteOptions
): Promise<PreconditionOutcome> {
  const startTime = getTimeProvider().now();

  emitHookEvent({
    type: 'hook_started',
    nodeId: ctx.nodeId,
    hookName: config.name,
    hookPhase: 'precondition',
    stepNumber: ctx.stepNumber,
    options,
  });

  try {
    const result = await config.hook(ctx);
    const durationMs = getTimeProvider().now() - startTime;

    if (result.ok) {
      emitHookEvent({
        type: 'hook_completed',
        nodeId: ctx.nodeId,
        hookName: config.name,
        hookPhase: 'precondition',
        stepNumber: ctx.stepNumber,
        options,
        durationMs,
      });
      return { name: config.name, passed: true, durationMs };
    }

    const errorMsg = result.error.message;
    emitHookFailed({
      nodeId: ctx.nodeId,
      hookName: config.name,
      hookPhase: 'precondition',
      error: errorMsg,
      stepNumber: ctx.stepNumber,
      options,
    });
    return { name: config.name, passed: false, durationMs, error: errorMsg };
  } catch (error: unknown) {
    const durationMs = getTimeProvider().now() - startTime;
    const msg = error instanceof Error ? error.message : String(error);
    emitHookFailed({
      nodeId: ctx.nodeId,
      hookName: config.name,
      hookPhase: 'precondition',
      error: msg,
      stepNumber: ctx.stepNumber,
      options,
    });
    return { name: config.name, passed: false, durationMs, error: msg };
  }
}
