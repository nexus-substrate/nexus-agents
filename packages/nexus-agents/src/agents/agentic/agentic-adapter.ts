/**
 * `AgenticAdapter` — multi-turn tool-use loop over any `IModelAdapter`.
 *
 * Rides on the existing `IModelAdapter.complete` contract:
 *   - request includes `tools: ToolDefinition[]`
 *   - response includes `content: ContentBlock[]` with `tool_use` blocks
 *   - `stopReason: 'tool_use'` signals "the model wants to call tools"
 *
 * Each concrete `IModelAdapter` (claude / openai / gemini / opencode /
 * openrouter / ...) is responsible for translating these into the
 * provider-native tool-use API. This adapter is provider-agnostic —
 * one implementation drives all of them.
 *
 * Provider-specialised adapters can land later if real fidelity gaps
 * surface (PR 2 in the #2529 plan); for v1 the wrapper-only path
 * exercises the contract end-to-end.
 *
 * Concurrency: a single `AgenticAdapter` instance is safe for
 * concurrent `runAgent()` calls. An optional `maxConcurrent` cap
 * gates the model API call (not the full loop — released during
 * tool execution), so harnesses running 100s of instances with a
 * rate-limited provider can throttle without serialising.
 *
 * @module agents/agentic/agentic-adapter
 */

import { ok, err } from '../../core/index.js';
import type {
  CompletionRequest,
  CompletionResponse,
  ContentBlock,
  IModelAdapter,
  Message,
  Result,
  ToolDefinition,
} from '../../core/index.js';

import {
  AgentError,
  type AgentRunResult,
  type AgentTurn,
  type IAgenticAdapter,
  type RunAgentArgs,
  type ToolCall,
  type ToolResult,
} from './types.js';

/** Providers we recognise — affects the `adapterStrategy` stamp on results. */
const KNOWN_NATIVE_PROVIDERS = new Set(['anthropic', 'openai', 'gemini', 'google']);

export interface AgenticAdapterOptions {
  /**
   * Maximum number of concurrent model API calls across all in-flight
   * `runAgent()` calls. Default unlimited. Set this when the upstream
   * provider rate-limits aggressively.
   */
  readonly maxConcurrent?: number;
}

export class AgenticAdapter implements IAgenticAdapter {
  readonly providerId: string;
  readonly modelId: string;
  readonly adapterStrategy: string;

  private readonly model: IModelAdapter;
  private readonly semaphore: Semaphore | null;

  constructor(modelAdapter: IModelAdapter, options: AgenticAdapterOptions = {}) {
    this.model = modelAdapter;
    this.providerId = modelAdapter.providerId;
    this.modelId = modelAdapter.modelId;
    this.adapterStrategy = KNOWN_NATIVE_PROVIDERS.has(modelAdapter.providerId)
      ? `native:${modelAdapter.providerId}`
      : 'wrapper';
    this.semaphore =
      options.maxConcurrent !== undefined && options.maxConcurrent > 0
        ? new Semaphore(options.maxConcurrent)
        : null;
  }

  async runAgent(args: RunAgentArgs): Promise<Result<AgentRunResult, AgentError>> {
    if (args.turnBudget <= 0) {
      return err(new AgentError(`turnBudget must be > 0, got ${String(args.turnBudget)}`));
    }
    const state: LoopState = {
      turns: [],
      totalInputTokens: 0,
      totalOutputTokens: 0,
      finalContent: '',
      messages: [{ role: 'user', content: args.userPrompt }],
    };

    while (state.turns.length < args.turnBudget) {
      if (args.signal?.aborted === true) {
        return ok(this.buildFromState(state, 'cancelled'));
      }
      const turnOutcome = await this.runOneTurn(args, state);
      if (turnOutcome.kind === 'error') return err(turnOutcome.error);
      if (turnOutcome.kind === 'stop') {
        return ok(this.buildFromState(state, turnOutcome.reason));
      }
      // turnOutcome.kind === 'continue' — loop iterates
    }

    return ok(this.buildFromState(state, 'turn-budget'));
  }

  /**
   * Run one model-call cycle: call → check for tool_use → execute tool
   * calls → append results. Returns one of three outcomes describing
   * whether the loop continues, stops naturally, or hit a model error.
   */
  private async runOneTurn(args: RunAgentArgs, state: LoopState): Promise<TurnOutcome> {
    const t0 = Date.now();
    const completion = await this.callModelGated({
      messages: state.messages,
      systemPrompt: args.systemPrompt,
      tools: [...args.tools] as ToolDefinition[],
      ...(args.temperature !== undefined && { temperature: args.temperature }),
      ...(args.maxTokens !== undefined && { maxTokens: args.maxTokens }),
    });
    const modelLatencyMs = Date.now() - t0;

    if (!completion.ok) {
      return {
        kind: 'error',
        error: new AgentError(
          `Model call failed at turn ${String(state.turns.length)}: ${completion.error.message}`,
          completion.error
        ),
      };
    }
    const response = completion.value;
    state.totalInputTokens += response.usage.inputTokens;
    state.totalOutputTokens += response.usage.outputTokens;

    const toolUses = response.content.filter(
      (c): c is Extract<ContentBlock, { type: 'tool_use' }> => c.type === 'tool_use'
    );
    if (toolUses.length === 0) {
      state.finalContent = extractFinalText(response.content);
      return { kind: 'stop', reason: 'agent-stopped' };
    }

    // Append the model's full assistant message so the next turn sees it.
    state.messages.push({ role: 'assistant', content: response.content });
    return this.processToolCalls(args, state, toolUses, response, modelLatencyMs);
  }

  private async processToolCalls(
    args: RunAgentArgs,
    state: LoopState,
    toolUses: readonly Extract<ContentBlock, { type: 'tool_use' }>[],
    response: CompletionResponse,
    modelLatencyMs: number
  ): Promise<TurnOutcome> {
    const toolResultBlocks: Extract<ContentBlock, { type: 'tool_result' }>[] = [];
    for (const toolUse of toolUses) {
      if (state.turns.length >= args.turnBudget) break;
      const outcome = await this.invokeToolAndRecord(
        args,
        state,
        toolUse,
        response,
        modelLatencyMs
      );
      if (outcome.kind === 'stop') return outcome;
      toolResultBlocks.push(outcome.toolResultBlock);
    }
    // Anthropic + OpenAI both expect tool_result blocks batched into a
    // single follow-up user message after a multi-tool_use assistant turn.
    if (toolResultBlocks.length > 0) {
      state.messages.push({ role: 'user', content: toolResultBlocks });
    }
    return { kind: 'continue' };
  }

  private async invokeToolAndRecord(
    args: RunAgentArgs,
    state: LoopState,
    toolUse: Extract<ContentBlock, { type: 'tool_use' }>,
    response: CompletionResponse,
    modelLatencyMs: number
  ): Promise<ToolOutcome> {
    const toolCall: ToolCall = {
      id: toolUse.id,
      name: toolUse.name,
      arguments: toolUse.input as Record<string, unknown>,
    };
    const tt0 = Date.now();
    try {
      const toolResult = await args.onToolCall(toolCall);
      return recordToolSuccess({
        args,
        state,
        toolUse,
        toolCall,
        toolResult,
        modelLatencyMs,
        toolLatencyMs: Date.now() - tt0,
        response,
      });
    } catch (caught: unknown) {
      const errTurn = buildTurn({
        turnIndex: state.turns.length,
        toolCall,
        toolResult: {
          content: caught instanceof Error ? caught.message : String(caught),
          isError: true,
        },
        modelLatencyMs,
        toolLatencyMs: Date.now() - tt0,
        response,
      });
      state.turns.push(errTurn);
      args.onTurn?.(errTurn);
      return { kind: 'stop', reason: 'tool-error' };
    }
  }

  private buildFromState(
    state: LoopState,
    stopReason: AgentRunResult['stopReason']
  ): AgentRunResult {
    return this.buildResult(
      state.turns,
      state.totalInputTokens,
      state.totalOutputTokens,
      stopReason,
      state.finalContent
    );
  }

  /**
   * Wrap `model.complete` in an optional concurrency gate. The
   * semaphore is held only across the model API call — released
   * before tool execution so harnesses doing slow tool calls don't
   * starve other concurrent `runAgent` calls.
   */
  private async callModelGated(
    request: CompletionRequest
  ): Promise<Result<CompletionResponse, Error>> {
    if (this.semaphore === null) {
      return this.model.complete(request);
    }
    await this.semaphore.acquire();
    try {
      return await this.model.complete(request);
    } finally {
      this.semaphore.release();
    }
  }

  private buildResult(
    turns: readonly AgentTurn[],
    totalInputTokens: number,
    totalOutputTokens: number,
    stopReason: AgentRunResult['stopReason'],
    finalContent: string
  ): AgentRunResult {
    return {
      turnsUsed: turns.length,
      stopReason,
      turns,
      ...(totalInputTokens > 0 && { totalInputTokens }),
      ...(totalOutputTokens > 0 && { totalOutputTokens }),
      providerId: this.providerId,
      modelId: this.modelId,
      adapterStrategy: this.adapterStrategy,
      finalContent,
    };
  }
}

/**
 * Per-runAgent loop state, threaded through the helper methods.
 * Keeps the public signature clean while each helper updates the
 * pieces it owns.
 */
interface LoopState {
  turns: AgentTurn[];
  totalInputTokens: number;
  totalOutputTokens: number;
  finalContent: string;
  messages: Message[];
}

type TurnOutcome =
  | { readonly kind: 'continue' }
  | { readonly kind: 'stop'; readonly reason: AgentRunResult['stopReason'] }
  | { readonly kind: 'error'; readonly error: AgentError };

type ToolOutcome =
  | {
      readonly kind: 'recorded';
      readonly toolResultBlock: Extract<ContentBlock, { type: 'tool_result' }>;
    }
  | { readonly kind: 'stop'; readonly reason: AgentRunResult['stopReason'] };

interface BuildTurnArgs {
  readonly turnIndex: number;
  readonly toolCall: ToolCall;
  readonly toolResult: ToolResult;
  readonly modelLatencyMs: number;
  readonly toolLatencyMs: number;
  readonly response: CompletionResponse;
}

/**
 * Common-success path: build the AgentTurn, record + announce it,
 * synthesise the tool_result ContentBlock for the next conversation
 * turn. Extracted to keep `invokeToolAndRecord` under the 50-line cap.
 */
interface RecordToolSuccessArgs {
  readonly args: RunAgentArgs;
  readonly state: LoopState;
  readonly toolUse: Extract<ContentBlock, { type: 'tool_use' }>;
  readonly toolCall: ToolCall;
  readonly toolResult: ToolResult;
  readonly modelLatencyMs: number;
  readonly toolLatencyMs: number;
  readonly response: CompletionResponse;
}

function recordToolSuccess(p: RecordToolSuccessArgs): ToolOutcome {
  const turn = buildTurn({
    turnIndex: p.state.turns.length,
    toolCall: p.toolCall,
    toolResult: p.toolResult,
    modelLatencyMs: p.modelLatencyMs,
    toolLatencyMs: p.toolLatencyMs,
    response: p.response,
  });
  p.state.turns.push(turn);
  p.args.onTurn?.(turn);
  return {
    kind: 'recorded',
    toolResultBlock: {
      type: 'tool_result',
      tool_use_id: p.toolUse.id,
      content: p.toolResult.content,
      ...(p.toolResult.isError === true && { is_error: true }),
    },
  };
}

function buildTurn(b: BuildTurnArgs): AgentTurn {
  return {
    turnIndex: b.turnIndex,
    toolCall: b.toolCall,
    toolResult: b.toolResult,
    modelLatencyMs: b.modelLatencyMs,
    toolLatencyMs: b.toolLatencyMs,
    inputTokens: b.response.usage.inputTokens,
    outputTokens: b.response.usage.outputTokens,
  };
}

function extractFinalText(content: readonly ContentBlock[]): string {
  return content
    .filter((c): c is Extract<ContentBlock, { type: 'text' }> => c.type === 'text')
    .map((c) => c.text)
    .join('\n')
    .trim();
}

/**
 * Minimal counting semaphore. Used to cap concurrent model API calls.
 *
 * Not exported — internal to the adapter. If a more sophisticated
 * primitive is needed (priorities, fairness, weighted permits), this
 * can graduate later.
 */
class Semaphore {
  private readonly waiters: Array<() => void> = [];
  private available: number;

  constructor(capacity: number) {
    this.available = capacity;
  }

  acquire(): Promise<void> {
    if (this.available > 0) {
      this.available -= 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  release(): void {
    const next = this.waiters.shift();
    if (next !== undefined) {
      next();
      return;
    }
    this.available += 1;
  }
}
