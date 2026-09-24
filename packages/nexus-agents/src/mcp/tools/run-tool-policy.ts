/**
 * Policy gate for `run { execute: true }` (#6431 review).
 *
 * Split out of `run-tool.ts` for its line cap; one concern — the execute path
 * is policy-checked as the strategy tool it is about to run.
 *
 * @module mcp/tools/run-tool-policy
 */

import { createLogger, type ILogger } from '../../core/index.js';
import type { ExecutionStrategy } from '../../orchestration/meta-orchestrator.js';
import { entrypointToolFor } from '../../orchestration/strategy-manifest-registry.js';
import { checkPolicyForDispatchedTool } from '../middleware/policy-check.js';
import { createRequestContext, type RequestContext } from '../middleware/request-context.js';
import type { IModelAdapter } from '../../core/index.js';
import type { ToolResult } from './tool-result.js';
import type { RunInput } from './run-tool.js';

/** What a `run { execute: true }` body needs beyond its input and logger. */
export interface RunBodyOptions {
  readonly trustTier?: string | undefined;
  readonly gatewayAdapters?: readonly IModelAdapter[] | undefined;
  readonly requestContext?: RequestContext | undefined;
  readonly onProgress?: (() => void) | undefined;
  /** `cancel_job`'s signal on the async path (#6305); absent on the sync path. */
  readonly signal?: AbortSignal | undefined;
}

/**
 * `run { execute: true }` was refused by the policy firewall for the tool its
 * selected strategy would have run (#6431 review). Carries the same denial
 * envelope that tool's own secure handler returns, so `executeRunBody` hands
 * it back unchanged instead of reclassifying it as a dispatch failure.
 */
export class RunPolicyDeniedError extends Error {
  constructor(
    readonly toolResult: ToolResult,
    readonly targetTool: string
  ) {
    super(toolResult.content[0]?.text ?? `Policy denied: ${targetTool}`);
    this.name = 'RunPolicyDeniedError';
  }
}

/**
 * Policy-checks the execute path AS THE STRATEGY TOOL it is about to run
 * (#6431 review). `run` is `readOnlyHint: true` — routing is read-only — but
 * with `execute: true` it dispatches the engine directly, never through
 * `run_dev_pipeline` / `run_pipeline` / `consensus_vote`'s secure handler, so
 * under enforce + the read-only lock those tools were denied while `run`
 * ran the same engines. The manifest's entrypoint tool for the strategy is the
 * one name→tool map; the check is the one every secure handler runs.
 */
export function assertExecutePolicy(
  strategy: ExecutionStrategy,
  input: RunInput,
  logger: ILogger | undefined,
  requestContext: RequestContext | undefined
): void {
  const targetTool = entrypointToolFor(strategy);
  const denied = checkPolicyForDispatchedTool({
    toolName: targetTool,
    args: input,
    logger: logger ?? createLogger({ tool: 'run' }),
    requestContext: requestContext ?? createRequestContext({ toolName: 'run' }),
  });
  if (denied !== null) throw new RunPolicyDeniedError(denied, targetTool);
}
