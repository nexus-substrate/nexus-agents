# Evolving Orchestration Design Document

**Issue:** #335
**Priority:** P2 (upgraded from P4)
**Paper:** [arXiv:2505.19591](https://arxiv.org/abs/2505.19591)
**Last Updated:** 2026-01-17 (ET)
**Status:** Design Phase

---

## Executive Summary

This document describes the design for implementing Puppeteer-style learned orchestration in nexus-agents. The approach implements a centralized orchestrator that dynamically directs specialized agents ("puppets") through a learned policy, enabling adaptive multi-agent coordination that evolves toward more efficient reasoning structures.

**Key Benefits:**

- 15-30% improvement in multi-agent task completion
- Emergent compaction (hub agents) for efficiency
- Emergent cyclicality (recursive critique) for quality
- Reduced coordination overhead compared to static approaches

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Paper Concepts](#paper-concepts)
3. [Architecture Overview](#architecture-overview)
4. [Core Interfaces](#core-interfaces)
5. [Implementation Phases](#implementation-phases)
6. [Integration Points](#integration-points)
7. [Testing Strategy](#testing-strategy)
8. [Migration Path](#migration-path)
9. [Open Questions](#open-questions)

---

## Problem Statement

### Current State

The existing nexus-agents orchestration relies on:

1. **Static Expert Selection** (`expert-selector.ts`): Rule-based scoring of experts based on task analysis, capability matching, and domain alignment. Selection is deterministic and does not learn from outcomes.

2. **TRINITY Coordinator** (`trinity-coordinator.ts`): Fixed Thinker/Worker/Verifier role sequence with iteration on failure. Pattern is static and does not adapt agent selection dynamically.

3. **Collaboration Patterns** (`collaboration-types.ts`): Predefined patterns (sequential, parallel, review, consensus, reflexion) chosen at task start and not modified during execution.

### Limitations

- **No learning from experience**: Selection does not improve based on task outcomes
- **Static routing**: Agent sequence fixed at task start, cannot adapt mid-task
- **No emergent optimization**: Cannot discover efficient agent topologies (hub agents, cycles)
- **Coordination overhead**: Multi-agent chains without compaction

### Target State

A Puppeteer orchestrator that:

1. Learns optimal agent selection policies from task outcomes
2. Dynamically routes to agents based on evolving task state
3. Discovers emergent patterns (compaction, cyclicality) through training
4. Reduces coordination overhead while improving task completion

---

## Paper Concepts

### The Puppeteer Paradigm

From arXiv:2505.19591:

```
Puppeteer (Orchestrator)
         |
    π(S_t, τ) → a_t
         |
    ┌────┴────┐
    ↓         ↓
 Puppet 1  Puppet 2  ... Puppet N
 (Agent)   (Agent)       (Agent)
```

The orchestrator acts as a "puppeteer" that selects which "puppet" (agent) to activate at each step based on:

- **S_t**: Global system state at step t (aggregated agent states + context)
- **τ**: Task description
- **a_t**: Selected agent from action space A

### Policy Formulation

```
a_t ~ π(S_t, τ) = P(a | S_t, τ)
```

The policy maps observable context to a probability distribution over candidate agents. After agent execution, state updates:

```
S_{t+1} = Φ(S_t, o_t)
```

where `o_t` is the output from the activated agent.

### Emergent Behaviors

**Compaction**: As the orchestrator trains, agent communication concentrates among a subset of recurrently active "hub" agents. Graph density increases, forming tightly coupled subnetworks with focused information exchange.

**Cyclicality**: Training produces cyclic agent connections that facilitate:

- Re-circulation of intermediate results
- Mutual verification between agents
- Continual refinement through recursive critique
- Analogous to Reflexion patterns but emergent rather than prescribed

### Training Approach

REINFORCE optimization:

```
J(θ) = E_πθ[R(τ)]
θ ← θ + α ∇_θ J(θ)
```

Parameters from paper:

- λ = 0.1 (accuracy-efficiency trade-off)
- γ = 0.99 (discount factor)
- Episode length = 4
- Parallel exploration = 3

---

## Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      PuppeteerOrchestrator                      │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │ StateManager│  │PolicyEngine │  │RewardTracker│            │
│  │             │  │             │  │             │            │
│  │ - aggregate │  │ - score     │  │ - outcome   │            │
│  │ - update    │  │ - sample    │  │ - feedback  │            │
│  │ - extract   │  │ - learn     │  │ - metrics   │            │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘            │
│         │                │                │                    │
│         └────────────────┼────────────────┘                    │
│                          ↓                                     │
│  ┌─────────────────────────────────────────────────────┐      │
│  │              Agent Selection Loop                    │      │
│  │  1. Get state S_t                                   │      │
│  │  2. Compute π(S_t, τ) via PolicyEngine              │      │
│  │  3. Sample a_t from distribution                    │      │
│  │  4. Execute agent a_t                               │      │
│  │  5. Observe output o_t                              │      │
│  │  6. Update S_{t+1} = Φ(S_t, o_t)                   │      │
│  │  7. Compute reward r_t                              │      │
│  │  8. Continue or terminate                           │      │
│  └─────────────────────────────────────────────────────┘      │
│                          ↓                                     │
├─────────────────────────────────────────────────────────────────┤
│                     Agent Registry                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ Thinker  │ │ Refiner  │ │ Critic   │ │ Executor │ ...     │
│  │ (decomp) │ │ (refine) │ │ (review) │ │ (action) │         │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component               | Responsibility                                                      |
| ----------------------- | ------------------------------------------------------------------- |
| `PuppeteerOrchestrator` | Main coordinator; implements orchestration loop                     |
| `StateManager`          | Aggregates agent states into global S_t; extracts per-agent context |
| `PolicyEngine`          | Computes agent selection probabilities; samples actions             |
| `RewardTracker`         | Tracks outcomes; computes rewards; accumulates gradients            |
| `AgentRegistry`         | Manages available puppet agents and their capabilities              |

---

## Core Interfaces

### PuppeteerTypes

```typescript
// packages/nexus-agents/src/agents/orchestration/puppeteer-types.ts

import type { IAgent, Task, TaskResult, AgentRole } from '../../core/index.js';
import type { Result } from '../../core/index.js';

/**
 * Global system state at step t.
 * Aggregates all relevant context for agent selection.
 */
export interface PuppeteerState {
  /** Current step number */
  readonly step: number;
  /** Task being executed */
  readonly task: Task;
  /** Accumulated agent outputs */
  readonly agentOutputs: readonly AgentStepOutput[];
  /** Current working context (compressed) */
  readonly context: string;
  /** Metadata for policy computation */
  readonly metadata: PuppeteerStateMetadata;
}

export interface AgentStepOutput {
  readonly step: number;
  readonly agentId: string;
  readonly output: unknown;
  readonly durationMs: number;
  readonly tokensUsed: number;
}

export interface PuppeteerStateMetadata {
  /** Estimated task progress (0-1) */
  readonly progress: number;
  /** Accumulated cost */
  readonly totalCost: number;
  /** Accumulated tokens */
  readonly totalTokens: number;
  /** Time elapsed in ms */
  readonly elapsedMs: number;
}

/**
 * Agent selection probability distribution.
 */
export interface AgentDistribution {
  /** Map of agentId -> selection probability */
  readonly probabilities: ReadonlyMap<string, number>;
  /** Scores before normalization (for debugging) */
  readonly rawScores: ReadonlyMap<string, number>;
  /** Reasoning for top choices */
  readonly reasoning: string;
}

/**
 * Result of one orchestration step.
 */
export interface PuppeteerStepResult {
  readonly selectedAgent: string;
  readonly agentOutput: AgentStepOutput;
  readonly newState: PuppeteerState;
  readonly reward: number;
  readonly shouldTerminate: boolean;
  readonly terminationReason?: PuppeteerTerminationReason;
}

export type PuppeteerTerminationReason =
  | 'task_complete'
  | 'max_steps'
  | 'timeout'
  | 'error'
  | 'cancelled'
  | 'convergence';

/**
 * Final result of Puppeteer orchestration.
 */
export interface PuppeteerResult {
  readonly success: boolean;
  readonly output: unknown;
  readonly trajectory: readonly PuppeteerStepResult[];
  readonly totalSteps: number;
  readonly totalDurationMs: number;
  readonly totalTokens: number;
  readonly totalCost: number;
  readonly emergentPatterns: EmergentPatterns;
  readonly metrics: PuppeteerMetrics;
}

/**
 * Detected emergent patterns during orchestration.
 */
export interface EmergentPatterns {
  /** Hub agents that received disproportionate traffic */
  readonly hubAgents: readonly HubAgentInfo[];
  /** Detected cyclic patterns in agent sequence */
  readonly cycles: readonly CycleInfo[];
  /** Graph density (measure of compaction) */
  readonly graphDensity: number;
}

export interface HubAgentInfo {
  readonly agentId: string;
  readonly activationCount: number;
  readonly percentage: number;
}

export interface CycleInfo {
  readonly agents: readonly string[];
  readonly occurrences: number;
}

export interface PuppeteerMetrics {
  readonly avgReward: number;
  readonly taskCompletionRate: number;
  readonly efficiencyScore: number;
  readonly compactionScore: number;
  readonly cyclicalityScore: number;
}

/**
 * Configuration for PuppeteerOrchestrator.
 */
export interface PuppeteerConfig {
  /** Maximum steps per task */
  readonly maxSteps?: number;
  /** Timeout in milliseconds */
  readonly timeoutMs?: number;
  /** Policy mode: rule-based, learned, or hybrid */
  readonly policyMode?: PolicyMode;
  /** Discount factor for rewards (gamma) */
  readonly discountFactor?: number;
  /** Exploration rate for sampling */
  readonly explorationRate?: number;
  /** Whether to track emergent patterns */
  readonly trackEmergentPatterns?: boolean;
}

export type PolicyMode = 'rule_based' | 'learned' | 'hybrid';

/**
 * Options for executing a task with Puppeteer.
 */
export interface PuppeteerExecuteOptions {
  readonly task: Task;
  /** Optional: override available agents */
  readonly agents?: readonly IAgent[];
  /** Optional: provide initial context */
  readonly initialContext?: string;
}
```

### PolicyEngine Interface

```typescript
// packages/nexus-agents/src/agents/orchestration/policy-engine-types.ts

import type { PuppeteerState, AgentDistribution } from './puppeteer-types.js';
import type { Result } from '../../core/index.js';

/**
 * Policy engine for computing agent selection distributions.
 */
export interface IPolicyEngine {
  /**
   * Compute probability distribution over agents given current state.
   */
  computeDistribution(
    state: PuppeteerState,
    availableAgents: readonly string[]
  ): Promise<Result<AgentDistribution, PolicyError>>;

  /**
   * Sample an agent from the computed distribution.
   */
  sampleAgent(distribution: AgentDistribution): string;

  /**
   * Update policy based on observed trajectory and rewards.
   * Only applicable for learned policies.
   */
  updatePolicy?(
    trajectory: readonly PolicyTrajectoryStep[],
    finalReward: number
  ): Promise<Result<void, PolicyError>>;

  /**
   * Get current policy parameters (for persistence).
   */
  getParameters?(): PolicyParameters;

  /**
   * Load policy parameters (for warm start).
   */
  loadParameters?(params: PolicyParameters): void;
}

export interface PolicyTrajectoryStep {
  readonly state: PuppeteerState;
  readonly action: string;
  readonly reward: number;
  readonly logProb: number;
}

export interface PolicyParameters {
  readonly version: string;
  readonly weights: Record<string, number>;
  readonly biases: Record<string, number>;
  readonly metadata: Record<string, unknown>;
}

export class PolicyError extends Error {
  constructor(
    message: string,
    public readonly code: PolicyErrorCode,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PolicyError';
  }
}

export type PolicyErrorCode =
  | 'INVALID_STATE'
  | 'NO_AGENTS'
  | 'COMPUTATION_FAILED'
  | 'UPDATE_FAILED';
```

### StateManager Interface

```typescript
// packages/nexus-agents/src/agents/orchestration/state-manager-types.ts

import type { PuppeteerState, AgentStepOutput } from './puppeteer-types.js';
import type { Task } from '../../core/index.js';

/**
 * Manages global state aggregation and updates.
 */
export interface IStateManager {
  /**
   * Create initial state for a task.
   */
  createInitialState(task: Task, initialContext?: string): PuppeteerState;

  /**
   * Update state after agent execution.
   * Implements: S_{t+1} = Φ(S_t, o_t)
   */
  updateState(currentState: PuppeteerState, agentOutput: AgentStepOutput): PuppeteerState;

  /**
   * Extract context relevant for a specific agent.
   */
  extractAgentContext(state: PuppeteerState, agentId: string): string;

  /**
   * Compress state to fit within context limits.
   */
  compressState(state: PuppeteerState, maxTokens: number): PuppeteerState;

  /**
   * Estimate progress toward task completion.
   */
  estimateProgress(state: PuppeteerState): number;
}
```

### Puppet Agent Types

```typescript
// packages/nexus-agents/src/agents/orchestration/puppet-types.ts

import type { IAgent, AgentRole } from '../../core/index.js';

/**
 * Extended agent interface for puppet agents.
 * Puppets have additional metadata for orchestration.
 */
export interface IPuppetAgent extends IAgent {
  /** Reasoning pattern this agent specializes in */
  readonly reasoningPattern: ReasoningPattern;
  /** Cost per invocation (for efficiency optimization) */
  readonly invocationCost: number;
  /** Average latency in ms */
  readonly avgLatencyMs: number;
  /** Whether this agent can terminate the task */
  readonly canTerminate: boolean;
}

export type ReasoningPattern =
  | 'decomposition' // Break task into subtasks
  | 'reflection' // Self-evaluate and identify issues
  | 'refinement' // Improve previous output
  | 'critique' // Evaluate others' work
  | 'modification' // Make specific changes
  | 'summarization' // Condense information
  | 'execution' // Take external action
  | 'termination'; // Decide when complete

/**
 * Default puppet agent configurations.
 */
export const DEFAULT_PUPPETS: readonly PuppetDefinition[] = [
  {
    id: 'puppet-decomposer',
    role: 'thinker',
    reasoningPattern: 'decomposition',
    description: 'Breaks complex tasks into manageable subtasks',
    invocationCost: 0.3,
    avgLatencyMs: 2000,
    canTerminate: false,
  },
  {
    id: 'puppet-reflector',
    role: 'thinker',
    reasoningPattern: 'reflection',
    description: 'Evaluates progress and identifies gaps',
    invocationCost: 0.2,
    avgLatencyMs: 1500,
    canTerminate: false,
  },
  {
    id: 'puppet-refiner',
    role: 'worker',
    reasoningPattern: 'refinement',
    description: 'Iteratively improves solutions',
    invocationCost: 0.4,
    avgLatencyMs: 3000,
    canTerminate: false,
  },
  {
    id: 'puppet-critic',
    role: 'verifier',
    reasoningPattern: 'critique',
    description: 'Provides detailed feedback on outputs',
    invocationCost: 0.25,
    avgLatencyMs: 2000,
    canTerminate: false,
  },
  {
    id: 'puppet-executor',
    role: 'worker',
    reasoningPattern: 'execution',
    description: 'Executes actions using tools',
    invocationCost: 0.5,
    avgLatencyMs: 5000,
    canTerminate: false,
  },
  {
    id: 'puppet-terminator',
    role: 'verifier',
    reasoningPattern: 'termination',
    description: 'Decides when task is complete',
    invocationCost: 0.1,
    avgLatencyMs: 1000,
    canTerminate: true,
  },
];

export interface PuppetDefinition {
  readonly id: string;
  readonly role: AgentRole;
  readonly reasoningPattern: ReasoningPattern;
  readonly description: string;
  readonly invocationCost: number;
  readonly avgLatencyMs: number;
  readonly canTerminate: boolean;
}
```

---

## Implementation Phases

### Phase 1: Rule-Based Puppeteer (Immediate - 2 weeks)

**Goal**: Implement the Puppeteer architecture with rule-based agent selection. This provides the infrastructure for future learning while delivering immediate value.

**Deliverables**:

1. **Core Types** (`puppeteer-types.ts`)
   - All interfaces defined above
   - Zod schemas for validation
   - Result types

2. **State Manager** (`state-manager.ts`)
   - Initial state creation
   - State update function Φ(S_t, o_t)
   - Context extraction per agent
   - Progress estimation

3. **Rule-Based Policy** (`rule-based-policy.ts`)
   - Scoring based on:
     - Task analysis (domain, complexity)
     - Agent capabilities
     - Previous outputs (avoid repetition)
     - Cost/latency constraints
   - Deterministic selection (highest score)
   - Optional softmax sampling for exploration

4. **Puppeteer Orchestrator** (`puppeteer-orchestrator.ts`)
   - Main orchestration loop
   - Step execution
   - Termination detection
   - Result aggregation

5. **Emergent Pattern Tracking** (`pattern-tracker.ts`)
   - Hub agent detection
   - Cycle detection in agent sequence
   - Graph density calculation

6. **Tests** (35+ tests)
   - Unit tests for each component
   - Integration tests for full orchestration
   - Pattern detection tests

**Integration with Existing System**:

```typescript
// Use existing expert selector for initial scoring
import { selectExperts } from '../experts/expert-selector.js';
import { analyzeTask } from '../experts/task-analyzer.js';

// Integrate with TRINITY roles
import type { TrinityRole } from './trinity-types.js';

// Use existing event bus for observability
import { emitPuppeteerStarted, emitPuppeteerStep } from './puppeteer-events.js';
```

### Phase 2: Learned Routing Policy (Medium-term - 4 weeks)

**Goal**: Add learning capability to the policy engine using historical data.

**Deliverables**:

1. **Trajectory Storage** (`trajectory-store.ts`)
   - Store (state, action, reward) trajectories
   - Efficient retrieval for training
   - Persistence to disk

2. **Reward Function** (`reward-function.ts`)
   - Task completion reward
   - Efficiency penalty (tokens, time)
   - Quality bonus (from verification)
   - Configurable λ parameter

3. **Learned Policy** (`learned-policy.ts`)
   - Feature extraction from state
   - Linear scoring with learned weights
   - REINFORCE gradient updates
   - Baseline for variance reduction

4. **Hybrid Policy** (`hybrid-policy.ts`)
   - Combine rule-based and learned scores
   - Gradual transition as confidence grows
   - Fallback to rules on uncertainty

5. **Training Pipeline** (`policy-trainer.ts`)
   - Batch updates from trajectory store
   - Learning rate scheduling
   - Validation on held-out tasks

6. **Tests** (25+ additional tests)
   - Reward computation tests
   - Policy update tests
   - Convergence tests with synthetic data

### Phase 3: Full RL-Trained Orchestrator (Long-term - 8 weeks)

**Goal**: Complete RL infrastructure with online learning and emergent behavior optimization.

**Deliverables**:

1. **Neural Policy Network** (optional, if embeddings available)
   - Embedding-based state representation
   - Neural scoring head
   - Gradient computation

2. **Online Learning** (`online-learner.ts`)
   - Real-time policy updates
   - Exploration-exploitation balance
   - Non-stationary adaptation

3. **Emergent Behavior Optimization**
   - Reward shaping for compaction
   - Reward shaping for cyclicality
   - Hub agent emergence detection

4. **A/B Testing Framework**
   - Compare policy versions
   - Statistical significance testing
   - Automatic rollback

5. **Persistence & Checkpointing**
   - Policy snapshots
   - Training state recovery
   - Version management

---

## Integration Points

### With Existing Agent System

```typescript
// packages/nexus-agents/src/agents/orchestration/puppeteer-orchestrator.ts

import { TrinityCoordinator } from '../collaboration/trinity-coordinator.js';
import { selectExperts, ExpertRegistry } from '../experts/expert-selector.js';
import { SessionMemory } from '../../context/session-memory.js';

/**
 * PuppeteerOrchestrator integrates with existing systems:
 *
 * 1. Uses TrinityCoordinator for individual agent execution
 * 2. Uses ExpertRegistry for puppet agent discovery
 * 3. Uses SessionMemory for cross-session learning
 * 4. Emits events to EventBus for observability
 */
export class PuppeteerOrchestrator {
  constructor(
    private readonly policyEngine: IPolicyEngine,
    private readonly stateManager: IStateManager,
    private readonly expertRegistry: ExpertRegistry,
    private readonly sessionMemory: SessionMemory,
    private readonly eventBus: IEventBus,
    private readonly config: PuppeteerConfig
  ) {}

  // ... implementation
}
```

### With CLI Adapters and Routing

```typescript
// Integrate with CompositeRouter for model selection per puppet
import { CompositeRouter } from '../../cli-adapters/composite-router.js';

// Each puppet can use different model tiers
const puppetModelTiers: Record<ReasoningPattern, ModelTier> = {
  decomposition: 'powerful', // Needs strong reasoning
  reflection: 'balanced', // Medium complexity
  refinement: 'powerful', // Quality-focused
  critique: 'balanced', // Evaluation
  modification: 'fast', // Quick changes
  summarization: 'fast', // Straightforward
  execution: 'balanced', // Tool use
  termination: 'fast', // Simple decision
};
```

### With Workflow System

```typescript
// Puppeteer can be used as a WorkflowStep
import type { WorkflowStep, WorkflowStepResult } from '../../workflows/index.js';

export function createPuppeteerStep(config: PuppeteerConfig): WorkflowStep {
  return {
    name: 'puppeteer-orchestration',
    execute: async (input, context) => {
      const orchestrator = new PuppeteerOrchestrator(/* ... */);
      return orchestrator.execute({ task: input.task });
    },
  };
}
```

### File Structure

```
packages/nexus-agents/src/agents/orchestration/
├── index.ts                      # Public exports
├── puppeteer-types.ts            # Core type definitions
├── puppeteer-orchestrator.ts     # Main orchestrator class
├── puppeteer-orchestrator.test.ts
├── state-manager.ts              # State aggregation
├── state-manager-types.ts
├── state-manager.test.ts
├── policy-engine-types.ts        # Policy interfaces
├── rule-based-policy.ts          # Phase 1 policy
├── rule-based-policy.test.ts
├── learned-policy.ts             # Phase 2 policy
├── learned-policy.test.ts
├── hybrid-policy.ts              # Phase 2 hybrid
├── hybrid-policy.test.ts
├── reward-function.ts            # Reward computation
├── reward-function.test.ts
├── pattern-tracker.ts            # Emergent pattern detection
├── pattern-tracker.test.ts
├── puppet-types.ts               # Puppet agent definitions
├── puppet-factory.ts             # Create puppet agents
├── puppet-factory.test.ts
├── trajectory-store.ts           # Phase 2 trajectory storage
├── trajectory-store.test.ts
├── puppeteer-events.ts           # EventBus integration
└── puppeteer-helpers.ts          # Utility functions
```

---

## Testing Strategy

### Unit Tests (Per Component)

| Component             | Tests | Coverage Target |
| --------------------- | ----- | --------------- |
| PuppeteerOrchestrator | 15    | 90%             |
| StateManager          | 10    | 95%             |
| RuleBasedPolicy       | 12    | 90%             |
| PatternTracker        | 8     | 85%             |
| PuppetFactory         | 5     | 90%             |

### Integration Tests

1. **End-to-End Orchestration**
   - Execute task through full pipeline
   - Verify correct agent sequence
   - Check termination conditions

2. **Pattern Emergence**
   - Run multiple tasks
   - Verify hub detection works
   - Verify cycle detection works

3. **Error Recovery**
   - Agent failure handling
   - Timeout handling
   - Graceful degradation

### Benchmark Tests

1. **Comparison with Static Orchestration**
   - Same tasks with TRINITY
   - Same tasks with expert-selector
   - Measure completion rate, tokens, time

2. **Scaling Tests**
   - Vary number of puppet agents
   - Vary task complexity
   - Measure overhead

---

## Migration Path

### From Expert Selector

Current usage:

```typescript
const result = await selectExperts(task, registry);
const primaryExpert = result.value.primary;
await expert.execute(task);
```

With Puppeteer:

```typescript
const orchestrator = new PuppeteerOrchestrator(config);
const result = await orchestrator.execute({ task });
// Orchestrator handles agent selection internally
```

### From TRINITY Coordinator

Current usage:

```typescript
const coordinator = new TrinityCoordinator(config);
const result = await coordinator.execute({ task, agent });
// Fixed Thinker -> Worker -> Verifier sequence
```

With Puppeteer:

```typescript
const orchestrator = new PuppeteerOrchestrator({
  policyMode: 'rule_based',
  // TRINITY-like puppets available
});
const result = await orchestrator.execute({ task });
// Dynamic sequence, may emerge to TRINITY-like pattern
```

### Coexistence Strategy

Both systems can coexist:

1. **Puppeteer for complex multi-step tasks**
   - Research tasks
   - Code generation with iteration
   - Tasks benefiting from dynamic routing

2. **TRINITY for well-defined patterns**
   - Code review (fixed think/work/verify)
   - Quick tasks with known structure

3. **Expert Selector for single-agent tasks**
   - Simple questions
   - Direct code edits
   - Documentation lookups

---

## Open Questions

### Design Decisions Needed

1. **Policy Persistence Format**
   - JSON for simplicity?
   - Binary for efficiency?
   - Database for querying?

2. **Reward Function Tuning**
   - How to balance completion vs efficiency (λ)?
   - Should reward be task-type specific?

3. **Agent Termination**
   - When should orchestrator force-stop?
   - How many steps without progress?

4. **Learning Rate**
   - Online learning rate?
   - Batch size for updates?

### Research Questions

1. **Compaction Discovery**
   - Can we encourage hub emergence without explicit reward?
   - How to prevent over-compaction (single-agent collapse)?

2. **Cyclicality Bounds**
   - How many cycles are beneficial?
   - When does cyclicality become infinite loops?

3. **Transfer Learning**
   - Can policy transfer between task types?
   - Domain adaptation strategies?

---

## References

- [arXiv:2505.19591](https://arxiv.org/abs/2505.19591) - Multi-Agent Collaboration via Evolving Orchestration
- [GitHub: ChatDev/puppeteer](https://github.com/OpenBMB/ChatDev/tree/puppeteer) - Reference implementation
- [Issue #335](https://github.com/nexus-substrate/nexus-agents/issues/335) - GitHub tracking issue
- [TRINITY (arXiv:2512.04695)](https://arxiv.org/abs/2512.04695) - Related coordination pattern
- [REINFORCE Algorithm](https://link.springer.com/article/10.1007/BF00992696) - Policy gradient method

---

## Appendix A: Reward Function Design

```typescript
/**
 * Reward function for Puppeteer orchestration.
 *
 * R(τ) = R_completion + λ * R_efficiency + R_quality
 *
 * where:
 * - R_completion: 1.0 if task completed successfully, 0.0 otherwise
 * - R_efficiency: -(cost / max_cost) - (time / max_time)
 * - R_quality: quality score from verification (0.0 - 1.0)
 * - λ: efficiency trade-off parameter (default 0.1)
 */
export function computeReward(
  trajectory: readonly PuppeteerStepResult[],
  taskCompleted: boolean,
  qualityScore: number,
  config: RewardConfig
): number {
  const completionReward = taskCompleted ? 1.0 : 0.0;

  const totalCost = trajectory.reduce((sum, s) => sum + s.agentOutput.tokensUsed * 0.001, 0);
  const totalTime = trajectory.reduce((sum, s) => sum + s.agentOutput.durationMs, 0);
  const efficiencyReward = -(totalCost / config.maxCost) - totalTime / config.maxTime;

  const qualityReward = qualityScore;

  return completionReward + config.lambda * efficiencyReward + config.qualityWeight * qualityReward;
}
```

---

## Appendix B: State Update Function

```typescript
/**
 * State update function Φ(S_t, o_t).
 *
 * Aggregates agent output into global state while maintaining
 * manageable context size through compression.
 */
export function updateState(
  currentState: PuppeteerState,
  agentOutput: AgentStepOutput
): PuppeteerState {
  const newOutputs = [...currentState.agentOutputs, agentOutput];

  // Compress context if growing too large
  const maxContextTokens = 8000;
  let newContext = currentState.context;
  if (estimateTokens(newContext) > maxContextTokens * 0.8) {
    newContext = compressContext(newContext, agentOutput);
  } else {
    newContext = appendToContext(newContext, agentOutput);
  }

  return {
    step: currentState.step + 1,
    task: currentState.task,
    agentOutputs: newOutputs,
    context: newContext,
    metadata: {
      progress: estimateProgress(newOutputs, currentState.task),
      totalCost: currentState.metadata.totalCost + agentOutput.tokensUsed * 0.001,
      totalTokens: currentState.metadata.totalTokens + agentOutput.tokensUsed,
      elapsedMs: Date.now() - currentState.metadata.elapsedMs,
    },
  };
}
```

---

_Generated: 2026-01-17 (ET)_
_Author: Claude Opus 4.6 via Research Agent_
