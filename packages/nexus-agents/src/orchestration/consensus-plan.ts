/**
 * nexus-agents/orchestration - Consensus Planning
 *
 * Dispatches planning tasks to multiple CLIs independently, then
 * synthesizes their plans identifying agreement areas and divergences.
 * Claude excels at architecture reasoning, Codex at implementation
 * details, Gemini at broad context.
 *
 * @module orchestration/consensus-plan
 * (Source: Issue #863 — Consensus planning mode)
 */

import type { Result, ILogger } from '../core/index.js';
import { ok, err, createLogger, getTimeProvider } from '../core/index.js';
import type { ICliAdapter, CliName, CliResponse, CliError } from '../cli-adapters/types.js';
import { getOutcomeStore } from './outcomes/index.js';
import type {
  CliPlan,
  CliPlanPartition,
  AgreedStep,
  Divergence,
  ConsensusPlanResult,
  ConsensusPlanConfig,
  PlanStep,
  PlanRisk,
} from './consensus-plan-types.js';
import { createDefaultPlanConfig, PlanStepSchema, PlanRiskSchema } from './consensus-plan-types.js';

// ============================================================================
// Public API
// ============================================================================

/** Options for executeConsensusPlan. */
export interface PlanOptions {
  readonly config?: Partial<ConsensusPlanConfig>;
  readonly logger?: ILogger;
}

/**
 * Dispatches a planning task to multiple CLIs and synthesizes their plans.
 *
 * @param task - The planning/architecture task description
 * @param adapters - Map of available CLI adapters
 * @param options - Optional configuration
 * @returns Consensus plan result with agreements and divergences
 */
export async function executeConsensusPlan(
  task: string,
  adapters: ReadonlyMap<CliName, ICliAdapter>,
  options?: PlanOptions
): Promise<Result<ConsensusPlanResult, Error>> {
  const logger = options?.logger ?? createLogger({ component: 'consensus-plan' });
  const config = { ...createDefaultPlanConfig(), ...options?.config };

  const selectedClis = selectPlanClis(adapters, config.maxClis);
  if (selectedClis.length === 0) {
    return err(new Error('No CLI adapters available for planning'));
  }

  logger.info('Starting consensus planning', {
    clis: selectedClis.map((s) => s.cli),
    taskLength: task.length,
  });

  const startTime = getTimeProvider().now();
  const partitions = await dispatchPlans(task, selectedClis, config, logger);
  const totalDurationMs = getTimeProvider().now() - startTime;
  const clisUsed = partitions.filter((p) => p.success).map((p) => p.cli);
  const successPlans = partitions.filter((p) => p.success && p.plan !== null);

  const { agreedSteps, divergences } = synthesize(successPlans);
  const risks = collectRisks(successPlans);
  const alternatives = collectAlternatives(successPlans);
  const summary = buildPlanSummary(agreedSteps, divergences, clisUsed);

  recordPlanOutcomes(partitions);

  const result: ConsensusPlanResult = {
    partitions,
    agreedSteps,
    divergences,
    risks,
    alternatives,
    summary,
    clisUsed,
    totalDurationMs,
  };

  logger.info('Consensus planning completed', {
    totalDurationMs,
    clisUsed,
    agreedSteps: agreedSteps.length,
    divergences: divergences.length,
  });

  return ok(result);
}

// ============================================================================
// Internal Helpers
// ============================================================================

interface SelectedCli {
  readonly cli: CliName;
  readonly adapter: ICliAdapter;
}

/** Planning-preferred order: claude (reasoning), codex (impl), gemini (context). */
const PLAN_CLI_ORDER: readonly CliName[] = ['claude', 'codex', 'gemini'];

function selectPlanClis(
  adapters: ReadonlyMap<CliName, ICliAdapter>,
  maxCount: number
): readonly SelectedCli[] {
  const selected: SelectedCli[] = [];
  for (const cli of PLAN_CLI_ORDER) {
    if (selected.length >= maxCount) break;
    const adapter = adapters.get(cli);
    if (adapter !== undefined) {
      selected.push({ cli, adapter });
    }
  }
  return selected;
}

function buildPlanPrompt(task: string, cli: CliName): string {
  const perspectives: Record<CliName, string> = {
    claude: 'Focus on: architectural trade-offs, design patterns, risk assessment.',
    codex: 'Focus on: implementation steps, dependency management, testing strategy.',
    gemini: 'Focus on: broad context, alternative approaches, documentation needs.',
  };

  return [
    `You are creating an implementation plan. ${perspectives[cli]}`,
    '',
    'Return a JSON object with this structure:',
    '{ "steps": [{ "description": "...", "complexity": "low"|"medium"|"high", "dependencies": [] }],',
    '  "risks": [{ "description": "...", "impact": "low"|"medium"|"high", "mitigation": "..." }],',
    '  "alternatives": ["alternative approach 1", "alternative approach 2"],',
    '  "summary": "executive summary of the plan" }',
    '',
    `Task: ${task}`,
    '',
    'Return ONLY valid JSON. No markdown fences.',
  ].join('\n');
}

async function dispatchPlans(
  task: string,
  selectedClis: readonly SelectedCli[],
  config: ConsensusPlanConfig,
  logger: ILogger
): Promise<readonly CliPlanPartition[]> {
  const promises = selectedClis.map(async ({ cli, adapter }): Promise<CliPlanPartition> => {
    const startTime = getTimeProvider().now();
    const prompt = buildPlanPrompt(task, cli);

    try {
      const result: Result<CliResponse, CliError> = await Promise.race([
        adapter.execute({ content: prompt }),
        createPlanTimeout(config.perCliTimeoutMs, cli),
      ]);

      const durationMs = getTimeProvider().now() - startTime;

      if (!result.ok) {
        logger.warn('Plan CLI failed', { cli, error: result.error.message });
        return {
          cli,
          success: false,
          plan: null,
          rawOutput: '',
          durationMs,
          error: result.error.message,
        };
      }

      const rawOutput = result.value.text.slice(0, config.maxOutputCharsPerCli);
      const plan = parsePlan(rawOutput);
      const model = result.value.model;

      return model !== undefined
        ? { cli, success: true, plan, rawOutput, durationMs, model }
        : { cli, success: true, plan, rawOutput, durationMs };
    } catch (error) {
      const durationMs = getTimeProvider().now() - startTime;
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('Plan CLI threw', { cli, error: message });
      return { cli, success: false, plan: null, rawOutput: '', durationMs, error: message };
    }
  });

  return Promise.all(promises);
}

function createPlanTimeout(ms: number, cli: CliName): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Plan timeout after ${String(ms)}ms for ${cli}`));
    }, ms);
  });
}

/** Parses CLI output into a structured plan. */
function parsePlan(text: string): CliPlan | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch === null) return null;

    const parsed: unknown = JSON.parse(jsonMatch[0]);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const obj = parsed as Record<string, unknown>;
    return {
      steps: parseSteps(obj.steps),
      risks: parseRisks(obj.risks),
      alternatives: parseStrings(obj.alternatives),
      summary: typeof obj.summary === 'string' ? obj.summary : '',
    };
  } catch {
    return null;
  }
}

function parseSteps(raw: unknown): PlanStep[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => PlanStepSchema.safeParse(item))
    .filter((r) => r.success)
    .map((r) => r.data);
}

function parseRisks(raw: unknown): PlanRisk[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => PlanRiskSchema.safeParse(item))
    .filter((r) => r.success)
    .map((r) => r.data);
}

function parseStrings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === 'string');
}

// ============================================================================
// Synthesis
// ============================================================================

interface SynthesisResult {
  readonly agreedSteps: readonly AgreedStep[];
  readonly divergences: readonly Divergence[];
}

/** Synthesizes multiple plans, identifying agreements and divergences. */
function synthesize(successPlans: readonly CliPlanPartition[]): SynthesisResult {
  if (successPlans.length <= 1) {
    return singlePlanSynthesis(successPlans);
  }

  const agreedSteps = findAgreedSteps(successPlans);
  const divergences = findDivergences(successPlans);

  return { agreedSteps, divergences };
}

function singlePlanSynthesis(plans: readonly CliPlanPartition[]): SynthesisResult {
  if (plans.length === 0) return { agreedSteps: [], divergences: [] };

  const partition = plans[0];
  const cliPlan = partition?.plan;
  if (partition === undefined || cliPlan === null || cliPlan === undefined) {
    return { agreedSteps: [], divergences: [] };
  }

  const agreedSteps: AgreedStep[] = cliPlan.steps.map((step) => ({
    description: step.description,
    proposedBy: [partition.cli],
  }));

  return { agreedSteps, divergences: [] };
}

/**
 * Finds steps that appear in multiple plans using simple keyword overlap.
 * Steps with >50% word overlap are considered "agreed".
 */
function findAgreedSteps(plans: readonly CliPlanPartition[]): AgreedStep[] {
  const allSteps: Array<{ step: PlanStep; cli: CliName }> = [];
  for (const p of plans) {
    if (p.plan === null) continue;
    for (const step of p.plan.steps) {
      allSteps.push({ step, cli: p.cli });
    }
  }

  const groups: AgreedStep[] = [];

  for (const { step, cli } of allSteps) {
    const match = groups.find((g) => stepsOverlap(g.description, step.description));
    if (match !== undefined) {
      if (!match.proposedBy.includes(cli)) {
        const idx = groups.indexOf(match);
        groups[idx] = {
          description: match.description,
          proposedBy: [...match.proposedBy, cli],
        };
      }
    } else {
      groups.push({ description: step.description, proposedBy: [cli] });
    }
  }

  // Only return steps agreed by 2+ CLIs, followed by single-CLI steps
  return groups.sort((a, b) => b.proposedBy.length - a.proposedBy.length);
}

/** Simple word-overlap check for step similarity. */
function stepsOverlap(a: string, b: string): boolean {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  const smaller = Math.min(wordsA.size, wordsB.size);
  if (smaller === 0) return false;

  let overlap = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) overlap++;
  }

  return overlap / smaller > 0.5;
}

/** Finds divergence points between plans. */
function findDivergences(plans: readonly CliPlanPartition[]): Divergence[] {
  const divergences: Divergence[] = [];

  // Compare step counts
  const stepCounts = plans
    .filter((p) => p.plan !== null)
    .map((p) => ({ cli: p.cli, count: p.plan?.steps.length ?? 0 }));

  const counts = stepCounts.map((s) => s.count);
  const minSteps = Math.min(...counts);
  const maxSteps = Math.max(...counts);

  if (maxSteps > minSteps * 1.5 && minSteps > 0) {
    const positions = new Map<CliName, string>();
    for (const s of stepCounts) {
      positions.set(s.cli, `${String(s.count)} steps`);
    }
    divergences.push({ topic: 'Plan granularity', positions });
  }

  // Compare risk assessments
  const riskCounts = plans
    .filter((p) => p.plan !== null)
    .map((p) => ({ cli: p.cli, count: p.plan?.risks.length ?? 0 }));

  const highRiskClis = riskCounts.filter((r) => r.count > 0);
  const noRiskClis = riskCounts.filter((r) => r.count === 0);

  if (highRiskClis.length > 0 && noRiskClis.length > 0) {
    const positions = new Map<CliName, string>();
    for (const r of riskCounts) {
      positions.set(
        r.cli,
        r.count > 0 ? `${String(r.count)} risks identified` : 'No risks identified'
      );
    }
    divergences.push({ topic: 'Risk assessment', positions });
  }

  return divergences;
}

function collectRisks(plans: readonly CliPlanPartition[]): PlanRisk[] {
  const all: PlanRisk[] = [];
  for (const p of plans) {
    if (p.plan !== null) {
      all.push(...p.plan.risks);
    }
  }
  // Simple dedup by description prefix
  const seen = new Set<string>();
  return all.filter((r) => {
    const key = r.description.slice(0, 50).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function collectAlternatives(plans: readonly CliPlanPartition[]): string[] {
  const all: string[] = [];
  for (const p of plans) {
    if (p.plan !== null) {
      all.push(...p.plan.alternatives);
    }
  }
  return [...new Set(all)];
}

// ============================================================================
// Summary
// ============================================================================

function buildPlanSummary(
  agreedSteps: readonly AgreedStep[],
  divergences: readonly Divergence[],
  clisUsed: readonly CliName[]
): string {
  if (clisUsed.length === 0) {
    return 'All planning CLIs failed. No plan to synthesize.';
  }

  const multiAgreed = agreedSteps.filter((s) => s.proposedBy.length > 1).length;
  const totalSteps = agreedSteps.length;

  const lines = [
    `## Consensus Plan (${String(clisUsed.length)} CLIs)`,
    '',
    `**${String(totalSteps)} steps** (${String(multiAgreed)} agreed by multiple CLIs)`,
  ];

  if (divergences.length > 0) {
    lines.push(`**${String(divergences.length)} divergence(s)** identified`);
  }

  lines.push('', `CLIs: ${clisUsed.join(', ')}`);

  return lines.join('\n');
}

// ============================================================================
// Outcome Recording
// ============================================================================

function recordPlanOutcomes(partitions: readonly CliPlanPartition[]): void {
  try {
    const store = getOutcomeStore();
    for (const p of partitions) {
      store.append({
        id: `cpn-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`,
        cli: p.cli,
        category: 'planning',
        model: p.model ?? 'unknown',
        success: p.success,
        durationMs: p.durationMs,
        timestamp: new Date(getTimeProvider().now()).toISOString(),
        source: 'delegate',
      });
    }
  } catch {
    // Best-effort
  }
}
