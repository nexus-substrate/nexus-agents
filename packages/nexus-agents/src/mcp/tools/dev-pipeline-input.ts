/** Resolve and project acceptance at the MCP input boundary (#7663). */
import { readBoundedArtifact } from '../../cli/vote-artifact.js';
import { err, ok, getErrorMessage, type Result, type ILogger } from '../../core/index.js';
import { resolveInsideRoot } from '../../security/safe-path.js';
import { TrustTierSchema } from '../../security/trust-types.js';
import {
  captureAcceptanceContext,
  decodeAcceptanceSource,
  type AcceptanceContext,
  type AcceptanceSanitization,
} from '../../pipeline/acceptance-context.js';
import { sanitizeToolInput, logSanitizationResult } from '../middleware/tool-input-sanitizer.js';
import { checkSecurityTier, emitSecurityTierAudit } from '../middleware/secure-handler-tier.js';
import type { RequestContext } from '../middleware/request-context.js';
import type { IAuditLogger } from '../../audit/audit-types.js';
import { measureInputSanitization } from './pipeline-input-sanitization.js';
import { toolStructuredError, type ToolResult } from './tool-result.js';
import type { DevPipelineInput } from './dev-pipeline-tool.js';

type InputObservation = ReturnType<typeof measureInputSanitization>;
interface ResolveContext {
  readonly logger: ILogger;
  readonly trustTier?: string | undefined;
  readonly auditLogger?: IAuditLogger | undefined;
  readonly requestContext?: RequestContext | undefined;
  readonly inputSanitization: InputObservation;
}

function argumentObservation(observation: InputObservation): AcceptanceSanitization {
  if (observation.inputSanitization === 'unmodified') return { status: 'unmodified' };
  if (
    observation.inputSanitization === 'modified' &&
    observation.inputSanitizationCounts !== undefined
  ) {
    return { status: 'modified', counts: observation.inputSanitizationCounts };
  }
  return { status: 'unmeasured' };
}

async function readSource(
  input: DevPipelineInput
): Promise<Result<{ kind: 'task' | 'planFile'; source: string | Uint8Array }, Error>> {
  if (input.task !== undefined && input.task.trim() !== '')
    return ok({ kind: 'task', source: input.task });
  if (input.planFile === undefined)
    return err(new Error('Either task or planFile must be provided'));
  const resolved = resolveInsideRoot(input.planFile);
  if (resolved === null)
    return err(new Error(`Path traversal denied: planFile must be within ${process.cwd()}`));
  try {
    return ok({ kind: 'planFile', source: await readBoundedArtifact(resolved) });
  } catch (error: unknown) {
    return err(
      new Error(
        (error as NodeJS.ErrnoException).code === 'ENOENT'
          ? `Plan file not found: ${resolved}`
          : getErrorMessage(error)
      )
    );
  }
}

/** Standard tier matches run_dev_pipeline registration; no elevated trust is inferred. */
function projectFile(
  text: string,
  context: ResolveContext
): Result<{ text: string; measurement: AcceptanceSanitization }, ToolResult> {
  const result = sanitizeToolInput(text);
  logSanitizationResult(result, context.logger, 'run_dev_pipeline.planFile');
  const refusal = checkSecurityTier('standard', result, context.logger);
  if (refusal !== null) {
    if (context.auditLogger !== undefined && context.requestContext !== undefined) {
      emitSecurityTierAudit(
        context.auditLogger,
        'run_dev_pipeline.planFile',
        context.requestContext,
        refusal
      );
    }
    return err(refusal.error);
  }
  if (typeof result.sanitized !== 'string')
    return err(
      toolStructuredError({
        errorCategory: 'internal',
        message: 'Plan projection did not produce text',
      })
    );
  return ok({
    text: result.sanitized,
    measurement: result.wasModified
      ? {
          status: 'modified',
          counts: {
            tagsRemoved: result.tagsRemoved,
            commentsRemoved: result.commentsRemoved,
            fieldsModified: result.modifiedCount,
          },
        }
      : { status: 'unmodified' },
  });
}

/** Snapshot is returned for the builtin binding consumer; capability is not certified here. */
export async function resolveDevPipelineInput(
  input: DevPipelineInput,
  context: ResolveContext
): Promise<Result<AcceptanceContext, ToolResult>> {
  const resolved = await readSource(input);
  if (!resolved.ok)
    return err(
      toolStructuredError({ errorCategory: 'validation', message: resolved.error.message })
    );
  const decoded = decodeAcceptanceSource(resolved.value.source);
  if (!decoded.ok)
    return err(
      toolStructuredError({ errorCategory: 'validation', message: decoded.error.message })
    );
  const projection =
    resolved.value.kind === 'planFile'
      ? projectFile(decoded.value, context)
      : ok({ text: decoded.value, measurement: { status: 'unmeasured' as const } });
  if (!projection.ok) return projection;
  const tier = TrustTierSchema.safeParse(context.trustTier);
  const snapshot = captureAcceptanceContext({
    ...resolved.value,
    projection: projection.value.text,
    ...(tier.success ? { callerTrustTier: tier.data } : {}),
    ...(input.sourceTrustTier !== undefined ? { sourceTrustTier: input.sourceTrustTier } : {}),
    argumentSanitization: argumentObservation(context.inputSanitization),
    projectionSanitization: projection.value.measurement,
  });
  return snapshot.ok
    ? snapshot
    : err(toolStructuredError({ errorCategory: 'validation', message: snapshot.error.message }));
}
