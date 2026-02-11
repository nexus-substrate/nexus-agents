# Key Interfaces & Contracts

_Canonical interfaces between nexus-agents modules. Each interface cited with source location._

_Generated: 2026-02-08_

---

## Module Boundary Contracts

### 1. Task Analysis Interface

**Source:** `src/core/task-analysis/shared-task-analyzer.ts`

```typescript
interface ISharedTaskAnalyzer {
  analyze(description: string): TaskAnalysisResult;
}

interface TaskAnalysisResult {
  taskType: TaskTypeCategory; // architecture | code_implementation | code_review | ...
  complexity: ComplexityLevel; // simple | moderate | complex | expert
  reasoningType: ReasoningKnowledgeType; // knowledge | reasoning | creative | mixed
  capabilities: TaskCapabilities; // { parallelizable, needsCodeGeneration, ... }
  ambiguityScore: number; // 0-1 (Issue #903)
  constraints: TaskConstraints; // { time?, quality?, scope[] }
  requiredCapabilities: RequiredCapabilities; // { tools[], experts[] }
  matchedSignals: string[];
}
```

**Consumers:** WorkflowRouter, delegate_to_model, orchestrate tool, capability gap detector

---

### 2. CLI Adapter Interface

**Source:** `src/cli-adapters/types.ts`

```typescript
interface ICliAdapter {
  readonly cli: CliName;
  readonly model: string;

  execute(prompt: string, options?: ExecutionOptions): Promise<CliResponse>;
  getModelInfo(): ModelInfo;
  isAvailable(): Promise<boolean>;
  getVersion(): Promise<string>;
}

interface CliResponse {
  text: string;
  usage?: TokenUsage;
  metadata?: Record<string, unknown>;
}

interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  maxOutput?: number;
  costPerMillionInput?: number;
  costPerMillionOutput?: number;
}
```

**Implementations:** ClaudeCliAdapter, GeminiCliAdapter, CodexCliAdapter, CodexMcpAdapter

---

### 3. Composite Router Interface

**Source:** `src/core/types/index.ts`, implemented in `src/cli-adapters/composite-router.ts`

```typescript
interface ICompositeRouter {
  route(task: RoutingTask): Promise<RoutingResult>;
}

// Pipeline stages (in order):
// BudgetRouter -> ZeroRouter -> PreferenceRouter -> TopsisRouter -> LinUCB
```

**Consumer:** `delegate_to_model` MCP tool

---

### 4. Consensus Engine Interface

**Source:** `src/consensus/engine.ts`

```typescript
interface IConsensusEngine {
  collectVotes(proposal: string, roles: VoterRole[]): Promise<Vote[]>;
  aggregate(votes: Vote[], strategy: VotingStrategy): ConsensusResult;
}

interface ConsensusResult {
  decision: 'approved' | 'rejected';
  votes: Vote[];
  reasoning: string;
  confidence: number;
}
```

**Consumer:** `consensus_vote` MCP tool

---

### 5. Workflow Router Interface

**Source:** `src/orchestration/workflow-router.ts`

```typescript
interface IWorkflowRouter {
  route(signals: TaskSignals, options?: WorkflowRouterOptions): RoutingDecision;
  recordOutcome(outcome: PatternOutcome): void;
  getMetrics(pattern?: WorkflowPattern): readonly PatternMetrics[];
}

interface TaskSignals {
  description: string;
  subtaskCount?: number;
  dependencyStructure?: 'linear' | 'dag' | 'independent' | 'unknown';
  requiresConsensus?: boolean;
  isNovel?: boolean;
  timeConstraint?: 'urgent' | 'normal' | 'relaxed';
  forcePattern?: WorkflowPattern;
}

interface RoutingDecision {
  pattern: WorkflowPattern; // sequential | wave | graph | consensus | aflow | puppeteer
  reasoning: string;
  confidence: number;
  needsClarification?: boolean;
  suggestedQuestions?: string[];
  capabilityGaps?: CapabilityGapReport;
}
```

**Consumer:** `orchestrate` MCP tool (via Issue #846)

---

### 6. Graph Workflow Interface

**Source:** `src/orchestration/graph/graph-builder.ts`

```typescript
interface IGraphBuilder {
  addNode(id: string, config: NodeConfig): IGraphBuilder;
  addEdge(from: string, to: string, condition?: EdgeCondition): IGraphBuilder;
  build(): WorkflowGraph;
}

interface WorkflowGraph {
  nodes: Map<string, GraphNode>;
  edges: Edge[];
  execute(context: ExecutionContext): Promise<GraphResult>;
}
```

**Consumer:** AI Software Factory (`compileSpecToGraph`), `run_graph_workflow` MCP tool

---

### 7. Expert Agent Interface

**Source:** `src/agents/experts/expert-factory.ts`

```typescript
interface IExpert {
  readonly role: ExpertRole;
  execute(task: string, context?: ExpertContext): Promise<ExpertResult>;
}

type ExpertRole =
  | 'code_expert'
  | 'architecture_expert'
  | 'security_expert'
  | 'documentation_expert'
  | 'testing_expert'
  | 'devops_expert'
  | 'research_expert'
  | 'pm_expert'
  | 'ux_expert';
```

**Consumer:** `create_expert` / `execute_expert` MCP tools

---

### 8. Gateway Middleware Interface

**Source:** `src/mcp/gateway/gateway-middleware.ts`

```typescript
interface IGateway {
  wrapTool(name: string, handler: ToolHandler): ToolHandler;
  classifyRequestTier(toolName: string, params: unknown): RequestTier;
}

enum RequestTier {
  DIRECT = 1, // Simple lookups, no orchestration
  ANALYZED = 2, // Requires task analysis
  ORCHESTRATED = 3, // Full multi-agent orchestration
}
```

**Purpose:** Wraps all 21 MCP tool handlers with tier classification and logging.

---

### 9. Model Registry Interface

**Source:** `src/config/model-capabilities.ts`

```typescript
interface ModelCapability {
  modelId: ModelId;
  displayName: string;
  cliName: CliNameLiteral; // 'claude' | 'gemini' | 'codex'
  cliModelName: string;
  contextWindow: number;
  maxOutputTokens?: number;
  pricing?: { inputPer1M: number; outputPer1M: number };
  qualityScores?: QualityScores;
  isDefault?: boolean;
}
```

**Consumers:** All adapter `getModelInfo()` methods, `delegate_to_model`, `registry_import`

---

### 10. Security Pipeline Interface

**Source:** `src/security/firewall/hostile-input-firewall.ts`

```typescript
interface IHostileInputFirewall {
  process(input: FirewallInput): FirewallResult;
}

interface FirewallResult {
  sanitizedContent: string;
  trustTier: TrustTier;
  reputation?: number;
  atl: string; // Agent Trust Label
  quarantined: QuarantinedItem[];
  auditEntries: AuditEntry[];
}
```

**Consumer:** `issue_triage` MCP tool

---

## Cross-Module Data Flow Summary

```
User Request
  |
  v
MCP Server (cli-server.ts)
  |
  v
Gateway Middleware (tier classification + logging)
  |
  v
Tool Handler (mcp/tools/*.ts)
  |
  +---> SharedTaskAnalyzer (task classification)
  |
  +---> WorkflowRouter (pattern selection) ---> Graph | Wave | Sequential | Consensus
  |
  +---> CompositeRouter (model selection) ---> BudgetRouter -> ZeroRouter -> Preference -> TOPSIS -> LinUCB
  |
  +---> CLI Adapter (subprocess execution) ---> Claude CLI | Gemini CLI | Codex CLI
  |
  v
Response (JSON via MCP protocol)
```
