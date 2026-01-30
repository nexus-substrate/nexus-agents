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
import type { WorkflowDefinition } from '../../core/index.js';
import { getRandomProvider, getTimeProvider } from '../../core/index.js';
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
  parseVersion,
  formatVersion,
  incrementVersion,
} from './sew-types.js';
import { createMutant, describeMutation } from './mutation-operators.js';
import {
  tournamentSelect,
  performCrossover,
  calculateEvolutionStats,
  buildVersionHistory,
} from './workflow-evolver-helpers.js';
import {
  evaluateOutcomes,
  computeFitness,
  selectCrossoverIndices,
  calculateFitnessStats,
} from './workflow-evolver-execution.js';

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

  /** Register the initial workflow version. */
  registerInitialVersion(workflow: WorkflowDefinition): WorkflowVersion {
    const version: WorkflowVersion = {
      id: uuidv4(),
      version: workflow.version,
      workflow,
      fitnessScore: 0,
      metrics: DEFAULT_FITNESS_METRICS,
      parentVersion: null,
      appliedMutations: [],
      createdAt: getTimeProvider().now(),
      isActive: true,
    };
    this.versions.set(version.id, version);
    this.outcomes.set(version.id, []);
    this.activeVersionId = version.id;
    return version;
  }

  /** Get the currently active workflow version. */
  getActiveVersion(): WorkflowVersion | null {
    if (this.activeVersionId === null) return null;
    return this.versions.get(this.activeVersionId) ?? null;
  }

  /** Get a specific version by ID. */
  getVersion(id: string): WorkflowVersion | null {
    return this.versions.get(id) ?? null;
  }

  /** Get all versions. */
  getAllVersions(): readonly WorkflowVersion[] {
    return Array.from(this.versions.values());
  }

  /** Record an execution outcome for fitness evaluation. */
  recordOutcome(outcome: ExecutionOutcome): void {
    const versionOutcomes = this.outcomes.get(outcome.versionId);
    if (versionOutcomes) {
      versionOutcomes.push(outcome);
    }
  }

  /** Evaluate fitness for a version based on recorded outcomes. */
  evaluate(versionId: string): FitnessMetrics {
    const outcomes = this.outcomes.get(versionId) ?? [];
    return evaluateOutcomes(outcomes);
  }

  /** Update version with new fitness metrics. */
  updateVersionFitness(versionId: string): WorkflowVersion | null {
    const version = this.versions.get(versionId);
    if (!version) return null;

    const metrics = this.evaluate(versionId);
    const fitnessScore = computeFitness(metrics);

    const updatedVersion: WorkflowVersion = { ...version, metrics, fitnessScore };
    this.versions.set(versionId, updatedVersion);
    return updatedVersion;
  }

  /** Create mutations of a workflow. */
  evolve(baseVersion: WorkflowVersion): WorkflowVersion[] {
    const random = getRandomProvider();
    const time = getTimeProvider();
    const variants: WorkflowVersion[] = [];
    const semVer = parseVersion(baseVersion.version);

    for (let i = 0; i < this.config.populationSize - 1; i++) {
      const { workflow: mutatedWorkflow, mutations } = createMutant(
        baseVersion.workflow,
        this.config,
        1 + random.randomInt(0, 2)
      );
      if (mutations.length === 0) continue;

      const newVersion = incrementVersion(semVer, 'patch');
      const variant: WorkflowVersion = {
        id: uuidv4(),
        version: formatVersion(newVersion),
        workflow: { ...mutatedWorkflow, version: formatVersion(newVersion) },
        fitnessScore: 0,
        metrics: DEFAULT_FITNESS_METRICS,
        parentVersion: baseVersion.id,
        appliedMutations: mutations,
        createdAt: time.now(),
        isActive: false,
      };

      this.versions.set(variant.id, variant);
      this.outcomes.set(variant.id, []);
      variants.push(variant);
    }
    return variants;
  }

  /** Select best performing workflows for next generation. */
  select(population: readonly WorkflowVersion[]): WorkflowVersion[] {
    if (population.length <= this.config.elitismCount) {
      return [...population];
    }

    const sorted = [...population].sort((a, b) => b.fitnessScore - a.fitnessScore);
    const selected: WorkflowVersion[] = sorted.slice(0, this.config.elitismCount);

    const remaining = this.config.populationSize - this.config.elitismCount;
    for (let i = 0; i < remaining; i++) {
      const winner = tournamentSelect(population, this.config.selectionPressure);
      if (winner && !selected.some((s) => s.id === winner.id)) {
        selected.push(winner);
      }
    }
    return selected;
  }

  /** Combine two successful workflows through crossover. */
  crossover(parent1: WorkflowVersion, parent2: WorkflowVersion): WorkflowVersion | null {
    const result = performCrossover(parent1, parent2);
    if (!result) return null;
    this.versions.set(result.child.id, result.child);
    this.outcomes.set(result.child.id, []);
    return result.child;
  }

  /** Rollback to previous version on fitness regression. */
  rollback(): WorkflowVersion | null {
    const active = this.getActiveVersion();
    if (active?.parentVersion === null || active?.parentVersion === undefined) return null;

    const parent = this.versions.get(active.parentVersion);
    if (!parent) return null;

    const deactivated: WorkflowVersion = { ...active, isActive: false };
    const activated: WorkflowVersion = { ...parent, isActive: true };

    this.versions.set(active.id, deactivated);
    this.versions.set(parent.id, activated);
    this.activeVersionId = parent.id;
    return activated;
  }

  /** Check if regression has occurred and rollback if needed. */
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

  /** Promote a version to active status. */
  promote(versionId: string): WorkflowVersion | null {
    const version = this.versions.get(versionId);
    if (!version) return null;
    if (version.fitnessScore < this.config.promotionThreshold) return null;

    if (this.activeVersionId !== null && this.activeVersionId !== '') {
      const current = this.versions.get(this.activeVersionId);
      if (current) {
        this.versions.set(this.activeVersionId, { ...current, isActive: false });
      }
    }

    const promoted: WorkflowVersion = { ...version, isActive: true };
    this.versions.set(versionId, promoted);
    this.activeVersionId = versionId;
    return promoted;
  }

  /** Run a complete evolution cycle. */
  runEvolutionCycle(baseVersion: WorkflowVersion): EvolutionHistoryEntry {
    const random = getRandomProvider();
    const time = getTimeProvider();
    const mutants = this.evolve(baseVersion);
    const population = [baseVersion, ...mutants];

    for (const version of population) {
      this.updateVersionFitness(version.id);
    }

    const selected = this.select(
      population
        .map((v) => this.versions.get(v.id))
        .filter((v): v is WorkflowVersion => v !== undefined)
    );

    if (selected.length >= 2 && random.random() < this.config.crossoverRate) {
      const [idx1, idx2] = selectCrossoverIndices(selected.length);
      const p1 = selected[idx1];
      const p2 = selected[idx2];
      if (p1 && p2) this.crossover(p1, p2);
    }

    const fitnessValues = selected.map((v) => v.fitnessScore);
    const { best: bestFitness, average: avgFitness } = calculateFitnessStats(fitnessValues);

    return {
      generation: 0,
      timestamp: time.now(),
      population: selected,
      bestFitness,
      avgFitness,
      mutationsApplied: mutants.reduce((sum, m) => sum + m.appliedMutations.length, 0),
      crossoversPerformed: random.random() < this.config.crossoverRate ? 1 : 0,
    };
  }

  /** Run complete evolution process over multiple generations. */
  async runEvolution(
    workflow: WorkflowDefinition,
    executeWorkflow: (workflow: WorkflowDefinition) => Promise<ExecutionOutcome>
  ): Promise<EvolutionResult> {
    const originalVersion = this.registerInitialVersion(workflow);
    const history: EvolutionHistoryEntry[] = [];
    let currentBest = originalVersion;

    for (let gen = 0; gen < this.config.generations; gen++) {
      const variants = this.evolve(currentBest);

      for (const variant of [currentBest, ...variants]) {
        for (let exec = 0; exec < this.config.minExecutionsForEval; exec++) {
          const outcome = await executeWorkflow(variant.workflow);
          this.recordOutcome({ ...outcome, versionId: variant.id });
        }
      }

      const entry = this.runEvolutionCycle(currentBest);
      history.push({ ...entry, generation: gen });

      const allVersions = this.getAllVersions();
      const sorted = [...allVersions].sort((a, b) => b.fitnessScore - a.fitnessScore);
      if (sorted[0]) currentBest = sorted[0];

      this.checkAndRollback();
    }

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

    if (!success) return { ...result, reason: 'Did not meet promotion threshold' };
    return result;
  }

  /** Get evolution statistics. */
  getStats(): {
    totalVersions: number;
    activeVersion: string | null;
    bestFitness: number;
    avgFitness: number;
    totalOutcomes: number;
  } {
    return calculateEvolutionStats(
      this.getAllVersions(),
      this.activeVersionId,
      this.outcomes as Map<string, readonly { success: boolean }[]>
    );
  }

  /** Describe version history for debugging. */
  describeVersionHistory(versionId: string): string[] {
    return buildVersionHistory(versionId, this.versions, describeMutation);
  }
}

/** Create a workflow evolver with optional configuration. */
export function createWorkflowEvolver(config?: Partial<EvolutionConfig>): WorkflowEvolver {
  return new WorkflowEvolver(config);
}
