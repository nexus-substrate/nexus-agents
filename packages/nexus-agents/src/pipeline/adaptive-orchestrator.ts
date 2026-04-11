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
import { sanitizeInput } from '../security/input-sanitizer.js';
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
    'add ',
    'fix bug',
    'fix ',
    'bug',
    'refactor',
    'write code',
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
    'security check',
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
    'new cli',
    'new tool',
    'new app',
    'new service',
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
// Issue Triage Fallback (#1779)
// ============================================================================

/** Map issue_triage category to pipeline type. */
const TRIAGE_CATEGORY_MAP: Record<string, PipelineType> = {
  bug: 'dev',
  feature: 'dev',
  documentation: 'general',
  security: 'audit',
  research: 'research',
};

/** Try using issue_triage for richer classification when confidence is low. */
async function tryIssueTriage(task: string): Promise<TaskClassification | null> {
  try {
    // Check if the task looks like a GitHub issue URL
    const issueMatch = task.match(/github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)/);
    if (issueMatch === null) return null;

    const { createIssueTriage } = await import('../dogfooding/issue-triage.js');
    const triage = createIssueTriage();
    const owner = issueMatch[1] ?? '';
    const num = issueMatch[2] ?? '';
    const triageResult = await triage.triageIssue(`https://github.com/${owner}/issues/${num}`);
    if (!triageResult.ok) return null;
    const result = triageResult.value;
    const mapped = TRIAGE_CATEGORY_MAP[result.category] ?? 'general';
    return {
      pipelineType: mapped,
      complexity: 'moderate',
      confidence: Math.max(0.5, result.categoryConfidence),
      keywords: [result.category],
    };
  } catch {
    return null; // Triage not available — fall back to keyword classification
  }
}

// ============================================================================
// LLM Classification Refinement (#1798)
// ============================================================================

/** Threshold below which keyword classification triggers LLM refinement. */
/** Triggers LLM on truly ambiguous tasks (0 keyword matches = 0 confidence). */
const LLM_REFINEMENT_THRESHOLD = 0.2;

/** Valid pipeline template names for LLM classification parsing. */
const VALID_TEMPLATES = new Set<PipelineType>([
  'dev',
  'research',
  'audit',
  'greenfield',
  'general',
]);

/**
 * Use a lightweight LLM call to classify ambiguous tasks.
 * Only called when keyword confidence < LLM_REFINEMENT_THRESHOLD.
 * Falls back to null on any failure (zero regression risk).
 */
async function classifyWithLLM(task: string): Promise<TaskClassification | null> {
  try {
    const { executeExpert } = await import('./expert-bridge.js');
    const prompt = [
      'Classify this task into exactly one pipeline template.',
      'Templates: dev (implementation/bug fix/refactor), research (investigate/evaluate/compare),',
      'audit (security review/vulnerability scan), greenfield (new project from scratch),',
      'general (ambiguous/other).',
      '',
      `Task: "${task}"`,
      '',
      'Respond with ONLY the template name (one word): dev, research, audit, greenfield, or general.',
    ].join('\n');

    const result = await executeExpert('architecture', prompt);
    if (!result.success) return null;

    // Parse response — extract the first matching template name
    const lower = result.text.toLowerCase().trim();
    for (const template of VALID_TEMPLATES) {
      if (lower.includes(template)) {
        logger.info('LLM classification refinement', { task: task.slice(0, 60), template });
        return {
          pipelineType: template,
          complexity: 'moderate',
          confidence: 0.7, // LLM classification gets moderate confidence
          keywords: ['llm-classified'],
        };
      }
    }
    return null; // LLM didn't return a valid template name
  } catch {
    return null; // LLM call failed — keep keyword result
  }
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
  // Sanitize task input to prevent prompt injection (#1767)
  const sanitized = sanitizeInput(task, 'collaborator', 'pipeline');
  if (sanitized.strippedElements.length > 0) {
    logger.warn('Pipeline input sanitized', { stripped: sanitized.strippedElements.length });
  }
  const cleanTask = sanitized.content;

  let classification = classifyTask(cleanTask);

  // Low-confidence fallback chain (#1779, #1798):
  // 1. Try issue_triage for GitHub issue URLs
  // 2. Try LLM classification for remaining ambiguous tasks
  if (classification.confidence < LLM_REFINEMENT_THRESHOLD && options.templateId === undefined) {
    const enriched = await tryIssueTriage(cleanTask);
    if (enriched !== null) {
      logger.info('Classification enriched via issue_triage', {
        original: classification.pipelineType,
        enriched: enriched.pipelineType,
      });
      classification = enriched;
    } else {
      // LLM refinement: delegate to expert for semantic classification (#1798)
      const llmResult = await classifyWithLLM(cleanTask);
      if (llmResult !== null) {
        logger.info('Classification refined via LLM', {
          original: classification.pipelineType,
          refined: llmResult.pipelineType,
        });
        classification = llmResult;
      }
    }
  }

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
  const result = await runGraphPipeline(cleanTask, template, options.stages, options);

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
