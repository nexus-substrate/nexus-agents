/** One supplementary option selection, preserving the original vote (#4495). */
import { z } from 'zod';
import { getErrorMessage, getTimeProvider, type CompletionRequest } from '../core/index.js';
import { matchDeclaredOption } from '../consensus/option-tally.js';
import {
  foldCompletionUsage,
  mergeAttemptUsage,
  type AttemptUsage,
} from '../observability/attempt-usage.js';
import { withTimeout } from '../utils/async-utils.js';
import { VOTER_ACCESS_MODE } from './voter-cli-access.js';
import { seatSignal, unlessCancelled, isCancelled } from './voter-cancel.js';
import { VoterAttemptCollector, withVoterAttemptTelemetry } from './voter-attempt-events.js';
import { readVoteUsage } from './voter-attempt-usage.js';
import { extractTextFromResponse, type RetryOptions } from './voter-execution.js';
import { trackVoterCompletion } from './voter-late-settlement.js';
import { getVoterPrompts } from './voter-prompts.js';
import { buildVotePrompt, extractJsonFromResponse } from './voter-response.js';
import type { AgentVoteResult } from './vote-types.js';

type ReaskInput = Pick<
  RetryOptions,
  | 'adapter'
  | 'proposal'
  | 'logger'
  | 'timeoutMs'
  | 'options'
  | 'project'
  | 'workspace'
  | 'workspaceSha'
  | 'signal'
  | 'withinRoleRetry'
>;
const SelectionSchema = z.object({
  selectedOption: z.string(),
  decision: z.literal('approve').optional(),
});
const SELECTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['selectedOption'],
  properties: { selectedOption: { type: 'string' } },
};

function reaskRequest(seat: AgentVoteResult, input: ReaskInput): CompletionRequest {
  const context = buildVotePrompt(
    input.proposal,
    input.options,
    input.workspace,
    input.workspaceSha
  );
  return {
    messages: [
      { role: 'system', content: getVoterPrompts(input.project)[seat.role] },
      {
        role: 'user',
        content: `${context}\n\nOPTION SELECTION RE-ASK (once only):\nYour original vote: ${JSON.stringify(seat.vote)}\nYour approval is final. Keep that decision and its reasoning unchanged. Only fill the missing option selection.\nDeclared options: ${JSON.stringify(input.options)}\nReturn only JSON: {"selectedOption": "one exact declared option"}.`,
      },
    ],
    maxTokens: 512,
    temperature: 0.3,
    timeoutMs: input.timeoutMs,
    accessMode: VOTER_ACCESS_MODE,
    signal: seatSignal(input.timeoutMs, input.signal),
    ...(input.workspace !== undefined && input.workspace.trim() !== ''
      ? { workDir: input.workspace }
      : {}),
    responseFormat: { type: 'json_schema', schema: SELECTION_JSON_SCHEMA },
  };
}

interface ReaskState {
  readonly collector: VoterAttemptCollector;
  usage?: AttemptUsage;
}

/** Exactly one adapter completion: no transport, parsing or structured-output retry. */
async function askSelection(
  seat: AgentVoteResult,
  input: ReaskInput,
  state: ReaskState
): Promise<string | undefined> {
  state.collector.started();
  let eventId: string | undefined;
  const call = input.adapter.complete(reaskRequest(seat, input)).then((result) => {
    if (result.ok) {
      eventId = state.collector.settled(
        seat.role,
        input.adapter,
        result.value,
        'option_reask',
        input.withinRoleRetry
      );
      state.usage = foldCompletionUsage(undefined, readVoteUsage(result.value));
    }
    return result;
  });
  const completed = await withTimeout(
    unlessCancelled(trackVoterCompletion(call, input.signal), input.signal),
    input.timeoutMs,
    'Option selection re-ask timed out'
  );
  if (!completed.ok) throw new Error(completed.error);
  if (!completed.value.ok) throw completed.value.error;
  try {
    const text = extractTextFromResponse(completed.value.value.content);
    const parsed = SelectionSchema.parse(JSON.parse(extractJsonFromResponse(text)) as unknown);
    state.collector.classified(eventId, 'parsed');
    return matchDeclaredOption(parsed.selectedOption, input.options ?? []);
  } catch (error: unknown) {
    state.collector.classified(eventId, 'parse_failed');
    throw error;
  }
}

function needsOptionReask(seat: AgentVoteResult, input: ReaskInput): boolean {
  const declared = input.options;
  return (
    declared !== undefined &&
    declared.length > 0 &&
    seat.source === 'llm' &&
    seat.vote.decision === 'approve' &&
    seat.optionReask === undefined &&
    matchDeclaredOption(seat.selectedOption, declared) === undefined &&
    !isCancelled(input.signal)
  );
}

/** Re-ask only an approving live seat whose selection is unresolved. */
export async function reaskUnresolvedOption(
  seat: AgentVoteResult,
  input: ReaskInput
): Promise<AgentVoteResult> {
  if (!needsOptionReask(seat, input)) return seat;
  const start = getTimeProvider().now();
  const state: ReaskState = { collector: new VoterAttemptCollector() };
  let selection: string | undefined;
  try {
    selection = await askSelection(seat, input, state);
  } catch (error: unknown) {
    input.logger.warn('Option selection re-ask unresolved', {
      role: seat.role,
      error: getErrorMessage(error),
    });
  }
  const resolved = selection !== undefined;
  input.logger.info('Option selection re-ask completed', { role: seat.role, resolved });
  const result: AgentVoteResult = {
    ...seat,
    ...(resolved
      ? { selectedOption: selection, vote: { ...seat.vote, selectedOption: selection } }
      : {}),
    optionReask: { resolved },
    processingTimeMs: seat.processingTimeMs + getTimeProvider().now() - start,
    attemptUsage: mergeAttemptUsage(seat.attemptUsage, state.usage),
  };
  // The first completion still owns the verdict; the re-ask supplements it.
  return withVoterAttemptTelemetry(result, () => {
    const prior = seat.attemptTelemetry;
    const next = state.collector.snapshot();
    return {
      events: [
        ...(prior?.events ?? []),
        ...next.events.map((event) => ({
          ...event,
          outcome: event.outcome === 'final' ? ('parsed' as const) : event.outcome,
        })),
      ],
      observableAttempts: (prior?.observableAttempts ?? 0) + next.observableAttempts,
    };
  });
}
