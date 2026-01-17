/**
 * nexus-agents/workflows - Workflow Evolver
 *
 * Genetic algorithm-based workflow evolution engine.
 * Evolves workflow parameters through mutation, crossover, and selection.
 *
 * @module workflows/self-evolving/workflow-evolver
 * (Source: Issue #330)
 */

import { v4 as uuidv4 } from 'uuid';
import type { WorkflowDefinition, WorkflowStep } from '../../core/index.js';
import type {
  WorkflowVersion,
  EvolutionConfig,
  FitnessMetrics,
  ExecutionOutcome,
  EvolutionHistoryEntry,
  EvolutionResult,
} from './sew-types.js';
import {
  DEFAULT_EVOLUTION_CONFIG,
  DEFAULT_FITNESS_METRICS,
  computeFitnessScore,
  parseVersion,
  formatVersion,
  incrementVersion,
} from './sew-types.js';
import { createMutant, describeMutation } from './mutation-operators.js';

/**
 * Workflow evolver for automatic workflow improvement.
 */
export class WorkflowEvolver {
  private readonly config: EvolutionConfig;
  private readonly versions: Map<string, WorkflowVersion> = new Map();
  private readonly outcomes: Map<string, ExecutionOutcome[]> = new Map();
  private activeVersionId: string | null = null;

  constructor(config?: Partial<EvolutionConfig>) {
    this.config = { ...DEFAULT_EVOLUTION_CONFIG, ...config };
  }

  /**
   * Register the initial workflow version.
   */
  registerInitialVersion(workflow: WorkflowDefinition): WorkflowVersion {
    const version: WorkflowVersion = {
      id: uuidv4(),
      version: workflow.version,
      workflow,
      fitnessScore: 0,
      metrics: DEFAULT_FITNESS_METRICS,
      parentVersion: null,
      appliedMutations: [],
      createdAt: Date.now(),
      isActive: true,
    };

    this.versions.set(version.id, version);
    this.outcomes.set(version.id, []);
    this.activeVersionId = version.id;

    return version;
  }

  /**
   * Get the currently active workflow version.
   */
  getActiveVersion(): WorkflowVersion | null {
    if (this.activeVersionId === null) return null;
    return this.versions.get(this.activeVersionId) ?? null;
  }

  /**
   * Get a specific version by ID.
   */
  getVersion(id: string): WorkflowVersion | null {
    return this.versions.get(id) ?? null;
  }

  /**
   * Get all versions.
   */
  getAllVersions(): readonly WorkflowVersion[] {
    return Array.from(this.versions.values());
  }

  /**
   * Record an execution outcome for fitness evaluation.
   */
  recordOutcome(outcome: ExecutionOutcome): void {
    const versionOutcomes = this.outcomes.get(outcome.versionId);
    if (versionOutcomes) {
      versionOutcomes.push(outcome);
    }
  }

  /**
   * Evaluate fitness for a version based on recorded outcomes.
   */
  evaluate(versionId: string): FitnessMetrics {
    const outcomes = this.outcomes.get(versionId) ?? [];
    if (outcomes.length === 0) {
      return DEFAULT_FITNESS_METRICS;
    }

    const successCount = outcomes.filter((o) => o.success).length;
    const successRate = successCount / outcomes.length;

    const durations = outcomes.map((o) => o.durationMs);
    const avgDurationMs = durations.reduce((a, b) => a + b, 0) / durations.length;

    const costs = outcomes.map((o) => o.cost);
    const avgCost = costs.reduce((a, b) => a + b, 0) / costs.length;

    const totalRetries = outcomes.reduce((sum, o) => sum + o.totalRetries, 0);
    const totalSteps = outcomes.reduce((sum, o) => sum + o.stepResults.length, 0);
    const retryRate = totalSteps > 0 ? totalRetries / totalSteps : 0;

    // Calculate duration variance
    const durationVariance =
      durations.reduce((sum, d) => sum + Math.pow(d - avgDurationMs, 2), 0) / durations.length;

    return {
      successRate,
      avgDurationMs,
      avgCost,
      executionCount: outcomes.length,
      durationVariance,
      retryRate,
    };
  }

  /**
   * Update version with new fitness metrics.
   */
  updateVersionFitness(versionId: string): WorkflowVersion | null {
    const version = this.versions.get(versionId);
    if (!version) return null;

    const metrics = this.evaluate(versionId);
    const fitnessScore = computeFitnessScore(metrics);

    const updatedVersion: WorkflowVersion = {
      ...version,
      metrics,
      fitnessScore,
    };

    this.versions.set(versionId, updatedVersion);
    return updatedVersion;
  }

  /**
   * Create mutations of a workflow.
   */
  evolve(baseVersion: WorkflowVersion): WorkflowVersion[] {
    const variants: WorkflowVersion[] = [];
    const semVer = parseVersion(baseVersion.version);

    for (let i = 0; i < this.config.populationSize - 1; i++) {
      const { workflow: mutatedWorkflow, mutations } = createMutant(
        baseVersion.workflow,
        this.config,
        1 + Math.floor(Math.random() * 2) // 1-2 mutation rounds
      );

      if (mutations.length === 0) continue;

      const newVersion = incrementVersion(semVer, 'patch');
      const variant: WorkflowVersion = {
        id: uuidv4(),
        version: formatVersion(newVersion),
        workflow: {
          ...mutatedWorkflow,
          version: formatVersion(newVersion),
        },
        fitnessScore: 0,
        metrics: DEFAULT_FITNESS_METRICS,
        parentVersion: baseVersion.id,
        appliedMutations: mutations,
        createdAt: Date.now(),
        isActive: false,
      };

      this.versions.set(variant.id, variant);
      this.outcomes.set(variant.id, []);
      variants.push(variant);
    }

    return variants;
  }

  /**
   * Select best performing workflows for next generation.
   * Uses tournament selection with configurable pressure.
   */
  select(population: readonly WorkflowVersion[]): WorkflowVersion[] {
    if (population.length <= this.config.elitismCount) {
      return [...population];
    }

    // Sort by fitness (descending)
    const sorted = [...population].sort((a, b) => b.fitnessScore - a.fitnessScore);

    // Keep elite individuals
    const selected: WorkflowVersion[] = sorted.slice(0, this.config.elitismCount);

    // Tournament selection for remaining spots
    const remaining = this.config.populationSize - this.config.elitismCount;
    for (let i = 0; i < remaining; i++) {
      const winner = this.tournamentSelect(population);
      if (winner && !selected.some((s) => s.id === winner.id)) {
        selected.push(winner);
      }
    }

    return selected;
  }

  /**
   * Tournament selection helper.
   */
  private tournamentSelect(population: readonly WorkflowVersion[]): WorkflowVersion | null {
    const tournamentSize = Math.min(3, population.length);
    const contestants: WorkflowVersion[] = [];

    for (let i = 0; i < tournamentSize; i++) {
      const index = Math.floor(Math.random() * population.length);
      const contestant = population[index];
      if (contestant) contestants.push(contestant);
    }

    if (contestants.length === 0) return null;

    // Apply selection pressure (higher pressure = more likely to pick best)
    contestants.sort((a, b) => b.fitnessScore - a.fitnessScore);

    for (const contestant of contestants) {
      if (Math.random() < 1 / this.config.selectionPressure) {
        return contestant;
      }
    }

    return contestants[0] ?? null;
  }

  /**
   * Check if two workflows are compatible for crossover (same structure).
   */
  private areWorkflowsCompatible(
    p1Steps: readonly WorkflowStep[],
    p2Steps: readonly WorkflowStep[]
  ): boolean {
    if (p1Steps.length !== p2Steps.length) return false;
    for (let i = 0; i < p1Steps.length; i++) {
      if (p1Steps[i]?.id !== p2Steps[i]?.id) return false;
    }
    return true;
  }

  /**
   * Create a child step by combining two parent steps.
   */
  private createCrossoverStep(step1: WorkflowStep, step2: WorkflowStep): WorkflowStep {
    const selectedTimeout = Math.random() < 0.5 ? step1.timeout : step2.timeout;
    const selectedRetries = Math.random() < 0.5 ? step1.retries : step2.retries;
    const selectedParallel = Math.random() < 0.5 ? step1.parallel : step2.parallel;

    const childStep: WorkflowStep = {
      id: step1.id,
      agent: step1.agent,
      action: step1.action,
      inputs: step1.inputs,
    };

    if (step1.dependsOn !== undefined) childStep.dependsOn = step1.dependsOn;
    if (step1.condition !== undefined) childStep.condition = step1.condition;
    if (step1.contextBudget !== undefined) childStep.contextBudget = step1.contextBudget;
    if (selectedTimeout !== undefined) childStep.timeout = selectedTimeout;
    if (selectedRetries !== undefined) childStep.retries = selectedRetries;
    if (selectedParallel !== undefined) childStep.parallel = selectedParallel;

    return childStep;
  }

  /**
   * Create child version from crossover.
   */
  private createChildVersion(
    betterParent: WorkflowVersion,
    childSteps: WorkflowStep[]
  ): WorkflowVersion {
    const semVer = parseVersion(betterParent.version);
    const newVersion = incrementVersion(semVer, 'patch');

    return {
      id: uuidv4(),
      version: formatVersion(newVersion),
      workflow: {
        ...betterParent.workflow,
        version: formatVersion(newVersion),
        steps: childSteps,
      },
      fitnessScore: 0,
      metrics: DEFAULT_FITNESS_METRICS,
      parentVersion: betterParent.id,
      appliedMutations: [
        {
          type: 'timeout_adjustment',
          stepId: 'crossover',
          originalValue: 0,
          newValue: 0,
          factor: 1,
        },
      ],
      createdAt: Date.now(),
      isActive: false,
    };
  }

  /**
   * Combine two successful workflows through crossover.
   */
  crossover(parent1: WorkflowVersion, parent2: WorkflowVersion): WorkflowVersion | null {
    const p1Steps = parent1.workflow.steps;
    const p2Steps = parent2.workflow.steps;

    if (!this.areWorkflowsCompatible(p1Steps, p2Steps)) return null;

    const childSteps: WorkflowStep[] = [];
    for (let i = 0; i < p1Steps.length; i++) {
      const step1 = p1Steps[i];
      const step2 = p2Steps[i];
      if (!step1 || !step2) continue;
      childSteps.push(this.createCrossoverStep(step1, step2));
    }

    const betterParent = parent1.fitnessScore >= parent2.fitnessScore ? parent1 : parent2;
    const child = this.createChildVersion(betterParent, childSteps);

    this.versions.set(child.id, child);
    this.outcomes.set(child.id, []);

    return child;
  }

  /**
   * Rollback to previous version on fitness regression.
   */
  rollback(): WorkflowVersion | null {
    const active = this.getActiveVersion();
    if (active?.parentVersion === null || active?.parentVersion === undefined) return null;

    const parent = this.versions.get(active.parentVersion);
    if (!parent) return null;

    // Deactivate current, activate parent
    const deactivated: WorkflowVersion = { ...active, isActive: false };
    const activated: WorkflowVersion = { ...parent, isActive: true };

    this.versions.set(active.id, deactivated);
    this.versions.set(parent.id, activated);
    this.activeVersionId = parent.id;

    return activated;
  }

  /**
   * Check if regression has occurred and rollback if needed.
   */
  checkAndRollback(): WorkflowVersion | null {
    const active = this.getActiveVersion();
    if (active?.parentVersion === null || active?.parentVersion === undefined) return null;

    const parent = this.versions.get(active.parentVersion);
    if (!parent) return null;

    const regressionAmount = parent.fitnessScore - active.fitnessScore;
    if (regressionAmount > this.config.regressionThreshold) {
      return this.rollback();
    }

    return null;
  }

  /**
   * Promote a version to active status.
   */
  promote(versionId: string): WorkflowVersion | null {
    const version = this.versions.get(versionId);
    if (!version) return null;

    // Check promotion threshold
    if (version.fitnessScore < this.config.promotionThreshold) {
      return null;
    }

    // Deactivate current active
    if (this.activeVersionId !== null && this.activeVersionId !== '') {
      const current = this.versions.get(this.activeVersionId);
      if (current) {
        this.versions.set(this.activeVersionId, { ...current, isActive: false });
      }
    }

    // Activate new version
    const promoted: WorkflowVersion = { ...version, isActive: true };
    this.versions.set(versionId, promoted);
    this.activeVersionId = versionId;

    return promoted;
  }

  /**
   * Run a complete evolution cycle.
   */
  runEvolutionCycle(baseVersion: WorkflowVersion): EvolutionHistoryEntry {
    // Create new population through mutation
    const mutants = this.evolve(baseVersion);
    const population = [baseVersion, ...mutants];

    // Update fitness for all versions
    for (const version of population) {
      this.updateVersionFitness(version.id);
    }

    // Select best performers
    const selected = this.select(
      population
        .map((v) => this.versions.get(v.id))
        .filter((v): v is WorkflowVersion => v !== undefined)
    );

    // Optionally perform crossover
    if (selected.length >= 2 && Math.random() < this.config.crossoverRate) {
      const idx1 = Math.floor(Math.random() * selected.length);
      let idx2 = Math.floor(Math.random() * selected.length);
      while (idx2 === idx1 && selected.length > 1) {
        idx2 = Math.floor(Math.random() * selected.length);
      }

      const p1 = selected[idx1];
      const p2 = selected[idx2];
      if (p1 && p2) {
        this.crossover(p1, p2);
      }
    }

    const fitnessValues = selected.map((v) => v.fitnessScore);
    const bestFitness = Math.max(...fitnessValues);
    const avgFitness = fitnessValues.reduce((a, b) => a + b, 0) / fitnessValues.length;

    return {
      generation: 0, // Will be set by caller
      timestamp: Date.now(),
      population: selected,
      bestFitness,
      avgFitness,
      mutationsApplied: mutants.reduce((sum, m) => sum + m.appliedMutations.length, 0),
      crossoversPerformed: Math.random() < this.config.crossoverRate ? 1 : 0,
    };
  }

  /**
   * Run complete evolution process over multiple generations.
   */
  async runEvolution(
    workflow: WorkflowDefinition,
    executeWorkflow: (workflow: WorkflowDefinition) => Promise<ExecutionOutcome>
  ): Promise<EvolutionResult> {
    const originalVersion = this.registerInitialVersion(workflow);
    const history: EvolutionHistoryEntry[] = [];
    let currentBest = originalVersion;

    for (let gen = 0; gen < this.config.generations; gen++) {
      // Create variants
      const variants = this.evolve(currentBest);

      // Execute each variant multiple times for fitness evaluation
      for (const variant of [currentBest, ...variants]) {
        for (let exec = 0; exec < this.config.minExecutionsForEval; exec++) {
          const outcome = await executeWorkflow(variant.workflow);
          this.recordOutcome({ ...outcome, versionId: variant.id });
        }
      }

      // Run evolution cycle
      const entry = this.runEvolutionCycle(currentBest);
      history.push({ ...entry, generation: gen });

      // Find new best
      const allVersions = this.getAllVersions();
      const sorted = [...allVersions].sort((a, b) => b.fitnessScore - a.fitnessScore);
      if (sorted[0]) {
        currentBest = sorted[0];
      }

      // Check for regression and rollback if needed
      this.checkAndRollback();
    }

    // Get final state
    const finalBest = this.getActiveVersion() ?? currentBest;
    const updatedOriginal = this.versions.get(originalVersion.id) ?? originalVersion;
    const success = finalBest.fitnessScore >= this.config.promotionThreshold;

    const result: EvolutionResult = {
      originalVersion: updatedOriginal,
      bestVersion: finalBest,
      finalPopulation: this.getAllVersions().filter((v) => v.fitnessScore > 0),
      history,
      totalGenerations: this.config.generations,
      fitnessImprovement: finalBest.fitnessScore - updatedOriginal.fitnessScore,
      success,
    };

    // Only set reason if not successful
    if (!success) {
      return { ...result, reason: 'Did not meet promotion threshold' };
    }

    return result;
  }

  /**
   * Get evolution statistics.
   */
  getStats(): {
    totalVersions: number;
    activeVersion: string | null;
    bestFitness: number;
    avgFitness: number;
    totalOutcomes: number;
  } {
    const versions = this.getAllVersions();
    const fitnessValues = versions.map((v) => v.fitnessScore).filter((f) => f > 0);

    return {
      totalVersions: versions.length,
      activeVersion: this.activeVersionId,
      bestFitness: fitnessValues.length > 0 ? Math.max(...fitnessValues) : 0,
      avgFitness:
        fitnessValues.length > 0
          ? fitnessValues.reduce((a, b) => a + b, 0) / fitnessValues.length
          : 0,
      totalOutcomes: Array.from(this.outcomes.values()).reduce((sum, o) => sum + o.length, 0),
    };
  }

  /**
   * Describe version history for debugging.
   */
  describeVersionHistory(versionId: string): string[] {
    const descriptions: string[] = [];
    let current = this.versions.get(versionId);

    while (current !== undefined) {
      const mutationDescs = current.appliedMutations.map(describeMutation);
      descriptions.unshift(
        `v${current.version} (fitness: ${current.fitnessScore.toFixed(3)})` +
          (mutationDescs.length > 0 ? `\n  - ${mutationDescs.join('\n  - ')}` : ' (initial)')
      );

      if (current.parentVersion !== null && current.parentVersion !== '') {
        current = this.versions.get(current.parentVersion);
      } else {
        break;
      }
    }

    return descriptions;
  }
}

/**
 * Create a workflow evolver with optional configuration.
 */
export function createWorkflowEvolver(config?: Partial<EvolutionConfig>): WorkflowEvolver {
  return new WorkflowEvolver(config);
}
