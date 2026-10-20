/** Run-local host evidence snapshots and completion reports. */
import { z } from 'zod';
import { raceAbort, throwIfAborted } from '../adapters/abort-utils.js';
import {
  validateObligationCompleteness,
  type EvidenceReceipt,
  type TaskContract,
} from './task-contract.js';
import {
  EvidenceAuthorizationSchema,
  EvidenceBindingSchema,
  EvidenceObservationSchema,
  MAX_EVIDENCE_OBSERVATIONS,
  type EvidenceAuthorization,
  type EvidenceBinding,
  type EvidenceReport,
  type EvidenceVerificationConfig,
} from './evidence-verification-types.js';
import {
  copyBoundedEvidence,
  observationReceipt,
  observationRejection,
  rejectedVerificationReceipt,
} from './evidence-observation.js';

export interface PreparedEvidenceVerification {
  readonly contract: TaskContract;
  readonly authorizations: readonly EvidenceAuthorization[];
  readonly verifier: EvidenceVerificationConfig['verify'] | undefined;
  readonly configurationError?: string;
}

export interface EvidenceVerificationOutcome {
  readonly receipts: readonly EvidenceReceipt[];
  readonly report: EvidenceReport;
  readonly error?: string;
}

/** Private copies are captured before graph effects, not when callbacks finish. */
export function prepareEvidenceVerification(
  task: TaskContract,
  config: EvidenceVerificationConfig | undefined
): PreparedEvidenceVerification {
  const contract = {
    ...task,
    evidenceObligations: (task.evidenceObligations ?? []).map((item) => ({ ...item })),
  };
  if (contract.evidenceObligations.length === 0)
    return { contract, authorizations: [], verifier: undefined };
  try {
    const authorizations = z
      .array(EvidenceAuthorizationSchema)
      .max(MAX_EVIDENCE_OBSERVATIONS)
      .parse(copyBoundedEvidence(config?.authorizations ?? []));
    const ids = new Set(authorizations.map((item) => item.obligationId));
    if (ids.size !== authorizations.length) throw new Error('DuplicateEvidenceAuthorization');
    return { contract, authorizations, verifier: config?.verify };
  } catch (cause: unknown) {
    return {
      contract,
      authorizations: [],
      verifier: undefined,
      configurationError:
        cause instanceof Error ? cause.message.slice(0, 512) : 'Invalid evidence authorization',
    };
  }
}

function reportStatus(
  criteria: number,
  accepted: number,
  missing: number,
  advisory: number
): EvidenceReport['status'] {
  if (criteria === 0) return 'not_applicable';
  if (missing > 0) return 'incomplete';
  if (accepted === 0) return 'unmeasured';
  return advisory > 0 ? 'incomplete' : 'complete';
}

export function summarizeEvidence(
  prepared: PreparedEvidenceVerification,
  receipts: readonly EvidenceReceipt[],
  diagnostics: readonly string[]
): EvidenceVerificationOutcome {
  const completeness = validateObligationCompleteness(prepared.contract, receipts);
  const missing: string[] = [];
  const unmetAdvisory: string[] = [];
  const fulfilled = new Set<string>();
  const obligations = prepared.contract.evidenceObligations ?? [];
  for (const obligation of obligations) {
    const one = validateObligationCompleteness(
      { ...prepared.contract, evidenceObligations: [obligation] },
      receipts
    );
    if (!one.ok) missing.push(obligation.id);
    else {
      unmetAdvisory.push(...one.value.unmetAdvisory);
      for (const id of one.value.fulfilled) fulfilled.add(id);
    }
  }
  const accepted = receipts.filter((receipt) => receipt.verified).length;
  const rejected = receipts.length - accepted;
  const retained = receipts.map((receipt, index) =>
    index === 0
      ? {
          ...receipt,
          metadata: {
            ...receipt.metadata,
            hostAuthorizations: prepared.authorizations.map((item) => ({ ...item })),
          },
        }
      : receipt
  );
  return {
    receipts: retained,
    report: {
      status: reportStatus(obligations.length, accepted, missing.length, unmetAdvisory.length),
      criteria: obligations.length,
      acceptedReceipts: accepted,
      rejectedReceipts: rejected,
      fulfilledObligations: [...fulfilled],
      missing,
      unmetAdvisory,
      diagnostics,
    },
    ...(completeness.ok ? {} : { error: completeness.error }),
  };
}

function checkBudget(signal: AbortSignal | undefined, deadlineAt: number): void {
  throwIfAborted(signal, 'Evidence verification aborted');
  if (Date.now() >= deadlineAt)
    throw new Error('EvidenceVerificationTimeoutError: pipeline deadline expired');
}

function collectObservations(
  prepared: PreparedEvidenceVerification,
  raw: unknown,
  binding: EvidenceBinding
): EvidenceReceipt[] {
  const boundedList = z.array(z.unknown()).max(MAX_EVIDENCE_OBSERVATIONS);
  const values = boundedList.parse(copyBoundedEvidence(boundedList.parse(raw)));
  const accepted = new Set<string>();
  const receipts: EvidenceReceipt[] = [];
  for (const value of values) {
    const parsed = EvidenceObservationSchema.safeParse(value);
    if (!parsed.success) {
      receipts.push(rejectedVerificationReceipt(binding, 'MalformedEvidenceObservation'));
      continue;
    }
    const observation = parsed.data;
    const rejection = accepted.has(observation.obligationId)
      ? 'DuplicateEvidenceObservation'
      : observationRejection(
          observation,
          binding,
          prepared.authorizations,
          prepared.contract.evidenceObligations ?? []
        );
    if (rejection === null) accepted.add(observation.obligationId);
    receipts.push(observationReceipt(observation, binding, rejection));
  }
  return receipts;
}

async function executeHostVerifier(
  prepared: PreparedEvidenceVerification,
  binding: EvidenceBinding,
  deadlineAt: number,
  signal: AbortSignal | undefined,
  verifier: EvidenceVerificationConfig['verify']
): Promise<EvidenceReceipt[]> {
  checkBudget(signal, deadlineAt);
  EvidenceBindingSchema.parse(binding);
  const timeoutSignal = AbortSignal.timeout(Math.max(1, deadlineAt - Date.now()));
  const effective = signal === undefined ? timeoutSignal : AbortSignal.any([signal, timeoutSignal]);
  const authorizations = z
    .array(EvidenceAuthorizationSchema)
    .parse(copyBoundedEvidence(prepared.authorizations));
  const raw = await raceAbort(
    Promise.resolve().then(() =>
      verifier({
        binding: { ...binding },
        authorizations,
        signal: effective,
      })
    ),
    effective
  );
  checkBudget(signal, deadlineAt);
  const receipts = collectObservations(prepared, raw, binding);
  checkBudget(signal, deadlineAt);
  return receipts;
}

function verificationFailure(
  prepared: PreparedEvidenceVerification,
  binding: EvidenceBinding,
  cause: unknown,
  deadlineAt: number,
  signal: AbortSignal | undefined
): EvidenceVerificationOutcome {
  const message =
    cause instanceof Error ? cause.message.slice(0, 512) : 'Evidence verification failed';
  const outcome = summarizeEvidence(
    prepared,
    [rejectedVerificationReceipt(binding, message)],
    [message]
  );
  return signal?.aborted === true || Date.now() >= deadlineAt
    ? { ...outcome, error: message }
    : outcome;
}

export async function verifyPreparedEvidence(
  prepared: PreparedEvidenceVerification,
  binding: EvidenceBinding,
  deadlineAt: number,
  signal: AbortSignal | undefined,
  runVerifier: boolean
): Promise<EvidenceVerificationOutcome> {
  if ((prepared.contract.evidenceObligations ?? []).length === 0)
    return summarizeEvidence(prepared, [], []);
  const verifier = prepared.verifier;
  if (prepared.configurationError !== undefined)
    return summarizeEvidence(
      prepared,
      [rejectedVerificationReceipt(binding, prepared.configurationError)],
      [prepared.configurationError]
    );
  if (!runVerifier || verifier === undefined)
    return summarizeEvidence(prepared, [], ['HostEvidenceNotMeasured']);
  try {
    const receipts = await executeHostVerifier(prepared, binding, deadlineAt, signal, verifier);
    return summarizeEvidence(
      prepared,
      receipts,
      receipts
        .filter((receipt) => !receipt.verified)
        .map((receipt) => String(receipt.metadata?.['rejection']))
    );
  } catch (cause: unknown) {
    return verificationFailure(prepared, binding, cause, deadlineAt, signal);
  }
}
