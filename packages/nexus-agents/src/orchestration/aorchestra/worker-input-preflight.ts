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
import { isCodexTransport, inlineWorkerArtifacts } from './worker-artifact.js';

interface WorkerInputPreflight {
  readonly entries: readonly AgentPlanEntry[];
  readonly taskDescription: string;
  readonly adapters: ReadonlyMap<AgentPlanEntry, IModelAdapter>;
  readonly learnings: readonly WorkerLearning[] | undefined;
  readonly signal: AbortSignal | undefined;
  readonly relevantFiles?: readonly string[] | undefined;
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
  input: WorkerInputPreflight,
  inlinedArtifacts?: string
): ReturnType<typeof prepareWorkerPrompt> {
  const adapter = input.adapters.get(entry);
  return prepareWorkerPrompt({
    entry,
    taskDescription: input.taskDescription,
    accessMode: 'read-only-analysis',
    ...(adapter !== undefined ? { cli: adapter.providerId } : {}),
    ...(input.relevantFiles !== undefined ? { relevantFiles: input.relevantFiles } : {}),
    ...(inlinedArtifacts !== undefined ? { inlinedArtifacts } : {}),
    ...(input.learnings !== undefined ? { learnings: input.learnings } : {}),
  });
}

function preflightCodexArtifacts(
  entries: readonly AgentPlanEntry[],
  adapters: ReadonlyMap<AgentPlanEntry, IModelAdapter>,
  relevantFiles?: readonly string[]
): { ok: true; value: string | undefined } | { ok: false; error: string } {
  if (relevantFiles === undefined || relevantFiles.length === 0) {
    return { ok: true, value: undefined };
  }
  const hasCodex = entries.some((entry) => {
    const adapter = adapters.get(entry);
    return adapter !== undefined && isCodexTransport(adapter.providerId);
  });
  if (!hasCodex) return { ok: true, value: undefined };
  const inlined = inlineWorkerArtifacts(relevantFiles);
  if (!inlined.ok) {
    return {
      ok: false,
      error: `unsupported inline delivery: worker transport lacks permitted artifact reader (${inlined.error})`,
    };
  }
  return { ok: true, value: inlined.value };
}

async function preflightPromptBudgets(
  prompts: ReadonlyMap<AgentPlanEntry, string>,
  adapters: ReadonlyMap<AgentPlanEntry, IModelAdapter>,
  reserveBytes: number,
  signal?: AbortSignal
): Promise<string | undefined> {
  for (const [entry, prompt] of prompts) {
    const adapter = adapters.get(entry);
    if (adapter === undefined) return 'unsupported inline delivery: worker model unresolved';
    const reason = await checkExpandedPromptBudget(adapter, prompt, reserveBytes, signal);
    if (reason !== undefined) return reason;
  }
  return undefined;
}

export async function preflightWorkerPrompts(
  input: WorkerInputPreflight
): Promise<string | undefined> {
  const { entries, taskDescription, adapters, signal, relevantFiles } = input;
  if (entries.length === 0) return 'unsupported inline delivery: empty worker plan';

  const codexArtifacts = preflightCodexArtifacts(entries, adapters, relevantFiles);
  if (!codexArtifacts.ok) return codexArtifacts.error;

  const prompts = new Map<AgentPlanEntry, string>();
  for (const entry of entries) {
    const adapter = adapters.get(entry);
    const inlined =
      adapter !== undefined && isCodexTransport(adapter.providerId)
        ? codexArtifacts.value
        : undefined;
    const prepared = preparePreflightPrompt(entry, input, inlined);
    if (!prepared.ok) return prepared.error;
    if (isExpandedWorkerInput(taskDescription, entry.subTask))
      prompts.set(entry, prepared.value.prompt);
  }
  try {
    const warmTargets = [...prompts.keys()]
      .map((entry) => adapters.get(entry))
      .filter((adapter): adapter is IModelAdapter => adapter !== undefined);
    await warmModelMetadata(warmTargets, signal);
  } catch {
    return 'unsupported inline delivery: model metadata preflight failed';
  }
  const reserveBytes = entries.length > 1 ? (MAX_PRIOR_CONTEXT_CHARS + 1024) * 4 : 0;
  return preflightPromptBudgets(prompts, adapters, reserveBytes, signal);
}
