/** Complete inline worker-input preflight; never grants host tool authority (#7413). */
import type { IModelAdapter } from '../../core/types/model.js';
import type { AgentPlanEntry } from './agent-planner.js';
import { getDefaultRegistry } from '../../config/model-registry.js';
import { UNRESOLVED_MODEL_ID } from '../../config/model-equivalence.js';
import { MAX_PRIOR_CONTEXT_CHARS } from './cross-wave-context.js';
import { warmModelMetadata } from '../../adapters/model-metadata.js';
import { withTimeout } from '../../utils/async-utils.js';
import { raceAbort } from '../../adapters/abort-utils.js';
import { CLI_SUBPROCESS_TIMEOUTS } from '../../config/timeouts.js';
import {
  prepareWorkerPrompt,
  MAX_WORKER_PROMPT_BYTES,
  type WorkerLearning,
} from './compose-worker-prompt.js';

interface WorkerInputPreflight {
  readonly entries: readonly AgentPlanEntry[];
  readonly taskDescription: string;
  readonly adapters: ReadonlyMap<AgentPlanEntry, IModelAdapter>;
  readonly learnings: readonly WorkerLearning[] | undefined;
  readonly signal: AbortSignal | undefined;
}

/** Reply reserve is the same limit dispatched in CompletionRequest.maxTokens. */
export const WORKER_OUTPUT_RESERVE_TOKENS = 4_000;

export function isExpandedWorkerInput(task: string, subTask: string): boolean {
  return `${task}\n\nSub-task: ${subTask}`.length > 500;
}

function knownWorkerContextWindow(adapter: IModelAdapter): number | undefined {
  if (adapter.modelId === UNRESOLVED_MODEL_ID) return undefined;
  const window = getDefaultRegistry().getEntry(adapter.modelId).contextWindow;
  return window !== undefined && Number.isFinite(window) && window > 0 ? window : undefined;
}

/** Expanded prompts need grounded model metadata and room for the reply/future waves. */
export async function checkExpandedPromptBudget(
  adapter: IModelAdapter,
  prompt: string,
  reserveBytes: number,
  signal?: AbortSignal
): Promise<string | undefined> {
  const window = knownWorkerContextWindow(adapter);
  if (window === undefined) {
    return 'unsupported inline delivery: model context window is unknown';
  }
  if (Buffer.byteLength(prompt) + reserveBytes > MAX_WORKER_PROMPT_BYTES) {
    return 'unsupported inline delivery: aggregate prompt and prior-wave reserve exceeds 200000 UTF-8 bytes';
  }
  try {
    const counted = await withTimeout(
      raceAbort(adapter.countTokens(prompt), signal),
      CLI_SUBPROCESS_TIMEOUTS.spawnMs,
      'Worker prompt token preflight'
    );
    if (!counted.ok) return 'unsupported inline delivery: input token estimate unavailable';
    const inputTokens = counted.value;
    // Count is approximate by adapter contract; reserve future text conservatively by byte.
    if (
      !Number.isFinite(inputTokens) ||
      inputTokens <= 0 ||
      inputTokens + reserveBytes + WORKER_OUTPUT_RESERVE_TOKENS > window
    ) {
      return 'unsupported inline delivery: estimated context budget cannot fit required input and 4000 output tokens';
    }
  } catch {
    return 'unsupported inline delivery: input token estimate unavailable';
  }
  return undefined;
}

/** Validate all required scopes first; resolve every expanded capacity before completion. */
function preparePreflightPrompt(
  entry: AgentPlanEntry,
  input: WorkerInputPreflight
): ReturnType<typeof prepareWorkerPrompt> {
  return prepareWorkerPrompt({
    entry,
    taskDescription: input.taskDescription,
    accessMode: 'read-only-analysis',
    ...(input.learnings !== undefined ? { learnings: input.learnings } : {}),
  });
}

export async function preflightWorkerPrompts(
  input: WorkerInputPreflight
): Promise<string | undefined> {
  const { entries, taskDescription, adapters, signal } = input;
  if (entries.length === 0) return 'unsupported inline delivery: empty worker plan';
  const prompts = new Map<AgentPlanEntry, string>();
  for (const entry of entries) {
    const prepared = preparePreflightPrompt(entry, input);
    if (!prepared.ok) return prepared.error;
    if (isExpandedWorkerInput(taskDescription, entry.subTask))
      prompts.set(entry, prepared.value.prompt);
  }
  try {
    await warmModelMetadata(
      [...prompts.keys()].flatMap((entry) => {
        const adapter = adapters.get(entry);
        return adapter === undefined ? [] : [adapter];
      }),
      signal
    );
  } catch {
    return 'unsupported inline delivery: model metadata preflight failed';
  }
  const reserveBytes = entries.length > 1 ? (MAX_PRIOR_CONTEXT_CHARS + 1024) * 4 : 0;
  for (const [entry, prompt] of prompts) {
    const adapter = adapters.get(entry);
    if (adapter === undefined) return 'unsupported inline delivery: worker model unresolved';
    const reason = await checkExpandedPromptBudget(adapter, prompt, reserveBytes, signal);
    if (reason !== undefined) return reason;
  }
  return undefined;
}
