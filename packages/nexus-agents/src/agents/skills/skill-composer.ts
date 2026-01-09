/**
 * nexus-agents/agents - Skill Composer
 *
 * Composes multiple skills to solve complex tasks.
 * Part of the Voyager skill library pattern.
 *
 * @module agents/skills/skill-composer
 * (Source: arXiv:2305.16291, Issue #150)
 */

import type { ILogger } from '../../core/index.js';
import { createLogger } from '../../core/index.js';
import type {
  SkillCompositionRequest,
  SkillComposition,
  CompositionStep,
  InputBinding,
  SkillWithMetrics,
  SkillComplexity,
} from './skill-types.js';
import { COMPLEXITY_ORDER } from './skill-types.js';
import type { SkillLibrary } from './skill-library.js';

/**
 * Configuration for skill composition.
 */
export interface SkillComposerConfig {
  /** Maximum skills to consider for composition */
  readonly maxCandidateSkills: number;
  /** Maximum steps in a composition */
  readonly maxCompositionSteps: number;
  /** Minimum confidence threshold for compositions */
  readonly minConfidence: number;
  /** Weight for skill success rate in scoring */
  readonly successRateWeight: number;
  /** Weight for complexity match in scoring */
  readonly complexityMatchWeight: number;
}

/**
 * Default composer configuration.
 */
export const DEFAULT_COMPOSER_CONFIG: SkillComposerConfig = {
  maxCandidateSkills: 20,
  maxCompositionSteps: 5,
  minConfidence: 0.3,
  successRateWeight: 0.4,
  complexityMatchWeight: 0.3,
};

/**
 * Composes skills to solve complex tasks.
 */
export class SkillComposer {
  private readonly config: SkillComposerConfig;
  private readonly logger: ILogger;
  private readonly library: SkillLibrary;

  constructor(library: SkillLibrary, config: Partial<SkillComposerConfig> = {}, logger?: ILogger) {
    this.library = library;
    this.config = { ...DEFAULT_COMPOSER_CONFIG, ...config };
    this.logger = logger ?? createLogger({ component: 'SkillComposer' });
  }

  /**
   * Creates a composition plan for a task.
   */
  compose(request: SkillCompositionRequest): SkillComposition | null {
    this.logger.info('Composing skills for task', {
      taskDescription: request.taskDescription.substring(0, 100),
      maxComplexity: request.maxComplexity,
      maxSkillCount: request.maxSkillCount,
    });

    const candidates = this.findCandidateSkills(request);
    if (candidates.length === 0) {
      this.logger.warn('No candidate skills found for task');
      return null;
    }

    const composition = this.buildComposition(request, candidates);
    if (composition === null) {
      return null;
    }

    this.logger.info('Skill composition created', {
      stepCount: composition.steps.length,
      confidence: composition.confidence.toFixed(2),
      complexity: composition.estimatedComplexity,
    });

    return composition;
  }

  /**
   * Validates that a composition is executable.
   */
  validateComposition(composition: SkillComposition): CompositionValidation {
    const errors: string[] = [];
    const warnings: string[] = [];
    const seenSkills = new Set<string>();

    for (const step of composition.steps) {
      const skill = this.library.getSkill(step.skillId);

      if (skill === undefined) {
        errors.push(`Step ${String(step.stepNumber)}: Skill "${step.skillId}" not found`);
        continue;
      }

      if (seenSkills.has(step.skillId)) {
        warnings.push(`Step ${String(step.stepNumber)}: Skill "${skill.name}" used multiple times`);
      }
      seenSkills.add(step.skillId);

      const bindingErrors = this.validateBindings(step, composition.steps);
      errors.push(...bindingErrors);

      if (skill.metrics.successRate < 0.5) {
        warnings.push(
          `Step ${String(step.stepNumber)}: Skill "${skill.name}" has low success rate`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Gets the current configuration.
   */
  getConfig(): SkillComposerConfig {
    return this.config;
  }

  /**
   * Finds candidate skills for the task.
   */
  private findCandidateSkills(request: SkillCompositionRequest): SkillWithMetrics[] {
    const relevantSkills = this.library.findRelevantSkills(
      request.taskDescription,
      this.config.maxCandidateSkills
    );

    let filtered = [...relevantSkills];

    if (request.maxComplexity !== undefined) {
      const maxOrder = COMPLEXITY_ORDER[request.maxComplexity];
      filtered = filtered.filter((s) => COMPLEXITY_ORDER[s.complexity] <= maxOrder);
    }

    return filtered;
  }

  /**
   * Builds a composition from candidate skills.
   */
  private buildComposition(
    request: SkillCompositionRequest,
    candidates: SkillWithMetrics[]
  ): SkillComposition | null {
    const maxSteps = Math.min(
      request.maxSkillCount ?? this.config.maxCompositionSteps,
      this.config.maxCompositionSteps
    );

    const taskKeywords = this.extractTaskKeywords(request.taskDescription);
    const scoredSkills = this.scoreSkillsForTask(candidates, taskKeywords);

    const selectedSkills = scoredSkills.slice(0, maxSteps);
    if (selectedSkills.length === 0) {
      return null;
    }

    const steps = this.createSteps(selectedSkills, request.context);
    const overallConfidence = this.calculateOverallConfidence(selectedSkills);

    if (overallConfidence < this.config.minConfidence) {
      this.logger.warn('Composition confidence below threshold', {
        confidence: overallConfidence.toFixed(2),
        threshold: this.config.minConfidence,
      });
      return null;
    }

    const estimatedComplexity = this.estimateOverallComplexity(selectedSkills);

    return {
      steps,
      description: this.generateCompositionDescription(steps, request.taskDescription),
      estimatedComplexity,
      confidence: overallConfidence,
    };
  }

  /**
   * Extracts keywords from task description.
   */
  private extractTaskKeywords(description: string): string[] {
    return description
      .toLowerCase()
      .split(/\W+/)
      .filter((word) => word.length > 2);
  }

  /**
   * Scores skills for a specific task.
   */
  private scoreSkillsForTask(
    skills: SkillWithMetrics[],
    taskKeywords: string[]
  ): SkillWithMetrics[] {
    const scored = skills.map((skill) => {
      const relevanceScore = this.calculateRelevance(skill, taskKeywords);
      const successScore = skill.metrics.successRate * this.config.successRateWeight;
      const totalScore = relevanceScore + successScore;
      return { skill, score: totalScore };
    });

    return scored.sort((a, b) => b.score - a.score).map((s) => s.skill);
  }

  /**
   * Calculates relevance score for a skill.
   */
  private calculateRelevance(skill: SkillWithMetrics, keywords: string[]): number {
    let score = 0;
    const nameLower = skill.name.toLowerCase();
    const descLower = skill.description.toLowerCase();

    for (const keyword of keywords) {
      if (nameLower.includes(keyword)) score += 2;
      if (descLower.includes(keyword)) score += 1;
    }

    return score / Math.max(1, keywords.length);
  }

  /**
   * Creates composition steps from selected skills.
   */
  private createSteps(skills: SkillWithMetrics[], context?: string): CompositionStep[] {
    return skills.map((skill, index) => ({
      stepNumber: index + 1,
      skillId: skill.id,
      skillName: skill.name,
      inputBinding: this.createInputBindings(skill, index, context),
      purpose: skill.description,
    }));
  }

  /**
   * Creates input bindings for a step.
   */
  private createInputBindings(
    skill: SkillWithMetrics,
    stepIndex: number,
    context?: string
  ): Record<string, InputBinding> {
    const bindings: Record<string, InputBinding> = {};

    for (const param of skill.parameters) {
      if (stepIndex === 0 || context !== undefined) {
        bindings[param.name] = {
          source: 'context',
          key: param.name,
        };
      } else {
        bindings[param.name] = {
          source: 'previous-step',
          key: String(stepIndex),
        };
      }
    }

    return bindings;
  }

  /**
   * Calculates overall confidence for the composition.
   */
  private calculateOverallConfidence(skills: SkillWithMetrics[]): number {
    if (skills.length === 0) {
      return 0;
    }

    const avgSuccessRate =
      skills.reduce((sum, s) => sum + s.metrics.successRate, 0) / skills.length;

    const avgExecutions =
      skills.reduce((sum, s) => sum + s.metrics.executionCount, 0) / skills.length;
    const experienceFactor = Math.min(1, avgExecutions / 10);

    const stepPenalty = 1 - (skills.length - 1) * 0.1;

    return avgSuccessRate * experienceFactor * Math.max(0.5, stepPenalty);
  }

  /**
   * Estimates overall complexity from selected skills.
   */
  private estimateOverallComplexity(skills: SkillWithMetrics[]): SkillComplexity {
    if (skills.length === 0) {
      return 'primitive';
    }

    const maxComplexity = Math.max(...skills.map((s) => COMPLEXITY_ORDER[s.complexity]));
    const compositePenalty = skills.length > 2 ? 1 : 0;
    const finalOrder = Math.min(5, maxComplexity + compositePenalty);

    const complexityFromOrder = Object.entries(COMPLEXITY_ORDER).find(
      ([, order]) => order === finalOrder
    );
    if (complexityFromOrder === undefined) {
      return 'composite';
    }
    return complexityFromOrder[0] as SkillComplexity;
  }

  /**
   * Generates a description for the composition.
   */
  private generateCompositionDescription(
    steps: CompositionStep[],
    taskDescription: string
  ): string {
    if (steps.length === 1) {
      return `Using "${steps[0]?.skillName ?? 'unknown'}" to: ${taskDescription}`;
    }

    const skillNames = steps.map((s) => s.skillName).join(', ');
    return `Composed ${String(steps.length)} skills (${skillNames}) to: ${taskDescription}`;
  }

  /**
   * Validates input bindings for a step.
   */
  private validateBindings(step: CompositionStep, _allSteps: readonly CompositionStep[]): string[] {
    const errors: string[] = [];

    for (const [paramName, binding] of Object.entries(step.inputBinding)) {
      if (binding.source === 'previous-step') {
        const refStep = parseInt(binding.key, 10);
        if (isNaN(refStep) || refStep < 1 || refStep >= step.stepNumber) {
          errors.push(`Step ${String(step.stepNumber)}: Invalid step reference for "${paramName}"`);
        }
      }
    }

    return errors;
  }
}

/**
 * Result of validating a composition.
 */
export interface CompositionValidation {
  /** Whether the composition is valid */
  readonly valid: boolean;
  /** Validation errors */
  readonly errors: readonly string[];
  /** Warnings (not blocking) */
  readonly warnings: readonly string[];
}

/**
 * Creates a skill composer.
 */
export function createSkillComposer(
  library: SkillLibrary,
  config?: Partial<SkillComposerConfig>,
  logger?: ILogger
): SkillComposer {
  return new SkillComposer(library, config, logger);
}
