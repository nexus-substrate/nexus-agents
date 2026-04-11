/**
 * Adaptive Orchestrator — Task-driven pipeline selection (#1736, Phase 3)
 *
 * Analyzes incoming tasks, selects the appropriate pipeline template,
 * and executes via the graph pipeline runner. Single entry point
 * for all pipeline types.
 *
 * Design pattern: deterministic state machine backbone + selective
 * LLM invocation at decision nodes only (per CrewAI Flows / Temporal).
 *
 * @module pipeline/adaptive-orchestrator
 */

import { createLogger } from '../core/index.js';
import { runGraphPipeline } from './graph-pipeline-runner.js';
import type { GraphPipelineOptions, GraphPipelineResult } from './graph-pipeline-runner.js';
import { getTemplate, PIPELINE_TEMPLATES } from './templates.js';
import type { PipelineTemplate } from './stage-types.js';
import type { StageRegistry } from './pipeline-graph.js';
import { getOutcomeStore } from '../orchestration/outcomes/outcome-store.js';

const logger = createLogger({ component: 'adaptive-orchestrator' });

// ============================================================================
// Types
// ============================================================================

/** Options for the adaptive orchestrator. */
export interface AdaptiveOrchestratorOptions extends GraphPipelineOptions {
  /** Force a specific template (skip auto-detection). */
  readonly templateId?: string | undefined;
  /** Stage registry to use. If omitted, stages must be provided per-template. */
  readonly stages: StageRegistry;
}

/** Result of adaptive orchestration — extends GraphPipelineResult with metadata. */
export interface AdaptiveOrchestratorResult extends GraphPipelineResult {
  /** How the template was selected. */
  readonly selectionMethod: 'explicit' | 'auto-detected';
  /** Task classification used for selection. */
  readonly taskClassification: TaskClassification;
}

/** Classification of a task for template routing. */
export interface TaskClassification {
  readonly pipelineType: PipelineType;
  readonly complexity: 'simple' | 'moderate' | 'complex';
  readonly confidence: number;
  readonly keywords: readonly string[];
}

/** Pipeline type derived from task analysis. */
export type PipelineType = 'dev' | 'research' | 'audit' | 'greenfield' | 'general';

// ============================================================================
// Task Classification
// ============================================================================

/** Keyword sets for pipeline type detection. */
const PIPELINE_TYPE_KEYWORDS: Record<PipelineType, readonly string[]> = {
  dev: [
    'implement',
    'build',
    'create',
    'add feature',
    'fix bug',
    'refactor',
    'code',
    'function',
    'class',
    'module',
    'test',
    'write tests',
    'coverage',
  ],
  research: [
    'research',
    'investigate',
    'feasibility',
    'compare',
    'evaluate',
    'alternative',
    'landscape',
    'analysis',
    'study',
    'assess',
    'literature',
    'state of the art',
    'survey',
  ],
  audit: [
    'security',
    'audit',
    'vulnerability',
    'scan',
    'compliance',
    'penetration',
    'cve',
    'owasp',
    'threat model',
    'review',
    'inspect',
    'check',
    'posture',
    'hardening',
  ],
  greenfield: [
    'new project',
    'from scratch',
    'scaffold',
    'bootstrap',
    'create repo',
    'greenfield',
    'project spec',
    'spec file',
    'starter',
    'initialize',
  ],
  general: [],
};

/** Complexity keywords. */
const COMPLEXITY_KEYWORDS = {
  complex: [
    'comprehensive',
    'system-wide',
    'architecture',
    'entire',
    'deep analysis',
    'all files',
    'codebase',
    'enterprise',
  ],
  simple: ['simple', 'quick', 'small', 'brief', 'single', 'one function', 'minor', 'typo'],
};

/** Classify a task for pipeline routing. */
export function classifyTask(task: string): TaskClassification {
  const lower = task.toLowerCase();
  const scores = calculateTypeScores(lower);
  const pipelineType = selectBestType(scores);
  const complexity = estimateComplexity(lower);
  const maxScore = Math.max(...Object.values(scores), 1);
  const keywords = extractMatchedKeywords(lower, pipelineType);

  return {
    pipelineType,
    complexity,
    confidence: Math.min(1, maxScore / 3),
    keywords,
  };
}

/** Calculate match scores for each pipeline type. */
function calculateTypeScores(lower: string): Record<PipelineType, number> {
  const scores: Record<PipelineType, number> = {
    dev: 0,
    research: 0,
    audit: 0,
    greenfield: 0,
    general: 0,
  };
  for (const [type, keywords] of Object.entries(PIPELINE_TYPE_KEYWORDS)) {
    scores[type as PipelineType] = keywords.filter((kw) => lower.includes(kw)).length;
  }
  return scores;
}

/** Select the pipeline type with the highest score. */
function selectBestType(scores: Record<PipelineType, number>): PipelineType {
  let best: PipelineType = 'dev';
  let bestScore = 0;
  for (const [type, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      best = type as PipelineType;
    }
  }
  // Zero-confidence → general template (includes security gate — fail-safe)
  return bestScore === 0 ? 'general' : best;
}

/** Estimate task complexity from keywords. */
function estimateComplexity(lower: string): 'simple' | 'moderate' | 'complex' {
  if (COMPLEXITY_KEYWORDS.complex.some((kw) => lower.includes(kw))) return 'complex';
  if (COMPLEXITY_KEYWORDS.simple.some((kw) => lower.includes(kw))) return 'simple';
  return 'moderate';
}

/** Extract matched keywords for the selected pipeline type. */
function extractMatchedKeywords(lower: string, type: PipelineType): string[] {
  const keywords = PIPELINE_TYPE_KEYWORDS[type];
  return keywords.filter((kw) => lower.includes(kw));
}

// ============================================================================
// Orchestration
// ============================================================================

/**
 * Run the adaptive orchestrator — classify task, select template, execute.
 *
 * This is the single entry point for all pipeline execution.
 */
export async function runAdaptiveOrchestrator(
  task: string,
  options: AdaptiveOrchestratorOptions
): Promise<AdaptiveOrchestratorResult> {
  const classification = classifyTask(task);

  // Template selection: explicit override or auto-detected
  const templateId = options.templateId ?? classification.pipelineType;
  const selectionMethod = options.templateId !== undefined ? 'explicit' : 'auto-detected';
  const template = resolveTemplate(templateId);

  logger.info('Adaptive orchestrator routing', {
    templateId: template.id,
    selectionMethod,
    classification: classification.pipelineType,
    complexity: classification.complexity,
    confidence: classification.confidence,
  });

  // Execute via graph pipeline runner
  const result = await runGraphPipeline(task, template, options.stages, options);

  // Record outcome for future routing adjustments
  recordPipelineOutcome(template.id, classification, result.success);

  return { ...result, selectionMethod, taskClassification: classification };
}

// ============================================================================
// Helpers
// ============================================================================

/** Resolve template by ID, falling back to dev. */
function resolveTemplate(templateId: string): PipelineTemplate {
  const template = getTemplate(templateId);
  if (template !== undefined) return template;

  logger.warn('Unknown template, falling back to dev', { templateId });
  const fallback = PIPELINE_TEMPLATES.get('dev');
  if (fallback !== undefined) return fallback;

  // Absolute fallback — should never happen
  return { id: 'dev', name: 'Development', stages: [] };
}

/** Record pipeline outcome for self-reflection. */
function recordPipelineOutcome(
  templateId: string,
  classification: TaskClassification,
  success: boolean
): void {
  try {
    getOutcomeStore().append({
      id: `pipeline-${templateId}-${String(Date.now())}`,
      cli: 'claude' as const,
      category: 'code_generation' as const,
      model: `pipeline-${templateId}`,
      success,
      durationMs: 0,
      timestamp: new Date().toISOString(),
      source: 'delegate' as const,
    });
  } catch {
    // Non-critical — don't fail pipeline on outcome recording error
  }
}
