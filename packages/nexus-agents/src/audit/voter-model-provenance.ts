/** Bounded, present-only voter model provenance for the authentic ledger (#7333). */
import type { z } from 'zod';
import type { ILogger } from '../core/index.js';
import { createLogger } from '../core/index.js';
import type { AgentVoteResult } from '../cli/vote-types.js';
import { assignedModel, resolvedModel } from '../cli/vote-diversity.js';
import { UNRESOLVED_MODEL_ID } from '../config/model-equivalence.js';
import type { VoterSummary } from './vote-record.js';
import { projectSeatFallback, VoterSummarySchema } from './vote-record.js';

type ModelEvidence = Pick<
  VoterSummary,
  'model' | 'servedModel' | 'resolvedModel' | 'assignedModel' | 'fallback'
>;

/** Validate before canonical resolution; malformed adapter output must not lose the vote. */
function validatedIdentity(
  field: string,
  value: unknown,
  schema: z.ZodType<string | undefined>,
  context: { role: string; logger: ILogger }
): string | undefined {
  if (value === undefined) return undefined;
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  context.logger.warn(`Omitting a reported ${field} the vote-record reader would reject`, {
    role: context.role,
    ...(typeof value === 'string' ? { length: value.length } : { type: typeof value }),
  });
  return undefined;
}

/**
 * Keep configured model semantics; resolvedModel includes the canonical requested
 * fallback when transport reporting is absent. Only servedModel is a raw report.
 * No identity is clipped, and new fields never authorize configured family credit.
 */
export function voterModelEvidence(v: AgentVoteResult, logger?: ILogger): ModelEvidence {
  const context = {
    role: v.role,
    logger: logger ?? createLogger({ component: 'vote-record-store' }),
  };
  const validate = (
    field: string,
    value: unknown,
    schema: z.ZodType<string | undefined>
  ): string | undefined => validatedIdentity(field, value, schema, context);
  const fields = VoterSummarySchema.shape;
  const model = validate('model', v.model, fields.model);
  const servedModel = validate('servedModel', v.servedModel, fields.servedModel);
  const pinnedModel = validate('pinnedModel', v.pinnedModel, fields.assignedModel);
  const fallback = validatedFallback(v, validate);
  // CLI is not ledger model evidence, but must be a string before alias qualification.
  const cli = validate('cli', v.cli, fields.assignedCli);
  const normalized = {
    ...v,
    model,
    servedModel,
    pinnedModel,
    cli,
    // Preserve the fallback marker even when its origin identity was omitted:
    // assignedModel must not turn an untraced fallback into a primary request.
    fallback:
      fallback === undefined
        ? undefined
        : {
            ...fallback,
            fromCli: typeof fallback.fromCli === 'string' ? fallback.fromCli : '',
          },
  };
  const resolved = validate('resolvedModel', resolvedModel(normalized), fields.resolvedModel);
  const assigned = validate('assignedModel', assignedModel(normalized), fields.assignedModel);
  return {
    ...(model !== undefined && model !== UNRESOLVED_MODEL_ID ? { model } : {}),
    ...(servedModel !== undefined ? { servedModel } : {}),
    ...(resolved !== undefined ? { resolvedModel: resolved } : {}),
    ...(assigned !== undefined ? { assignedModel: assigned } : {}),
    ...(fallback !== undefined ? { fallback: projectSeatFallback(fallback) } : {}),
  };
}

/** Omit only malformed optional origin identity, retaining the fact fallback happened. */
function validatedFallback(
  v: AgentVoteResult,
  validate: (
    field: string,
    value: unknown,
    schema: z.ZodType<string | undefined>
  ) => string | undefined
): AgentVoteResult['fallback'] {
  if (v.fallback === undefined) return undefined;
  const { fromModel: rawModel, ...origin } = v.fallback;
  const fromModel = validate(
    'fallback.fromModel',
    rawModel,
    VoterSummarySchema.shape.fallback.unwrap().shape.fromModel
  );
  return { ...origin, ...(fromModel !== undefined ? { fromModel } : {}) };
}
