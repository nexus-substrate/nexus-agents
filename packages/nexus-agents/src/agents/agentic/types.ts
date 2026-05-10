/**
 * Public type contracts for the agentic-adapter primitive (#2529).
 *
 * `IAgenticAdapter` is the multi-turn tool-use counterpart to
 * `IModelAdapter`'s single-shot `complete()`. Eval harnesses (and any
 * other consumer that needs an agent loop) drive their own toolset
 * and tool execution; the adapter handles model orchestration.
 *
 * @module agents/agentic/types
 */

import type { Result } from '../../core/result.js';
import type { ToolDefinition } from '../../core/types/model.js';

/**
 * Tool call emitted by the model.
 *
 * Mirrors the Anthropic Messages API `tool_use` ContentBlock shape;
 * the wrapper translates whatever the underlying provider produces
 * into this canonical form so harnesses don't care which provider
 * they're talking to.
 */
export interface ToolCall {
  /** Unique id for this tool call, threaded back through `tool_use_id`. */
  readonly id: string;
  /** Tool name (must match a `ToolDefinition.name` from the input). */
  readonly name: string;
  /** Arguments — already JSON-parsed; provider-side is responsible for parsing. */
  readonly arguments: Record<string, unknown>;
}

/**
 * Result of a tool call, returned by the harness's `onToolCall`.
 *
 * `content` is whatever string representation of the result the model
 * should see next turn. Convention: stringify objects, prefer one-line
 * for primitives. `isError` tells the model the call failed (Anthropic
 * surfaces this as `is_error: true` in the next turn's `tool_result`
 * block; other providers handle similarly).
 */
export interface ToolResult {
  readonly content: string;
  readonly isError?: boolean;
}

/**
 * One turn of the agent loop — model emits a tool call, harness
 * resolves it, harness records the trace.
 */
export interface AgentTurn {
  readonly turnIndex: number;
  readonly toolCall: ToolCall;
  readonly toolResult: ToolResult;
  /** Wall-clock time spent in the model API call that produced the tool call. */
  readonly modelLatencyMs: number;
  /** Wall-clock time spent waiting for `onToolCall` to resolve. */
  readonly toolLatencyMs: number;
  /** Provider-reported input tokens for this turn's API call (when available). */
  readonly inputTokens?: number;
  /** Provider-reported output tokens for this turn's API call (when available). */
  readonly outputTokens?: number;
}

/**
 * Why the agent loop stopped.
 *
 * - `agent-stopped`: model emitted no further tool calls — natural end
 * - `turn-budget`: hit `turnBudget` before the model finished
 * - `tool-error`: `onToolCall` threw; harness's responsibility to grade
 * - `cancelled`: external `AbortSignal` fired
 */
export type AgentStopReason = 'agent-stopped' | 'turn-budget' | 'tool-error' | 'cancelled';

/**
 * Final result of a successful `runAgent` call.
 *
 * `stopReason: 'agent-stopped' | 'turn-budget' | 'tool-error' | 'cancelled'`
 * is reported via the result, NOT via `Result.err` — partial-progress
 * runs are gradable, and the harness inspects `turns` to decide.
 */
export interface AgentRunResult {
  readonly turnsUsed: number;
  readonly stopReason: AgentStopReason;
  readonly turns: readonly AgentTurn[];
  /** Aggregated token usage across all turns (sum of per-turn inputs/outputs). */
  readonly totalInputTokens?: number;
  readonly totalOutputTokens?: number;
  /**
   * Provider-id stamp from the underlying `IModelAdapter` — operators
   * read this when comparing eval results across providers, since
   * tool-use fidelity is provider-dependent.
   */
  readonly providerId: string;
  /** Model-id stamp from the underlying `IModelAdapter`. */
  readonly modelId: string;
  /**
   * Strategy used to drive the loop. `native:<providerId>` when the
   * underlying adapter is a known provider whose tool-use API is being
   * threaded through; `wrapper` for unknown providers / custom adapters
   * where the loop relies only on the IModelAdapter contract surface.
   *
   * Eval harnesses record this so cross-provider runs are auditable.
   */
  readonly adapterStrategy: string;
  /**
   * The model's final assistant content (the response after the last
   * tool result, when the model emits no further tool call). Empty
   * string when the loop ended on `turn-budget` or `cancelled`.
   */
  readonly finalContent: string;
}

/**
 * Adapter-level errors that can't be recovered into a partial-progress
 * run. Tool errors and turn-budget are NOT here — they go to
 * `AgentRunResult.stopReason`.
 */
export class AgentError extends Error {
  public readonly causeData?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'AgentError';
    if (cause !== undefined) this.causeData = cause;
  }
}

/**
 * Arguments to `runAgent`.
 *
 * `onToolCall` is the harness's tool-router; the adapter awaits its
 * `Promise<ToolResult>` so synchronous and async harness execution
 * both work. Per-tool timeouts are the harness's responsibility (the
 * adapter doesn't impose one — see #2529 design notes).
 *
 * `onTurn` (optional) fires once after each turn completes, giving
 * operators incremental progress visibility.
 *
 * `signal` (optional) propagates external cancellation as
 * `stopReason: 'cancelled'`.
 */
export interface RunAgentArgs {
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly tools: readonly ToolDefinition[];
  /**
   * Maximum agent turns. When omitted, the adapter uses the resolved
   * model's `profile.maxRecommendedTurnBudget` (claude-opus = 20,
   * o-reasoning = 25, claude-haiku / gemini-flash = 8, defaults to 10).
   */
  readonly turnBudget?: number;
  readonly onToolCall: (call: ToolCall) => Promise<ToolResult>;
  readonly onTurn?: (turn: AgentTurn) => void;
  readonly signal?: AbortSignal;
  /** Sampling temperature passed through to `IModelAdapter.complete`. */
  readonly temperature?: number;
  /** Per-turn maxTokens passed through to `IModelAdapter.complete`. */
  readonly maxTokens?: number;
}

/**
 * The agentic-adapter contract. Single method; all the variability
 * lives in `RunAgentArgs`.
 */
export interface IAgenticAdapter {
  readonly providerId: string;
  readonly modelId: string;
  readonly adapterStrategy: string;
  runAgent(args: RunAgentArgs): Promise<Result<AgentRunResult, AgentError>>;
}
