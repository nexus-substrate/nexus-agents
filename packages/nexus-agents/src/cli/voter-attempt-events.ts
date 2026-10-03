/**
 * In-memory observations for the existing decision-cost writer, not a store.
 * Response provenance/usage is frozen before parsing. Parsing classifications
 * are kept separately, then projected into one immutable event per response.
 * Snapshotting never waits for outstanding calls; later settlement cannot
 * change an earlier snapshot. Started calls without responses remain unobserved.
 */
import { randomUUID } from 'node:crypto';
import type { CompletionResponse, IModelAdapter } from '../core/index.js';
import type { AttemptTelemetry, VoterAttemptEvent } from '../observability/attempt-usage.js';
import type { AgentVoteResult, VotePromptContext, VoterRole } from './vote-types.js';

export type VoterAttemptKind = VoterAttemptEvent['attemptKind'];
type Observation = Omit<VoterAttemptEvent, 'outcome'>;

/** Reuse the pass's collector or start a new execution chain. */
export function resolveAttemptCollector(context?: VotePromptContext): VoterAttemptCollector {
  return context?.attemptCollector ?? new VoterAttemptCollector();
}

/** Retry provenance follows the failed attempt's cause and retains the outer pass. */
export function voteRetryContext(
  context: VotePromptContext,
  attempt: number,
  parseFailed: boolean
): VotePromptContext {
  return {
    ...context,
    attemptKind: attempt === 0 ? context.attemptKind : parseFailed ? 'parse_retry' : 'error_retry',
    withinRoleRetry: context.withinRoleRetry === true || context.attemptKind === 'role_retry',
  };
}
const MAX_PROVENANCE_LENGTH = 120;

function count(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

/** Partial/placeholder/malformed input/output usage is explicitly unknown. */
function responseUsage(response: CompletionResponse): VoterAttemptEvent['usage'] {
  const usage = response.usage;
  const input = count(usage?.inputTokens);
  const output = count(usage?.outputTokens);
  if (input === undefined || output === undefined || usage?.inputTokensMeasured === false)
    return Object.freeze({ kind: 'unknown' });
  return Object.freeze({ kind: 'reported', input, output, ...optionalUsageFields(usage) });
}

function optionalUsageFields(
  usage: CompletionResponse['usage']
): Partial<Record<'cached' | 'reasoning' | 'cacheCreation', number>> {
  const out: Partial<Record<'cached' | 'reasoning' | 'cacheCreation', number>> = {};
  if (usage === undefined) return out;
  const fields = [
    ['cached', 'cachedInputTokens'],
    ['reasoning', 'reasoningTokens'],
    ['cacheCreation', 'cacheCreationInputTokens'],
  ] as const;
  for (const [key, field] of fields) {
    const value = count(Reflect.get(usage, field));
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** One execution chain, surviving its timeout result and raw promise settlement. */
export class VoterAttemptCollector {
  private observableAttempts = 0;
  private readonly observations: Observation[] = [];
  private readonly outcomes = new Map<string, 'parsed' | 'parse_failed' | 'superseded'>();
  private finalId: string | undefined;

  started(): void {
    this.observableAttempts++;
  }

  settled(
    role: VoterRole,
    adapter: IModelAdapter,
    response: CompletionResponse,
    attemptKind: VoterAttemptKind,
    withinRoleRetry?: boolean
  ): string {
    const id = randomUUID();
    const model = response.model || adapter.modelId;
    const name: unknown = Reflect.get(adapter, 'name');
    this.observations.push(
      Object.freeze({
        id,
        role,
        cli: (typeof name === 'string' && name !== '' ? name : adapter.providerId).slice(
          0,
          MAX_PROVENANCE_LENGTH
        ),
        adapter: adapter.providerId.slice(0, MAX_PROVENANCE_LENGTH),
        ...(model !== '' && model !== 'pending-detection'
          ? { model: model.slice(0, MAX_PROVENANCE_LENGTH) }
          : {}),
        attemptKind,
        ...(withinRoleRetry === true ? { withinRoleRetry } : {}),
        usage: responseUsage(response),
      })
    );
    return id;
  }

  classified(id: string | undefined, outcome: 'parsed' | 'parse_failed'): void {
    if (id === undefined) return;
    this.outcomes.set(id, outcome);
    if (outcome === 'parsed') this.finalId = id;
  }

  discardFinal(): void {
    if (this.finalId !== undefined) this.outcomes.set(this.finalId, 'superseded');
    this.finalId = undefined;
  }

  snapshot(): AttemptTelemetry {
    const events = this.observations.map((event): VoterAttemptEvent => {
      const outcome =
        event.id === this.finalId ? 'final' : (this.outcomes.get(event.id) ?? 'superseded');
      return Object.freeze({ ...event, outcome });
    });
    return Object.freeze({
      events: Object.freeze(events),
      observableAttempts: this.observableAttempts,
    });
  }
}

/** Keep deadline-losing responses observable until the cost bridge reads the seat. */
export function withVoterAttemptTelemetry<T extends object>(
  result: T,
  snapshot: () => AttemptTelemetry
): T & { readonly attemptTelemetry: AttemptTelemetry } {
  return Object.defineProperty({ ...result }, 'attemptTelemetry', {
    enumerable: true,
    get: snapshot,
  }) as T & { readonly attemptTelemetry: AttemptTelemetry };
}

/** Carry the replaced chain lazily, so a late response is not lost by a copy. */
export function carryVoterAttemptTelemetry(
  from: { readonly attemptTelemetry?: AttemptTelemetry | undefined } | undefined,
  onto: AgentVoteResult
): AgentVoteResult {
  if (from?.attemptTelemetry === undefined && onto.attemptTelemetry === undefined) return onto;
  return withVoterAttemptTelemetry(onto, () => {
    const prior = from?.attemptTelemetry;
    const next = onto.attemptTelemetry;
    const events = [
      ...(prior?.events ?? []).map((event): VoterAttemptEvent =>
        Object.freeze({
          ...event,
          outcome: event.outcome === 'final' ? 'superseded' : event.outcome,
        })
      ),
      ...(next?.events ?? []),
    ];
    return Object.freeze({
      events: Object.freeze(events),
      observableAttempts: (prior?.observableAttempts ?? 0) + (next?.observableAttempts ?? 0),
    });
  });
}

/** Preserve late observation across result decoration, without modifying evidence. */
export function preserveVoterAttemptTelemetry<T extends object>(
  from: { readonly attemptTelemetry?: AttemptTelemetry | undefined },
  onto: T
): T {
  const initial = from.attemptTelemetry;
  return initial === undefined
    ? onto
    : withVoterAttemptTelemetry(onto, () => from.attemptTelemetry ?? initial);
}
