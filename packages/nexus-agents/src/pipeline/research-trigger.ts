/**
 * Research Trigger — Auto-create pipeline tasks from research discoveries (#1715)
 *
 * When research_discover finds high-quality papers/repos, this module
 * converts them into PipelineTask[] for the dev pipeline to assess.
 * Part of the Central Workflow Hub (#1711).
 *
 * @module pipeline/research-trigger
 */

import { createLogger } from '../core/index.js';
import { executeExpert } from './expert-bridge.js';
import type { PipelineTask } from './dev-pipeline.js';
import { getGapLedger } from '../core/task-analysis/capability-gap-ledger.js';
import type {
  ICapabilityGapLedger,
  GapSummary,
} from '../core/task-analysis/capability-gap-ledger.js';

const logger = createLogger({ component: 'research-trigger' });

/** Configuration for research trigger behavior. */
export interface ResearchTriggerConfig {
  /** Minimum quality score to trigger (0-10). Default: 7 */
  readonly qualityThreshold?: number | undefined;
  /** Max tasks per invocation. Default: 3 */
  readonly maxTriggers?: number | undefined;
  /** Topic filter for research_discover. */
  readonly topic?: string | undefined;
  /** Known task IDs to skip (dedup). */
  readonly existingTaskIds?: ReadonlySet<string> | undefined;
}

/** Default quality threshold — only high-quality papers trigger tasks. */
const DEFAULT_QUALITY_THRESHOLD = 7;

/** Default max triggers per invocation — prevents flooding. */
const DEFAULT_MAX_TRIGGERS = 3;

/** A discovered research item parsed from expert output. */
interface DiscoveredItem {
  readonly title: string;
  readonly quality: number;
  readonly source: string;
}

/** Parse expert output for discovered items with quality scores. */
function parseDiscoveries(text: string): DiscoveredItem[] {
  const items: DiscoveredItem[] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const match = /(?:quality|score)[:\s]*(\d+(?:\.\d+)?)/i.exec(line);
    if (match !== null) {
      const quality = parseFloat(match[1] as string);
      const title = line
        .replace(match[0], '')
        .replace(/\(\s*\)/g, '')
        .replace(/^[-*•\s]+/, '')
        .trim();
      if (title.length > 5) {
        items.push({ title, quality, source: 'research_discover' });
      }
    }
  }
  return items;
}

/** Generate a stable task ID from a title for dedup. */
function titleToId(title: string): string {
  return `research-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 50)}`;
}

/** Stable, dedup-friendly task id for a capability gap. */
function gapTaskId(gap: GapSummary): string {
  return `gap-${gap.type}-${gap.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

/** Configuration for capability-gap-driven task suggestions (#3576). */
export interface CapabilityGapTriggerConfig {
  /** Minimum times a gap must recur before it's suggested. Default: 3 ("three is a pattern"). */
  readonly minOccurrences?: number | undefined;
  /** Max tasks per invocation. Default: 3. */
  readonly maxTriggers?: number | undefined;
  /** Known task IDs to skip (dedup). */
  readonly existingTaskIds?: ReadonlySet<string> | undefined;
  /** Ledger to read (default: the process-wide shared ledger). */
  readonly ledger?: ICapabilityGapLedger | undefined;
}

/** Minimum recurrence before a gap is worth surfacing as a task. */
const DEFAULT_MIN_OCCURRENCES = 3;

/**
 * Title for a gap-derived task, phrased for the kind of gap it is.
 *
 * A registry gap asks for a capability to be *added*; a tool refusal asks for
 * an existing tool to be *extended*. Same ledger, different remedy.
 */
function gapTaskTitle(gap: GapSummary): string {
  if (gap.type === 'tool_refusal') {
    return `Extend capability: ${gap.name}`;
  }
  return `Build capability: ${gap.type} "${gap.name}"`;
}

/**
 * Description for a gap-derived task.
 *
 * Split by kind because the generic wording was routing-specific — "observed
 * Nx in routing decisions … route the goal through the MetaOrchestrator". A
 * tool refusal was not observed in a routing decision and that is not its
 * remedy, so the single phrasing would have made the loop's first real signal
 * produce a task that misdescribes its own evidence (#4651).
 *
 * Occurrence counts span sessions since the ledger became durable (#4645), so
 * the wording says so rather than letting a reader assume one run.
 */
function gapTaskDescription(gap: GapSummary): string {
  const examples = gap.exampleGoals.join('; ') || '(none recorded)';
  const seen = `observed ${String(gap.count)}x across sessions`;

  if (gap.type === 'tool_refusal') {
    return (
      `Auto-suggested from the capability-gap ledger (#4651): a tool ran and declined work it ` +
      `cannot do — ${seen}. Suggestion: ${gap.suggestion}. ` +
      `Example requests: ${examples}. ` +
      `Assess whether extending the tool is worth it; the count is the demand evidence.`
    );
  }

  return (
    `Auto-suggested from the capability-gap ledger (#3555): ${seen} in routing decisions. ` +
    `Suggestion: ${gap.suggestion}. ` +
    `Example goals: ${examples}. ` +
    `Assess whether to add this ${gap.type} (e.g. route the goal through the MetaOrchestrator, #3540).`
  );
}

/**
 * Convert recurring capability gaps (from the shared ledger, #3555) into
 * candidate pipeline tasks for a human/orchestrator to review. SUGGEST-ONLY:
 * builds task objects in memory; files/executes nothing. The human-gated front
 * of "gap → MetaOrchestrator" (#3540). Synchronous — the ledger is in-process.
 */
export function checkForCapabilityGapTriggers(
  config: CapabilityGapTriggerConfig = {}
): PipelineTask[] {
  const minOccurrences = config.minOccurrences ?? DEFAULT_MIN_OCCURRENCES;
  const maxTriggers = config.maxTriggers ?? DEFAULT_MAX_TRIGGERS;
  const existing = config.existingTaskIds ?? new Set<string>();
  const ledger = config.ledger ?? getGapLedger();

  const qualified = ledger
    .summarize()
    .filter((gap) => gap.count >= minOccurrences)
    .filter((gap) => !existing.has(gapTaskId(gap)));

  const tasks: PipelineTask[] = qualified.slice(0, maxTriggers).map((gap) => ({
    id: gapTaskId(gap),
    title: gapTaskTitle(gap),
    description: gapTaskDescription(gap),
    assignedTo: 'researcher' as const,
    status: 'pending' as const,
  }));

  if (tasks.length > 0) {
    logger.info('Capability-gap triggers created', {
      qualified: qualified.length,
      triggered: tasks.length,
    });
  }

  return tasks;
}

/**
 * Check for research discoveries and convert high-quality ones to pipeline tasks.
 *
 * Calls research_discover via expert-bridge, filters by quality threshold,
 * deduplicates against known tasks, and rate-limits output.
 *
 * Returns empty array when expert-bridge is unavailable (graceful degradation).
 */
export async function checkForResearchTriggers(
  config: ResearchTriggerConfig = {}
): Promise<PipelineTask[]> {
  const threshold = config.qualityThreshold ?? DEFAULT_QUALITY_THRESHOLD;
  const maxTriggers = config.maxTriggers ?? DEFAULT_MAX_TRIGGERS;
  const existing = config.existingTaskIds ?? new Set<string>();
  const topic = config.topic ?? 'multi-agent orchestration';

  try {
    const result = await executeExpert(
      'research',
      `Use research_discover to find recent papers and repos about "${topic}". ` +
        'For each result, include: title, quality score (1-10), and source URL.'
    );

    if (!result.success) {
      logger.debug('Research trigger: expert unavailable', { error: result.error });
      return [];
    }

    const discoveries = parseDiscoveries(result.text);
    const qualified = discoveries
      .filter((d) => d.quality >= threshold)
      .filter((d) => !existing.has(titleToId(d.title)));

    const tasks: PipelineTask[] = qualified.slice(0, maxTriggers).map((d) => ({
      id: titleToId(d.title),
      title: `Assess research: ${d.title}`,
      description:
        `Auto-triggered by research_discover (quality: ${String(d.quality)}/10).\n` +
        `Source: ${d.source}\n\nAssess this research for applicability to nexus-agents.`,
      assignedTo: 'researcher' as const,
      status: 'pending' as const,
    }));

    if (tasks.length > 0) {
      logger.info('Research triggers created', {
        total: discoveries.length,
        qualified: qualified.length,
        triggered: tasks.length,
      });
    }

    return tasks;
  } catch (error) {
    logger.debug('Research trigger failed gracefully', { error: String(error) });
    return [];
  }
}
