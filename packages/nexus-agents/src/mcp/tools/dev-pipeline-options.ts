/**
 * Build `runDevPipeline` options from validated `run_dev_pipeline` input.
 *
 * Split out of `dev-pipeline-tool.ts` for its line cap; one concern — which
 * input fields become pipeline options, and how the threaded caller context
 * joins them.
 *
 * @module mcp/tools/dev-pipeline-options
 */

import type { DevPipelineOptions } from '../../pipeline/dev-pipeline.js';
import type { IAuditLogger } from '../../audit/audit-types.js';
import type { DevPipelineInput } from './dev-pipeline-tool.js';

/**
 * Build the {@link DevPipelineOptions} from validated input plus the threaded
 * caller context. Extracted so the handler stays under the complexity cap. The
 * `auditLogger` (#3710) is included only when the server threaded one.
 */
export function buildPipelineOptions(
  input: DevPipelineInput,
  trustTier: string | undefined,
  auditLogger: IAuditLogger | undefined
): DevPipelineOptions {
  return {
    ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
    ...(input.dryRun ? { dryRun: true } : {}),
    ...(input.mode === 'harness' ? { mode: 'harness' as const } : {}),
    ...(input.qualityGate !== 'off' ? { qualityGate: input.qualityGate } : {}),
    // #4939: both were advertised, bounds-checked and defaulted since the tool
    // shipped, and neither was ever read off `parsed.data`.
    maxVoteIterations: input.maxVoteIterations,
    maxQaIterations: input.maxQaIterations,
    // #6736: advertised as a per-stage deadline since the tool shipped, and
    // never read.
    ...(input.timeoutMs !== undefined ? { stageTimeoutMs: input.timeoutMs } : {}),
    ...(trustTier !== undefined ? { trustTier } : {}),
    // #6795: the caller's declared provenance of the task text; omitted stays
    // omitted, and the pipeline applies Tier 3 for it.
    ...(input.sourceTrustTier !== undefined ? { sourceTrustTier: input.sourceTrustTier } : {}),
    // #3710: thread the server's durable audit logger so the consensus→execute
    // policy gate persists decisions to the shared hash chain.
    ...(auditLogger !== undefined ? { auditLogger } : {}),
  };
}
