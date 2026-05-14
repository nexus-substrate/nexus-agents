/**
 * nexus-agents/mcp - Supply Chain Tradeoff Panel Tool (#2294, child of #2293)
 *
 * Wraps the consensus voter infrastructure with a structured per-axis
 * tradeoff schema for engineering decisions (build-vs-buy, dependency
 * adoption, supply-chain risk). The default axes
 * (build_time_determinism / supply_chain_risk / update_cadence) match the
 * common shape of dependency / catalog / vendor decisions; custom axes
 * are accepted for one-off questions.
 *
 * Why this and not plain consensus_vote: a single approve/reject masks
 * legitimate tradeoffs. A dependency might be a clear win on update
 * cadence and a clear loss on supply-chain risk — surface those axes
 * explicitly so the consumer can act on them.
 *
 * @module mcp/tools/supply-chain-tradeoff-panel
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger, formatZodError, getErrorMessage } from '../../core/index.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import {
  toolStructuredError,
  toolSuccess,
  type BaseMcpToolDeps,
  type ToolResult,
} from './tool-result.js';
import type { VoterRole, AgentVoteResult } from '../../cli/vote-types.js';
import { collectRealVotes } from '../../cli/voter-agents.js';
import { getToolAnnotations } from '../tool-annotations.js';

// ============================================================================
// Constants
// ============================================================================

/** Default 3-axis schema covering the common engineering-tradeoff shape. */
export const DEFAULT_AXES: readonly string[] = [
  'build_time_determinism',
  'supply_chain_risk',
  'update_cadence',
];

/** Hard cap on axis count to keep voter prompts tractable. */
export const MAX_AXES = 6;
/** Hard cap on per-axis name length. */
export const MAX_AXIS_NAME_LENGTH = 64;
/** Hard cap on proposal text. */
export const MAX_PROPOSAL_LENGTH = 4000;
/** Hard cap on optional context text. */
export const MAX_CONTEXT_LENGTH = 4000;

/** 7-role default panel (matches consensus_vote's default). */
export const FULL_PANEL: readonly VoterRole[] = [
  'architect',
  'security',
  'devex',
  'ai_ml',
  'pm',
  'catfish',
  'scope_steward',
];

/** 3-role quick panel — same as consensus_vote's quickMode. */
export const QUICK_PANEL: readonly VoterRole[] = ['architect', 'security', 'scope_steward'];

// ============================================================================
// Types
// ============================================================================

export const SupplyChainTradeoffPanelInputSchema = z.object({
  proposal: z
    .string()
    .min(1)
    .max(MAX_PROPOSAL_LENGTH)
    .describe('The proposal under tradeoff review (e.g. "Should aegis-boot adopt cargo-nextest?")'),
  axes: z
    .array(z.string().min(1).max(MAX_AXIS_NAME_LENGTH))
    .min(1)
    .max(MAX_AXES)
    .optional()
    .describe(
      `Tradeoff axes to evaluate. Default: ${DEFAULT_AXES.join(', ')}. Custom axes accepted; max ${String(MAX_AXES)}.`
    ),
  context: z
    .string()
    .max(MAX_CONTEXT_LENGTH)
    .optional()
    .describe(
      'Optional context: relevant repo state, dependency tree, vendor publishing patterns, etc.'
    ),
  quickMode: z
    .boolean()
    .optional()
    .default(false)
    .describe('Use 3 voters (architect, security, scope_steward) instead of 7'),
  simulate: z.boolean().optional().default(false).describe('Use simulated voters (testing only)'),
});

export type SupplyChainTradeoffPanelInput = z.infer<typeof SupplyChainTradeoffPanelInputSchema>;

export type AxisDecision = 'approve' | 'reject' | 'mixed' | 'unknown';
export type PanelDecision = 'approve' | 'reject' | 'mixed';

export interface AxisVerdict {
  readonly axis: string;
  readonly decision: AxisDecision;
  readonly confidence: number;
  readonly approveCount: number;
  readonly rejectCount: number;
  readonly abstainCount: number;
  readonly summary: string;
  readonly supportingVoters: readonly string[];
}

export interface PanelVote {
  readonly role: VoterRole;
  readonly overallDecision: 'approve' | 'reject' | 'abstain';
  readonly axisVotes: Record<
    string,
    { decision: 'approve' | 'reject' | 'abstain'; reason: string }
  >;
  readonly reasoning: string;
  readonly source: 'llm' | 'simulation' | 'error';
  readonly cli?: string | undefined;
  readonly errorMessage?: string;
}

export interface SupplyChainTradeoffPanelResponse {
  readonly proposal: string;
  readonly axes: readonly string[];
  readonly decision: PanelDecision;
  readonly axisVerdicts: readonly AxisVerdict[];
  readonly recommendation: string;
  readonly votes: readonly PanelVote[];
  readonly voterErrors: number;
  readonly durationMs: number;
}

export type SupplyChainTradeoffPanelDeps = BaseMcpToolDeps;

// ============================================================================
// Proposal Construction
// ============================================================================

/**
 * Builds the structured proposal text passed to voters. Asks each voter to
 * emit a JSON block with per-axis verdicts so the aggregator can reason
 * per-axis instead of mashing everything into a single approve/reject.
 */
export function buildTradeoffProposal(input: SupplyChainTradeoffPanelInput): string {
  const axes = input.axes ?? DEFAULT_AXES;
  const parts: string[] = [];
  parts.push(`# Supply-Chain Tradeoff Review\n\n`);
  parts.push(`**Proposal:** ${input.proposal}\n`);
  if (input.context !== undefined && input.context !== '') {
    parts.push(`\n**Context:**\n${input.context}\n`);
  }
  parts.push(`\n## Axes\n\nEvaluate the proposal along EACH of these axes independently:\n`);
  for (const axis of axes) parts.push(`- \`${axis}\`\n`);
  parts.push(`\n## Your task\n\n`);
  parts.push(
    `For each axis, decide approve / reject / abstain with a one-line reason. ` +
      `It is normal — and expected — for the verdict to differ across axes ` +
      `(a proposal can be a win on update cadence and a loss on supply-chain risk).\n\n`
  );
  parts.push(`After your reasoning, emit a JSON block with this exact shape:\n\n`);
  parts.push('```json\n');
  parts.push('{\n  "axes": {\n');
  axes.forEach((axis, idx) => {
    const comma = idx < axes.length - 1 ? ',' : '';
    parts.push(`    "${axis}": {"decision": "approve|reject|abstain", "reason": "..."}${comma}\n`);
  });
  parts.push('  }\n}\n');
  parts.push('```\n\n');
  parts.push(
    `Your overall vote (approve/reject/abstain) should reflect: approve if MOST axes ` +
      `are approve; reject if any axis is a strong reject; abstain otherwise.\n`
  );
  return parts.join('');
}

// ============================================================================
// Per-Axis Parsing
// ============================================================================

/** Extracts the first JSON block from a voter's reasoning text. */
function extractJsonBlock(reasoning: string): string | undefined {
  const fenced = /```json\s*\n([\s\S]*?)\n```/.exec(reasoning);
  if (fenced !== null) return fenced[1];
  // Fallback: find first balanced { ... } that mentions "axes"
  const start = reasoning.indexOf('{');
  if (start === -1) return undefined;
  let depth = 0;
  for (let i = start; i < reasoning.length; i++) {
    if (reasoning[i] === '{') depth++;
    else if (reasoning[i] === '}') {
      depth--;
      if (depth === 0) {
        const candidate = reasoning.slice(start, i + 1);
        if (candidate.includes('axes') || candidate.includes('axis')) return candidate;
      }
    }
  }
  return undefined;
}

interface ParsedAxisEntry {
  decision: 'approve' | 'reject' | 'abstain';
  reason: string;
}

function isValidAxisDecision(d: unknown): d is 'approve' | 'reject' | 'abstain' {
  return d === 'approve' || d === 'reject' || d === 'abstain';
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function resolveAxesContainer(parsed: unknown): Record<string, unknown> | undefined {
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const root = parsed as { axes?: unknown };
  const axesObj = root.axes ?? parsed;
  if (typeof axesObj !== 'object') return undefined;
  return axesObj as Record<string, unknown>;
}

function parseSingleAxisEntry(entry: unknown): ParsedAxisEntry | undefined {
  if (typeof entry !== 'object' || entry === null) return undefined;
  const e = entry as { decision?: unknown; reason?: unknown };
  if (!isValidAxisDecision(e.decision)) return undefined;
  return { decision: e.decision, reason: typeof e.reason === 'string' ? e.reason : '' };
}

/** Parses per-axis verdicts from a voter's reasoning. Returns empty record on parse failure. */
export function parseAxisVerdicts(
  reasoning: string,
  axes: readonly string[]
): Record<string, ParsedAxisEntry> {
  const block = extractJsonBlock(reasoning);
  if (block === undefined) return {};
  const parsed = safeJsonParse(block);
  const container = resolveAxesContainer(parsed);
  if (container === undefined) return {};
  const out: Record<string, ParsedAxisEntry> = {};
  for (const axis of axes) {
    const entry = parseSingleAxisEntry(container[axis]);
    if (entry !== undefined) out[axis] = entry;
  }
  return out;
}

// ============================================================================
// Aggregation
// ============================================================================

/** Aggregates a single axis across all voters into one verdict. */
export function aggregateAxis(axis: string, votes: readonly PanelVote[]): AxisVerdict {
  const valid = votes.filter((v) => v.source !== 'error' && axis in v.axisVotes);
  let approveCount = 0;
  let rejectCount = 0;
  let abstainCount = 0;
  const supporters: string[] = [];
  const reasons: string[] = [];
  for (const v of valid) {
    const entry = v.axisVotes[axis];
    if (entry === undefined) continue;
    if (entry.decision === 'approve') {
      approveCount++;
      supporters.push(v.role);
    } else if (entry.decision === 'reject') {
      rejectCount++;
    } else {
      abstainCount++;
    }
    if (entry.reason !== '') reasons.push(`${v.role}: ${entry.reason}`);
  }
  const decision = decideAxis(approveCount, rejectCount, abstainCount);
  const total = approveCount + rejectCount + abstainCount;
  const confidence = total === 0 ? 0 : Math.max(approveCount, rejectCount) / total;
  return {
    axis,
    decision,
    confidence,
    approveCount,
    rejectCount,
    abstainCount,
    summary: reasons.slice(0, 3).join(' | '),
    supportingVoters: supporters,
  };
}

function decideAxis(approve: number, reject: number, abstain: number): AxisDecision {
  const total = approve + reject + abstain;
  if (total === 0) return 'unknown';
  if (approve > reject && approve > abstain) return 'approve';
  if (reject > approve && reject > abstain) return 'reject';
  if (approve === reject && approve > 0) return 'mixed';
  return 'mixed';
}

/** Final panel decision: approve only if ALL axes approve; reject if ANY axis rejects; mixed otherwise. */
export function aggregatePanel(verdicts: readonly AxisVerdict[]): PanelDecision {
  if (verdicts.length === 0) return 'mixed';
  const allApprove = verdicts.every((v) => v.decision === 'approve');
  if (allApprove) return 'approve';
  const anyReject = verdicts.some((v) => v.decision === 'reject');
  if (anyReject) return 'reject';
  return 'mixed';
}

/** Builds a one-line recommendation from the aggregated verdicts. */
export function buildRecommendation(
  decision: PanelDecision,
  verdicts: readonly AxisVerdict[]
): string {
  if (decision === 'approve') {
    return `Approve: all ${String(verdicts.length)} axes approve.`;
  }
  if (decision === 'reject') {
    const blockers = verdicts
      .filter((v) => v.decision === 'reject')
      .map((v) => v.axis)
      .join(', ');
    return `Reject: blocking concerns on ${blockers}.`;
  }
  const wins = verdicts.filter((v) => v.decision === 'approve').map((v) => v.axis);
  const losses = verdicts
    .filter((v) => v.decision === 'reject' || v.decision === 'mixed' || v.decision === 'unknown')
    .map((v) => v.axis);
  return `Mixed: wins on ${wins.join(', ') || '(none)'}; concerns on ${losses.join(', ') || '(none)'}. Apply judgment.`;
}

// ============================================================================
// Vote Mapping
// ============================================================================

function toPanelVote(result: AgentVoteResult, axes: readonly string[]): PanelVote {
  const axisVotes = parseAxisVerdicts(result.vote.reasoning, axes);
  return {
    role: result.role,
    overallDecision: result.vote.decision,
    axisVotes,
    reasoning: result.vote.reasoning,
    source: result.source,
    cli: result.cli,
    ...(result.error !== undefined && { errorMessage: result.error }),
  };
}

// ============================================================================
// Handler
// ============================================================================

async function tradeoffPanelHandler(args: unknown, ctx: HandlerContext): Promise<ToolResult> {
  const parsed = SupplyChainTradeoffPanelInputSchema.safeParse(args);
  if (!parsed.success) {
    return toolStructuredError({
      errorCategory: 'validation',
      message: `Validation error: ${formatZodError(parsed.error)}`,
    });
  }
  const input = parsed.data;
  const axes = input.axes ?? DEFAULT_AXES;
  const roles = input.quickMode ? QUICK_PANEL : FULL_PANEL;
  const start = Date.now();

  try {
    const proposal = buildTradeoffProposal(input);
    const voteResults = await collectRealVotes({
      roles,
      proposal,
      simulate: input.simulate,
      logger: ctx.logger,
    });

    const votes = voteResults.map((r) => toPanelVote(r, axes));
    const axisVerdicts = axes.map((a) => aggregateAxis(a, votes));
    const decision = aggregatePanel(axisVerdicts);
    const recommendation = buildRecommendation(decision, axisVerdicts);
    const voterErrors = votes.filter((v) => v.source === 'error').length;

    const response: SupplyChainTradeoffPanelResponse = {
      proposal: input.proposal,
      axes,
      decision,
      axisVerdicts,
      recommendation,
      votes,
      voterErrors,
      durationMs: Date.now() - start,
    };
    return toolSuccess(JSON.stringify(response, null, 2));
  } catch (error) {
    return toolStructuredError({
      errorCategory: 'internal',
      message: `Tradeoff panel failed: ${getErrorMessage(error)}`,
    });
  }
}

// ============================================================================
// Registration
// ============================================================================

/** @category MCP */
export function registerSupplyChainTradeoffPanelTool(
  server: McpServer,
  deps: SupplyChainTradeoffPanelDeps
): void {
  const logger = deps.logger ?? createLogger({ tool: 'supply_chain_tradeoff_panel' });
  const description =
    'Run a structured per-axis tradeoff vote on an engineering proposal (#2294). ' +
    'Default axes: build_time_determinism / supply_chain_risk / update_cadence. ' +
    'Voters answer EACH axis independently; aggregator surfaces per-axis verdicts ' +
    'so legitimate tradeoffs are not masked by a single approve/reject.';

  const secureHandler = createSecureHandler(tradeoffPanelHandler, {
    toolName: 'supply_chain_tradeoff_panel',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  const timeoutMs = getToolTimeout('supply_chain_tradeoff_panel', deps.security);
  const wrappedHandler = wrapToolWithTimeout('supply_chain_tradeoff_panel', secureHandler, {
    timeoutMs,
    logger,
  });

  server.registerTool(
    'supply_chain_tradeoff_panel',
    {
      description,
      inputSchema: SupplyChainTradeoffPanelInputSchema.shape,
      annotations: getToolAnnotations('supply_chain_tradeoff_panel'),
    },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered supply_chain_tradeoff_panel tool');
}
