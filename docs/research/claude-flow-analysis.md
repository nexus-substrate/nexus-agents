# Claude-Flow Architecture Analysis Report

**Date:** 2026-01-04 (ET)
**Researcher:** Claude Research Agent
**Purpose:** Architecture patterns for nexus-agents adoption

---

## Executive Summary

Claude-flow is a comprehensive multi-agent orchestration system built on TypeScript/Deno with deep integration into the Claude ecosystem. The project provides a mature implementation of:

1. **Hive Mind Architecture** - Collective intelligence with a "Queen" coordinator
2. **Multiple Consensus Algorithms** - Raft, Byzantine, Gossip, and Proof-of-Learning
3. **Session Forking** - Parallel agent spawning (10-20x performance gain)
4. **Sophisticated Memory Management** - Multi-backend (SQLite, Markdown, Hybrid)
5. **Rich MCP Integration** - Full MCP server with extensive tool registry

---

## 1. Architecture & Orchestration Patterns

### 1.1 Core Orchestration Architecture

Claude-flow uses a layered orchestration model:

```
+-------------------+
|   MCP Server      |  <-- External Claude interface
+-------------------+
         |
+-------------------+
|  Orchestrator     |  <-- Task distribution & coordination
+-------------------+
         |
+-------------------+
|   HiveMind        |  <-- Collective intelligence core
|  +-------------+  |
|  |   Queen     |  |  <-- Strategic coordinator
|  +-------------+  |
+-------------------+
         |
+-------------------+
|  Agent Manager    |  <-- Lifecycle & resource management
+-------------------+
         |
+-------------------+
|   Agents          |  <-- Specialized workers
+-------------------+
```

**Key Pattern: Orchestrator with Injected Dependencies**

```typescript
// /tmp/claude-flow/src/core/orchestrator.ts
export class Orchestrator {
  constructor(
    private config: OrchestratorConfig,
    private eventBus: IEventBus,
    private logger: ILogger,
    private agentManager: IAgentManager,
    private taskScheduler: ITaskScheduler,
    private memoryManager: IMemoryManager,
    private coordinationManager: ICoordinationManager
  ) {}
}
```

### 1.2 Agent Types & Capabilities

Claude-flow defines rich agent taxonomies:

**Core Agent Types:**

```typescript
// /tmp/claude-flow/src/hive-mind/types.ts
export type AgentType =
  | 'coordinator' // Task management, resource allocation
  | 'researcher' // Information gathering, pattern recognition
  | 'coder' // Code generation, debugging, refactoring
  | 'analyst' // Data analysis, performance metrics
  | 'architect' // System design, architecture patterns
  | 'tester' // Test generation, quality assurance
  | 'reviewer' // Code review, standards enforcement
  | 'optimizer' // Performance optimization, algorithm improvement
  | 'documenter' // Technical writing, API docs
  | 'monitor' // System monitoring, health checks
  | 'specialist'; // Domain expertise, custom capabilities
```

**Agent Capability System:**

```typescript
export type AgentCapability =
  | 'task_management'
  | 'resource_allocation'
  | 'consensus_building'
  | 'code_generation'
  | 'refactoring'
  | 'debugging'
  | 'data_analysis'
  | 'performance_metrics'
  | 'bottleneck_detection'
  | 'system_design'
  | 'architecture_patterns';
// ... 30+ capabilities
```

### 1.3 Agent Lifecycle Management

```typescript
// /tmp/claude-flow/src/agents/agent-manager.ts
export class AgentManager extends EventEmitter {
  // State tracking
  private agents = new Map<string, AgentState>();
  private processes = new Map<string, ChildProcess>();
  private templates = new Map<string, AgentTemplate>();
  private clusters = new Map<string, AgentCluster>();
  private pools = new Map<string, AgentPool>();

  // Health monitoring
  private healthChecks = new Map<string, AgentHealth>();
  private healthInterval?: NodeJS.Timeout;
  private heartbeatInterval?: NodeJS.Timeout;

  // Auto-scaling
  private scalingPolicies = new Map<string, ScalingPolicy>();
}
```

**Agent Template Pattern:**

```typescript
interface AgentTemplate {
  name: string;
  type: AgentType;
  capabilities: AgentCapabilities;
  config: Partial<AgentConfig>;
  environment: Partial<AgentEnvironment>;
  startupScript?: string;
  dependencies?: string[];
}

// Pre-defined templates for each role
this.templates.set('researcher', {
  name: 'Research Agent',
  capabilities: {
    research: true,
    analysis: true,
    webSearch: true,
    maxConcurrentTasks: 5,
    reliability: 0.9,
    speed: 0.8,
    quality: 0.9,
  },
  config: {
    autonomyLevel: 0.8,
    learningEnabled: true,
    permissions: ['web-access', 'file-read'],
  },
});
```

---

## 2. Voting & Consensus Mechanisms

### 2.1 Multiple Consensus Algorithms

Claude-flow implements **four** consensus protocols:

```typescript
// /tmp/claude-flow/src/core/ConsensusEngine.ts
export class ConsensusEngine {
  private algorithms: Map<ConsensusType, IConsensusAlgorithm> = new Map();

  private initializeAlgorithms(): void {
    this.algorithms.set('raft', new RaftConsensus(this.database));
    this.algorithms.set('byzantine', new ByzantineConsensus(this.database));
    this.algorithms.set('gossip', new GossipConsensus(this.database));
    this.algorithms.set('proof-of-learning', new ProofOfLearningConsensus(this.database));
  }
}
```

### 2.2 Raft Consensus (Leader-Based)

```typescript
class RaftConsensus implements IConsensusAlgorithm {
  private leaderId: string | null = null;
  private term: number = 0;

  async propose(decision: Decision): Promise<Vote[]> {
    if (!this.leaderId) {
      await this.electLeader();
    }
    // Leader collects votes from followers
    // Strong consistency guarantee
  }
}
```

### 2.3 Byzantine Fault Tolerance

```typescript
class ByzantineConsensus implements IConsensusAlgorithm {
  async execute(consensus: Consensus): Promise<Result> {
    // Requires 2/3 + 1 majority
    const honestVotes = consensus.votes.filter((vote) => vote.confidence > 0.6);
    const required = Math.floor((consensus.votes.length * 2) / 3) + 1;

    if (honestVotes.length >= required && consensus.outcome) {
      return { success: true, data: { algorithm: 'byzantine' } };
    }
  }
}
```

### 2.4 Proof-of-Learning (Performance-Weighted)

```typescript
class ProofOfLearningConsensus implements IConsensusAlgorithm {
  async propose(decision: Decision): Promise<Vote[]> {
    for (const agentId of agentIds) {
      const performance = await this.getAgentPerformance(agentId);
      const learningScore = this.calculateLearningScore(performance);

      // Agents with better track records have more voting weight
      const vote: Vote = {
        agentId,
        decision: learningScore > 0.5 ? Math.random() > 0.2 : Math.random() > 0.6,
        confidence: learningScore, // Confidence = learning score
      };
    }
  }

  private calculateLearningScore(performance: any): number {
    const successWeight = 0.7;
    const experienceWeight = 0.3;
    return successScore * successWeight + experienceScore * experienceWeight;
  }
}
```

### 2.5 Voting Strategies

```typescript
// /tmp/claude-flow/src/hive-mind/integration/ConsensusEngine.ts
private initializeVotingStrategies(): void {
  this.votingStrategies.set('simple_majority', {
    threshold: 0.5,
    recommend: (proposal, analysis) => ({
      vote: analysis.data?.recommendation || true,
      confidence: 0.7,
    }),
  });

  this.votingStrategies.set('supermajority', {
    threshold: 0.66,  // 2/3 majority
    recommend: (proposal, analysis) => ({
      vote: analysis.data?.strongRecommendation || false,
      confidence: 0.8,
    }),
  });

  this.votingStrategies.set('unanimous', {
    threshold: 1.0,
    recommend: (proposal, analysis) => ({
      vote: analysis.data?.perfectAlignment || false,
      confidence: 0.9,
    }),
  });

  this.votingStrategies.set('qualified_majority', {
    threshold: 0.6,
    // Weighted by agent expertise
    recommend: (proposal, analysis) => {
      const expertise = analysis.data?.expertiseAlignment || 0.5;
      return { vote: expertise > 0.6, confidence: expertise };
    },
  });
}
```

---

## 3. Context & Memory Management

### 3.1 Memory Manager Architecture

```typescript
// /tmp/claude-flow/src/memory/manager.ts
export class MemoryManager implements IMemoryManager {
  private backend: IMemoryBackend; // SQLite, Markdown, or Hybrid
  private cache: MemoryCache; // LRU cache with size limits
  private indexer: MemoryIndexer; // Fast search indexing
  private banks = new Map<string, MemoryBank>(); // Per-agent memory banks
}
```

### 3.2 Memory Entry Structure

```typescript
interface MemoryEntry {
  id: string;
  agentId: string;
  content: string;
  type: 'fact' | 'decision' | 'context' | 'observation';
  tags: string[];
  timestamp: Date;
  version: number;
  metadata: Record<string, unknown>;
}
```

### 3.3 Hybrid Backend Pattern

```typescript
class HybridBackend implements IMemoryBackend {
  constructor(
    private primary: IMemoryBackend, // SQLite for speed
    private secondary: IMemoryBackend // Markdown for readability
  ) {}

  async store(entry: MemoryEntry): Promise<void> {
    // Store in both backends for redundancy
    await Promise.all([
      this.primary.store(entry),
      this.secondary.store(entry).catch(/* graceful degradation */),
    ]);
  }

  async retrieve(id: string): Promise<MemoryEntry | undefined> {
    // Try primary first, fallback to secondary
    const entry = await this.primary.retrieve(id);
    if (entry) return entry;
    return await this.secondary.retrieve(id);
  }
}
```

### 3.4 Token Tracking System

```typescript
// /tmp/claude-flow/src/cli/simple-commands/token-tracker.js
let tokenCache = {
  sessions: {},
  totals: { input: 0, output: 0, total: 0 },
  byAgent: {}, // Token usage per agent type
  byCommand: {}, // Token usage per command
  history: [], // Last 1000 interactions
};

export async function trackTokens(params) {
  const { sessionId, agentType, command, inputTokens, outputTokens } = params;

  // Update by agent type
  tokenCache.byAgent[agentType].input += inputTokens;
  tokenCache.byAgent[agentType].output += outputTokens;
  tokenCache.byAgent[agentType].count++;

  // Persist to disk
  await saveTokenData();
}

export function generateOptimizationSuggestions(tokenData) {
  const suggestions = [];

  // Analyze output ratio
  const outputRatio = tokenData.output / tokenData.total;
  if (outputRatio > 0.6) {
    suggestions.push('High output ratio. Consider more concise prompts.');
  }

  // Find token hogs
  const sortedAgents = Object.entries(tokenData.byAgent).sort((a, b) => b[1] - a[1]);
  const [topAgent, topUsage] = sortedAgents[0];
  const percentage = (topUsage / tokenData.total) * 100;
  if (percentage > 50) {
    suggestions.push(`${topAgent} consumes ${percentage.toFixed(0)}% of tokens.`);
  }

  return suggestions;
}
```

---

## 4. Work Distribution & Load Balancing

### 4.1 Task Scheduler

```typescript
// /tmp/claude-flow/src/coordination/scheduler.ts
export class TaskScheduler {
  protected tasks = new Map<string, ScheduledTask>();
  protected agentTasks = new Map<string, Set<string>>();
  protected taskDependencies = new Map<string, Set<string>>();
  protected completedTasks = new Set<string>();

  async assignTask(task: Task, agentId: string): Promise<void> {
    // Check dependencies
    if (task.dependencies.length > 0) {
      const unmetDependencies = task.dependencies.filter(
        (depId) => !this.completedTasks.has(depId)
      );
      if (unmetDependencies.length > 0) {
        throw new TaskDependencyError(task.id, unmetDependencies);
      }
    }

    // Store task and start execution
    this.tasks.set(task.id, scheduledTask);
    this.agentTasks.get(agentId)!.add(task.id);
    this.startTask(task.id);
  }

  async failTask(taskId: string, error: Error): Promise<void> {
    // Retry with exponential backoff
    if (scheduled.attempts < this.config.maxRetries) {
      const retryDelay = this.config.retryDelay * Math.pow(2, scheduled.attempts - 1);
      setTimeout(() => this.startTask(taskId), retryDelay);
    } else {
      // Cancel dependent tasks
      await this.cancelDependentTasks(taskId, 'Parent task failed');
    }
  }
}
```

### 4.2 Auto Strategy with ML Heuristics

```typescript
// /tmp/claude-flow/src/swarm/strategies/auto.ts
export class AutoStrategy extends BaseStrategy {
  private mlHeuristics: MLHeuristics;

  override async selectAgentForTask(
    task: TaskDefinition,
    availableAgents: AgentState[]
  ): Promise<string | null> {
    // Score agents using ML heuristics
    const scoredAgents = await Promise.all(
      availableAgents.map(async (agent) => ({
        agent,
        score: await this.calculateAgentScore(agent, task),
      }))
    );

    // Sort by score and select best
    scoredAgents.sort((a, b) => b.score - a.score);

    // Update performance history for future scoring
    this.updateAgentPerformanceHistory(selectedAgent.id.id, scoredAgents[0].score);

    return selectedAgent.id.id;
  }

  private initializeMLHeuristics(): MLHeuristics {
    return {
      taskTypeWeights: {
        development: 1.0,
        testing: 0.8,
        analysis: 0.9,
        optimization: 1.1,
      },
      complexityFactors: {
        integration: 1.5,
        system: 1.3,
        algorithm: 1.6,
      },
      parallelismOpportunities: ['independent modules', 'separate components', 'parallel testing'],
    };
  }
}
```

### 4.3 Agent Pools with Auto-Scaling

```typescript
interface AgentPool {
  id: string;
  type: AgentType;
  minSize: number;
  maxSize: number;
  currentSize: number;
  availableAgents: AgentId[];
  busyAgents: AgentId[];
  template: AgentTemplate;
  autoScale: boolean;
  scaleUpThreshold: number; // e.g., 80% utilization
  scaleDownThreshold: number; // e.g., 20% utilization
}

interface ScalingRule {
  metric: string; // e.g., 'utilization', 'queue_depth'
  threshold: number;
  comparison: 'gt' | 'lt' | 'gte' | 'lte';
  action: 'scale-up' | 'scale-down';
  amount: number;
  conditions?: string[]; // Additional requirements
}
```

---

## 5. MCP Integration

### 5.1 MCP Server Architecture

```typescript
// /tmp/claude-flow/src/mcp/server.ts
export class MCPServer implements IMCPServer {
  private transport: ITransport; // stdio or HTTP
  private toolRegistry: ToolRegistry; // Tool management
  private sessionManager: ISessionManager; // Session tracking
  private authManager: IAuthManager; // Authentication
  private loadBalancer?: ILoadBalancer; // Request throttling

  constructor(
    private orchestrator?: any, // Agent orchestration
    private swarmCoordinator?: any, // Swarm management
    private agentManager?: any, // Agent lifecycle
    private resourceManager?: any, // Resource allocation
    private messagebus?: any, // Inter-agent messaging
    private monitor?: any // Real-time monitoring
  ) {}
}
```

### 5.2 Tool Definition Pattern

```typescript
// /tmp/claude-flow/src/mcp/claude-flow-tools.ts
function createSpawnAgentTool(logger: ILogger): MCPTool {
  return {
    name: 'agents/spawn',
    description: 'Spawn a new Claude agent with specified configuration',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Type of specialized agent to spawn',
          // Enum populated dynamically from .claude/agents/
        },
        name: { type: 'string' },
        capabilities: { type: 'array', items: { type: 'string' } },
        maxConcurrentTasks: { type: 'number', default: 3 },
        priority: { type: 'number', default: 5 },
      },
      required: ['type', 'name'],
    },
    handler: async (input: any, context?: ClaudeFlowToolContext) => {
      const profile = {
        /* build from input */
      };
      const sessionId = await context.orchestrator.spawnAgent(profile);
      return { agentId: profile.id, sessionId, status: 'spawned' };
    },
  };
}
```

### 5.3 Dynamic Agent Type Enhancement

```typescript
async function enhanceToolWithAgentTypes(tool: MCPTool): Promise<MCPTool> {
  const availableTypes = await getAvailableAgentTypes();

  // Dynamically add enum values for agent type fields
  function addEnumToAgentTypeFields(obj: any) {
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'type' && value.description?.includes('.claude/agents/')) {
        value.enum = availableTypes;
      }
      // Recurse
    }
  }

  addEnumToAgentTypeFields(enhancedTool.inputSchema);
  return enhancedTool;
}
```

### 5.4 Complete Tool Registry

The MCP server exposes these tool categories:

```typescript
const tools = [
  // Agent management
  'agents/spawn',
  'agents/spawn-parallel', // Session forking for 10-20x speedup
  'agents/list',
  'agents/terminate',
  'agents/info',

  // Query control
  'queries/control',
  'queries/list',

  // Task management
  'tasks/create',
  'tasks/list',
  'tasks/status',
  'tasks/cancel',
  'tasks/assign',

  // Memory management
  'memory/query',
  'memory/store',
  'memory/delete',
  'memory/export',
  'memory/import',

  // System monitoring
  'system/status',
  'system/metrics',
  'system/health',

  // Configuration
  'config/get',
  'config/update',
  'config/validate',

  // Workflows
  'workflows/execute',
  'workflows/create',
  'workflows/list',

  // Terminal
  'terminal/execute',
  'terminal/list',
  'terminal/create',
];
```

---

## 6. Session Forking (Key Performance Feature)

```typescript
// /tmp/claude-flow/src/sdk/session-forking.ts
export class ParallelSwarmExecutor extends EventEmitter {
  /**
   * Spawn multiple agents in parallel using session forking
   * This is 10-20x faster than sequential spawning
   */
  async spawnParallelAgents(
    agentConfigs: ParallelAgentConfig[],
    options: SessionForkOptions = {}
  ): Promise<ParallelExecutionResult> {
    // Sort by priority
    const sortedConfigs = this.sortByPriority(agentConfigs);

    // Limit parallel execution to avoid overwhelming
    const maxParallel = options.maxParallelAgents || 10;
    const batches = this.createBatches(sortedConfigs, maxParallel);

    for (const batch of batches) {
      const batchPromises = batch.map((config) =>
        this.spawnSingleAgent(config, options, executionId)
      );
      await Promise.allSettled(batchPromises);
    }
  }

  private async spawnSingleAgent(config, options, executionId) {
    const sdkOptions: Options = {
      forkSession: true, // KEY: Enable session forking
      resume: options.baseSessionId,
      resumeSessionAt: options.resumeFromMessage,
      model: options.model || 'claude-sonnet-4',
      maxTurns: 50,
    };

    const forkedQuery = query({
      prompt: this.buildAgentPrompt(config),
      options: sdkOptions,
    });

    // Collect messages from forked session
    for await (const message of forkedQuery) {
      // Process streaming messages
    }
  }
}
```

---

## 7. Key Features for Nexus-Agents Adoption

### 7.1 Essential Patterns to Adopt

1. **Consensus Engine with Multiple Algorithms**
   - Implement configurable consensus (Raft for speed, Byzantine for security)
   - Use performance-weighted voting for AI agent decisions

2. **Memory Manager with Hybrid Backend**
   - SQLite for production, Markdown for debugging
   - Per-agent memory banks with cache layer

3. **Token Tracking**
   - Track usage by agent type and command
   - Generate optimization suggestions automatically

4. **Agent Templates**
   - Pre-defined capability profiles for each role
   - Easy spawning with sensible defaults

5. **Session Forking**
   - Parallel agent execution for 10-20x speedup
   - Batch processing with priority ordering

6. **Dynamic Tool Enhancement**
   - Load agent types from filesystem
   - Inject enums into tool schemas at runtime

### 7.2 Recommended Architecture Adaptations

```typescript
// Suggested nexus-agents structure based on claude-flow patterns

// packages/core/src/consensus/
export interface IConsensusEngine {
  propose(decision: Decision): Promise<ConsensusResult>;
  setAlgorithm(type: 'majority' | 'supermajority' | 'unanimous'): void;
}

// packages/core/src/memory/
export interface IMemoryManager {
  createBank(agentId: string): Promise<MemoryBank>;
  store(entry: MemoryEntry): Promise<void>;
  query(query: MemoryQuery): Promise<MemoryEntry[]>;
  getHealthStatus(): Promise<HealthStatus>;
}

// packages/agents/src/manager.ts
export interface IAgentManager {
  spawn(template: AgentTemplate): Promise<Agent>;
  spawnParallel(templates: AgentTemplate[]): Promise<Agent[]>;
  terminate(agentId: string, reason?: string): Promise<void>;
  getPool(type: AgentType): AgentPool;
  setScalingPolicy(policy: ScalingPolicy): void;
}

// packages/workflows/src/scheduler.ts
export interface ITaskScheduler {
  assign(task: Task, agentId: string): Promise<void>;
  complete(taskId: string, result: unknown): Promise<void>;
  fail(taskId: string, error: Error): Promise<void>;
  reschedule(agentId: string): Promise<void>;
}
```

### 7.3 Configuration Recommendations

```typescript
// Suggested default configuration
const defaultConfig = {
  orchestration: {
    maxAgents: 50,
    defaultTimeout: 30000,
    heartbeatInterval: 10000,
    healthCheckInterval: 30000,
    autoRestart: true,
  },
  consensus: {
    defaultAlgorithm: 'majority',
    defaultThreshold: 0.66,
    votingTimeout: 60000,
  },
  memory: {
    backend: 'hybrid',
    cacheSizeMB: 100,
    retentionDays: 30,
    syncInterval: 5000,
  },
  scaling: {
    scaleUpThreshold: 0.8,
    scaleDownThreshold: 0.2,
    cooldownPeriod: 300000,
  },
};
```

---

## 8. File Reference Map

| Feature         | Claude-Flow Path                                            | Purpose                 |
| --------------- | ----------------------------------------------------------- | ----------------------- |
| Orchestrator    | `/tmp/claude-flow/src/core/orchestrator.ts`                 | Central coordination    |
| Consensus       | `/tmp/claude-flow/src/core/ConsensusEngine.ts`              | Voting algorithms       |
| Memory          | `/tmp/claude-flow/src/memory/manager.ts`                    | Persistence layer       |
| Agent Manager   | `/tmp/claude-flow/src/agents/agent-manager.ts`              | Lifecycle management    |
| Task Scheduler  | `/tmp/claude-flow/src/coordination/scheduler.ts`            | Work distribution       |
| MCP Server      | `/tmp/claude-flow/src/mcp/server.ts`                        | External interface      |
| MCP Tools       | `/tmp/claude-flow/src/mcp/claude-flow-tools.ts`             | Tool definitions        |
| Session Forking | `/tmp/claude-flow/src/sdk/session-forking.ts`               | Parallel execution      |
| Token Tracker   | `/tmp/claude-flow/src/cli/simple-commands/token-tracker.js` | Usage monitoring        |
| Hive Mind       | `/tmp/claude-flow/src/hive-mind/core/HiveMind.ts`           | Collective intelligence |
| Queen           | `/tmp/claude-flow/src/hive-mind/core/Queen.ts`              | Strategic coordinator   |
| Auto Strategy   | `/tmp/claude-flow/src/swarm/strategies/auto.ts`             | ML-based scheduling     |
| Types           | `/tmp/claude-flow/src/hive-mind/types.ts`                   | Core type definitions   |

---

## 9. Implementation Priority

**Phase 1 - Core Foundation:**

1. Agent templates and capability system
2. Basic consensus (majority voting)
3. Memory manager with SQLite backend

**Phase 2 - Advanced Features:** 4. Full consensus engine (Raft, Byzantine) 5. Token tracking and optimization 6. Auto-scaling policies

**Phase 3 - Performance:** 7. Session forking for parallel agents 8. Hybrid memory backend 9. ML-based task scheduling

---

_Research completed: 2026-01-04 16:45 ET_
_Source: https://github.com/ruvnet/claude-flow_
_Commit: HEAD (cloned fresh)_
