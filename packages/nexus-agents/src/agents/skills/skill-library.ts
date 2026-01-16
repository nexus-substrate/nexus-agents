/**
 * nexus-agents/agents - Voyager Skill Library
 *
 * Implementation of the Voyager skill library pattern:
 * an ever-growing library of executable code skills with
 * automatic retrieval, composition, and curriculum learning.
 *
 * @module agents/skills/skill-library
 * (Source: arXiv:2305.16291, Issue #150)
 */

import { randomUUID } from 'node:crypto';
import type { ILogger } from '../../core/index.js';
import { createLogger } from '../../core/index.js';
import type {
  Skill,
  SkillWithMetrics,
  SkillExecution,
  SkillQuery,
  SkillSearchResult,
  CreateSkillOptions,
  SkillLibraryConfig,
  LibraryStatistics,
  SkillStore,
} from './skill-types.js';
import { DEFAULT_SKILL_LIBRARY_CONFIG, STOP_WORDS } from './skill-types.js';
import { extractKeywords, calculateRelevanceScore, matchesAllCriteria } from './skill-search.js';
import {
  type RecordExecutionOptions,
  createExecutionRecord,
  applySkillUpdates,
  createInitialMetrics,
  calculateUpdatedMetrics,
  addMetricsToSkill,
  sortSkillsByCriteria,
  calculateLibraryStatistics,
  findLowestPerformingSkillId,
} from './skill-helpers.js';

/**
 * Voyager-style skill library for storing and retrieving executable skills.
 */
export class SkillLibrary {
  private readonly config: SkillLibraryConfig;
  private readonly logger: ILogger;
  private readonly store: SkillStore;

  constructor(config: Partial<SkillLibraryConfig> = {}, logger?: ILogger) {
    this.config = { ...DEFAULT_SKILL_LIBRARY_CONFIG, ...config };
    this.logger = logger ?? createLogger({ component: 'SkillLibrary' });
    this.store = {
      skills: new Map(),
      executions: new Map(),
      metrics: new Map(),
    };
  }

  /**
   * Adds a new skill to the library.
   */
  addSkill(options: CreateSkillOptions): Skill {
    if (this.store.skills.size >= this.config.maxSkills) {
      if (this.config.enablePruning) {
        this.pruneLowestPerforming();
      } else {
        throw new Error(`Skill library at capacity (${String(this.config.maxSkills)} skills)`);
      }
    }

    const now = new Date();
    const skill: Skill = {
      id: randomUUID(),
      name: options.name,
      description: options.description,
      category: options.category,
      complexity: options.complexity,
      code: options.code,
      parameters: options.parameters,
      outputType: options.outputType,
      dependencies: options.dependencies ?? [],
      tags: options.tags ?? [],
      examples: options.examples ?? [],
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    this.store.skills.set(skill.id, skill);
    this.store.metrics.set(skill.id, createInitialMetrics());
    this.store.executions.set(skill.id, []);

    this.logger.info('Skill added to library', {
      skillId: skill.id,
      name: skill.name,
      category: skill.category,
      complexity: skill.complexity,
    });

    return skill;
  }

  /**
   * Retrieves a skill by ID.
   */
  getSkill(skillId: string): SkillWithMetrics | undefined {
    const skill = this.store.skills.get(skillId);
    if (skill === undefined) {
      return undefined;
    }
    return addMetricsToSkill(skill, this.store.metrics.get(skillId));
  }

  /**
   * Retrieves a skill by name.
   */
  getSkillByName(name: string): SkillWithMetrics | undefined {
    for (const skill of this.store.skills.values()) {
      if (skill.name === name) {
        return addMetricsToSkill(skill, this.store.metrics.get(skill.id));
      }
    }
    return undefined;
  }

  /**
   * Searches for skills matching a query.
   */
  searchSkills(query: SkillQuery): SkillSearchResult {
    let matches = this.filterSkills(query);
    const totalCount = matches.length;

    matches = sortSkillsByCriteria(matches, query.sortBy ?? 'name', query.sortOrder ?? 'asc');

    if (query.limit !== undefined && query.limit > 0) {
      matches = matches.slice(0, query.limit);
    }

    return {
      skills: matches,
      totalCount,
      query,
    };
  }

  /**
   * Records a skill execution (legacy signature).
   */
  recordExecution(
    skillId: string,
    status: SkillExecution['status'],
    input: Record<string, unknown>,
    output?: string,
    errorMessage?: string
  ): void {
    this.recordExecutionWithOptions({
      skillId,
      status,
      input,
      ...(output !== undefined && { output }),
      ...(errorMessage !== undefined && { errorMessage }),
    });
  }

  /**
   * Records a skill execution with options object.
   */
  recordExecutionWithOptions(options: RecordExecutionOptions): void {
    const skill = this.store.skills.get(options.skillId);
    if (skill === undefined) {
      this.logger.warn('Attempted to record execution for unknown skill', {
        skillId: options.skillId,
      });
      return;
    }

    const execution = createExecutionRecord(options);
    this.storeExecution(options.skillId, execution);
    this.updateMetrics(options.skillId, execution);

    this.logger.debug('Skill execution recorded', {
      skillId: options.skillId,
      skillName: skill.name,
      status: options.status,
    });
  }

  /** Gets all skills in a category. */
  getSkillsByCategory(category: string): readonly SkillWithMetrics[] {
    return this.searchSkills({ category: category as Skill['category'] }).skills;
  }

  /** Gets the most successful skills. */
  getTopPerformingSkills(limit: number = 10): readonly SkillWithMetrics[] {
    return this.searchSkills({ sortBy: 'successRate', sortOrder: 'desc', limit }).skills;
  }

  /** Gets the most frequently used skills. */
  getMostUsedSkills(limit: number = 10): readonly SkillWithMetrics[] {
    return this.searchSkills({ sortBy: 'executionCount', sortOrder: 'desc', limit }).skills;
  }

  /**
   * Finds skills relevant to a task description.
   */
  findRelevantSkills(taskDescription: string, limit: number = 5): readonly SkillWithMetrics[] {
    const keywords = extractKeywords(taskDescription, STOP_WORDS);
    const scoredSkills = this.scoreSkillsByRelevance(keywords);
    return scoredSkills.slice(0, limit);
  }

  /**
   * Updates an existing skill.
   */
  updateSkill(skillId: string, updates: Partial<CreateSkillOptions>): Skill | undefined {
    const existing = this.store.skills.get(skillId);
    if (existing === undefined) {
      return undefined;
    }

    const updated = applySkillUpdates(existing, updates);
    this.store.skills.set(skillId, updated);

    this.logger.info('Skill updated', {
      skillId,
      name: updated.name,
      version: updated.version,
    });

    return updated;
  }

  /**
   * Removes a skill from the library.
   */
  removeSkill(skillId: string): boolean {
    const skill = this.store.skills.get(skillId);
    if (skill === undefined) {
      return false;
    }

    this.store.skills.delete(skillId);
    this.store.executions.delete(skillId);
    this.store.metrics.delete(skillId);

    this.logger.info('Skill removed from library', {
      skillId,
      name: skill.name,
    });

    return true;
  }

  /** Gets library statistics. */
  getStatistics(): LibraryStatistics {
    return calculateLibraryStatistics(
      Array.from(this.store.skills.values()),
      Array.from(this.store.metrics.values())
    );
  }

  /** Gets the current configuration. */
  getConfig(): SkillLibraryConfig {
    return this.config;
  }

  /**
   * Stores an execution record.
   */
  private storeExecution(skillId: string, execution: SkillExecution): void {
    if (!this.config.trackExecutionHistory) {
      return;
    }

    const executions = this.store.executions.get(skillId) ?? [];
    executions.push(execution);

    if (executions.length > this.config.maxHistoryPerSkill) {
      executions.shift();
    }

    this.store.executions.set(skillId, executions);
  }

  /**
   * Updates metrics after an execution.
   */
  private updateMetrics(skillId: string, execution: SkillExecution): void {
    const current = this.store.metrics.get(skillId);
    if (current === undefined) {
      return;
    }

    const updated = calculateUpdatedMetrics(current, execution);
    this.store.metrics.set(skillId, updated);

    this.evaluateRetention(skillId);
  }

  /**
   * Evaluates whether a skill should be retained.
   */
  private evaluateRetention(skillId: string): void {
    if (!this.config.enablePruning) {
      return;
    }

    const metrics = this.store.metrics.get(skillId);
    if (metrics === undefined) {
      return;
    }

    if (metrics.executionCount < this.config.executionsBeforeEvaluation) {
      return;
    }

    if (metrics.successRate < this.config.minSuccessRateForRetention) {
      this.logger.info('Skill marked for pruning due to low success rate', {
        skillId,
        successRate: metrics.successRate.toFixed(2),
        threshold: this.config.minSuccessRateForRetention,
      });
    }
  }

  /**
   * Removes the lowest performing skill.
   */
  private pruneLowestPerforming(): void {
    const lowestId = findLowestPerformingSkillId(
      this.store.metrics,
      this.config.executionsBeforeEvaluation
    );

    if (lowestId !== undefined) {
      const skill = this.store.skills.get(lowestId);
      const metrics = this.store.metrics.get(lowestId);
      this.removeSkill(lowestId);
      this.logger.info('Pruned lowest performing skill', {
        skillId: lowestId,
        skillName: skill?.name,
        successRate: metrics?.successRate.toFixed(2),
      });
    }
  }

  /**
   * Filters skills by query criteria.
   */
  private filterSkills(query: SkillQuery): SkillWithMetrics[] {
    const results: SkillWithMetrics[] = [];

    for (const skill of this.store.skills.values()) {
      if (!matchesAllCriteria(skill, query, (id) => this.store.metrics.get(id))) {
        continue;
      }
      results.push(addMetricsToSkill(skill, this.store.metrics.get(skill.id)));
    }

    return results;
  }

  /**
   * Scores skills by relevance to keywords.
   */
  private scoreSkillsByRelevance(keywords: string[]): SkillWithMetrics[] {
    const scored: Array<{ skill: SkillWithMetrics; score: number }> = [];

    for (const skill of this.store.skills.values()) {
      const metrics = this.store.metrics.get(skill.id);
      const score = calculateRelevanceScore(skill, keywords, metrics);
      if (score > 0) {
        scored.push({ skill: addMetricsToSkill(skill, metrics), score });
      }
    }

    return scored.sort((a, b) => b.score - a.score).map((s) => s.skill);
  }
}

/**
 * Creates a skill library with optional configuration.
 */
export function createSkillLibrary(
  config?: Partial<SkillLibraryConfig>,
  logger?: ILogger
): SkillLibrary {
  return new SkillLibrary(config, logger);
}
