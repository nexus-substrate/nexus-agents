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
export interface AcceptanceResolveContext {
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
  const source = await readAcceptanceFile(input.planFile, 'Plan');
  return source.ok ? ok({ kind: 'planFile', source: source.value }) : source;
}

/** Shared contained, bounded file read for the two pipeline input boundaries. */
export async function readAcceptanceFile(
  filePath: string,
  label: 'Plan' | 'Spec'
): Promise<Result<Uint8Array, Error>> {
  const resolved = resolveInsideRoot(filePath);
  if (resolved === null)
    return err(
      new Error(
        `Path traversal denied: ${label === 'Plan' ? 'planFile' : 'specFile'} must be within ${process.cwd()}`
      )
    );
  try {
    return ok(await readBoundedArtifact(resolved));
  } catch (error: unknown) {
    return err(
      new Error(
        (error as NodeJS.ErrnoException).code === 'ENOENT'
          ? `${label} file not found: ${resolved}`
          : getErrorMessage(error)
      )
    );
  }
}

/** Standard tier matches run_dev_pipeline registration; no elevated trust is inferred. */
function projectFile(
  text: string,
  context: AcceptanceResolveContext,
  toolName: string
): Result<{ text: string; measurement: AcceptanceSanitization }, ToolResult> {
  const result = sanitizeToolInput(text);
  logSanitizationResult(result, context.logger, toolName);
  const refusal = checkSecurityTier('standard', result, context.logger);
  if (refusal !== null) {
    if (context.auditLogger !== undefined && context.requestContext !== undefined) {
      emitSecurityTierAudit(context.auditLogger, toolName, context.requestContext, refusal);
    }
    return err(refusal.error);
  }
  if (typeof result.sanitized !== 'string')
    return err(
      toolStructuredError({
        errorCategory: 'internal',
        message: 'File projection did not produce text',
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
  context: AcceptanceResolveContext
): Promise<Result<AcceptanceContext, ToolResult>> {
  const resolved = await readSource(input);
  if (!resolved.ok)
    return err(
      toolStructuredError({ errorCategory: 'validation', message: resolved.error.message })
    );
  return captureResolvedAcceptance(
    {
      ...resolved.value,
      ...(input.sourceTrustTier !== undefined ? { sourceTrustTier: input.sourceTrustTier } : {}),
    },
    context,
    'run_dev_pipeline.planFile'
  );
}

/** Project a resolved input once, retaining argument and file observations separately. */
export function captureResolvedAcceptance(
  input: {
    readonly kind: 'task' | 'planFile' | 'specFile';
    readonly source: string | Uint8Array;
    readonly sourceTrustTier?: import('../../security/trust-types.js').TrustTier;
  },
  context: AcceptanceResolveContext,
  toolName: string
): Result<AcceptanceContext, ToolResult> {
  const decoded = decodeAcceptanceSource(input.source);
  if (!decoded.ok)
    return err(
      toolStructuredError({ errorCategory: 'validation', message: decoded.error.message })
    );
  const projection =
    input.kind !== 'task'
      ? projectFile(decoded.value, context, toolName)
      : ok({ text: decoded.value, measurement: { status: 'unmeasured' as const } });
  if (!projection.ok) return projection;
  const tier = TrustTierSchema.safeParse(context.trustTier);
  const snapshot = captureAcceptanceContext({
    ...input,
    projection: projection.value.text,
    ...(tier.success ? { callerTrustTier: tier.data } : {}),
    argumentSanitization: argumentObservation(context.inputSanitization),
    projectionSanitization: projection.value.measurement,
  });
  return snapshot.ok
    ? snapshot
    : err(toolStructuredError({ errorCategory: 'validation', message: snapshot.error.message }));
}

/** Plain-goal entrypoints have no middleware observation to promote into a measurement. */
export function captureGoalAcceptance(
  goal: string,
  trustTier?: string,
  sourceTrustTier?: import('../../security/trust-types.js').TrustTier
): Result<AcceptanceContext, Error> {
  const tier = TrustTierSchema.safeParse(trustTier);
  return captureAcceptanceContext({
    kind: 'goal',
    source: goal,
    ...(tier.success ? { callerTrustTier: tier.data } : {}),
    ...(sourceTrustTier !== undefined ? { sourceTrustTier } : {}),
  });
}
