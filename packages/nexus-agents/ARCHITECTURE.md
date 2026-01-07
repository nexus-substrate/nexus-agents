# Nexus Agents Architecture

**Version:** 2.0.1
**Last Updated:** 2026-01-06 (ET)
**Status:** Approved

---

## Table of Contents

1. [Overview](#overview)
2. [Core Separation of Concerns](#core-separation-of-concerns)
3. [Architecture Diagram](#architecture-diagram)
4. [Component Responsibilities](#component-responsibilities)
5. [Data Flow](#data-flow)
6. [TechLead vs WorkflowEngine](#techlead-vs-workflowengine)
7. [Plan-to-Workflow Conversion](#plan-to-workflow-conversion)
8. [Integration Patterns](#integration-patterns)

---

## Overview

Nexus Agents implements a multi-agent orchestration system with clear separation between **planning** and **execution** concerns. The system is designed around two primary coordination mechanisms:

1. **TechLead (Planner)** - Dynamic task analysis and execution planning
2. **WorkflowEngine (Executor)** - Static workflow definition execution

These components are intentionally separate and serve different use cases. They can work together through an optional plan-to-workflow conversion mechanism.

---

## Core Separation of Concerns

### TechLead = Planner

The TechLead agent is responsible for **dynamic analysis and planning**:

- Analyzes incoming tasks for complexity and requirements
- Breaks down complex tasks into subtasks
- Selects appropriate expert agents for subtasks
- Creates execution plans with parallel execution hints
- Synthesizes results from multiple experts

**Key Characteristics:**

- Dynamic and adaptive
- Context-aware decision making
- Real-time expert selection
- Single-use plans (not persisted)

### WorkflowEngine = Executor

The WorkflowEngine is responsible for **static workflow execution**:

- Parses predefined YAML/JSON workflow templates
- Validates workflow definitions against schemas
- Executes steps in dependency order
- Manages parallel execution phases
- Provides execution status and cancellation

**Key Characteristics:**

- Deterministic and repeatable
- Template-based definitions
- Persistent workflow templates
- Reusable across invocations

### Clear Handoff

The handoff between TechLead and WorkflowEngine is one-way and optional:

```
TechLead.execute(task)
    |
    v
ExecutionPlan (dynamic, ephemeral)
    |
    v (optional conversion)
WorkflowDefinition (static, reusable)
    |
    v
WorkflowEngine.execute(workflow, inputs)
```

**When to use each:**

| Scenario                   | Use TechLead        | Use WorkflowEngine |
| -------------------------- | ------------------- | ------------------ |
| One-off complex task       | Yes                 | No                 |
| Repeatable process         | No                  | Yes                |
| Unknown task structure     | Yes                 | No                 |
| Predefined steps           | No                  | Yes                |
| Need execution audit trail | Optional            | Yes                |
| Want to replay exact steps | Convert to workflow | Yes                |

---

## Architecture Diagram

### High-Level System Flow

```
                                    +-----------------+
                                    |   Claude CLI    |
                                    +--------+--------+
                                             |
                                             v
+--------------------------------------------------------------------------------+
|                              MCP Server Layer                                   |
|  +------------+  +---------------+  +----------------+  +------------------+   |
|  | orchestrate|  | create_expert |  | run_workflow   |  | delegate_to_model|   |
|  +-----+------+  +-------+-------+  +--------+-------+  +--------+---------+   |
+--------|-----------------|------------------|---------------------|-------------+
         |                 |                  |                     |
         v                 |                  v                     v
+------------------+       |         +------------------+   +------------------+
|    TechLead      |       |         | WorkflowEngine   |   |  Model Router    |
|    (Planner)     |       |         | (Executor)       |   |  (Delegation)    |
+--------+---------+       |         +--------+---------+   +--------+---------+
         |                 |                  |                     |
         v                 v                  v                     |
+--------------------------------------------------------------------------------+
|                           Expert Selection                                      |
|  +----------------+  +-----------------+  +-------------------+                 |
|  | ExpertSelector |  | ExpertRegistry  |  | TaskAnalyzer      |                 |
|  +-------+--------+  +--------+--------+  +---------+---------+                 |
+----------|-------------------|----------------------|---------------------------+
           |                   |                      |
           v                   v                      v
+--------------------------------------------------------------------------------+
|                              Expert Agents                                      |
|  +------------+  +-----------+  +------------+  +----------+  +------------+   |
|  | CodeExpert |  | Security  |  | Architect  |  | Testing  |  | Docs       |   |
|  |            |  | Expert    |  | Expert     |  | Expert   |  | Expert     |   |
|  +-----+------+  +-----+-----+  +-----+------+  +----+-----+  +-----+------+   |
+--------|---------------|--------------|---------------|--------------|----------+
         |               |              |               |              |
         v               v              v               v              v
+--------------------------------------------------------------------------------+
|                           Adapters Layer                                        |
|  +------------+  +-----------+  +------------+  +------------+                 |
|  | Claude     |  | OpenAI    |  | Gemini     |  | Ollama     |                 |
|  | Adapter    |  | Adapter   |  | Adapter    |  | Adapter    |                 |
|  +-----+------+  +-----+-----+  +-----+------+  +-----+------+                 |
+--------|---------------|--------------|--------------|---------------------------+
         |               |              |              |
         v               v              v              v
+--------------------------------------------------------------------------------+
|                              Core Layer                                         |
|  +------------+  +-----------+  +------------+  +------------+  +------------+ |
|  | Result<T,E>|  | Errors    |  | Logger     |  | Tracer     |  | Types      | |
|  +------------+  +-----------+  +------------+  +------------+  +------------+ |
+--------------------------------------------------------------------------------+
```

### TechLead Planning Flow

```
+-------------+     +-----------------+     +------------------+
|    Task     | --> | analyzeTask()   | --> |   TaskAnalysis   |
+-------------+     +-----------------+     +--------+---------+
                                                     |
                                                     v
                    +-----------------+     +------------------+
                    | decomposeTask() | <-- | needsDecomposition?
                    +--------+--------+     +------------------+
                             |
                             v
                    +------------------+
                    |    SubTask[]     |
                    +--------+---------+
                             |
                             v
                    +------------------+     +------------------+
                    | selectExperts()  | --> | ExpertAssignment[]
                    +--------+---------+     +------------------+
                             |
                             v
                    +------------------+
                    |  ExecutionPlan   |
                    +------------------+
```

### WorkflowEngine Execution Flow

```
+-------------------+     +------------------+     +------------------+
| WorkflowDefinition| --> | createExecutionPlan| --> |  ExecutionPlan  |
+-------------------+     +------------------+     +--------+---------+
                                                            |
                                                            v
                                                   +------------------+
                                                   |    Phase[]       |
                                                   | (parallel steps) |
                                                   +--------+---------+
                                                            |
                          +---------------+                 v
                          |               |        +------------------+
                          v               |        | executePhase()   |
                    +------------+        |        +--------+---------+
                    | StepResult |<-------+                 |
                    +-----+------+                          |
                          |                                 v
                          |                        +------------------+
                          +----------------------->| WorkflowResult   |
                                                   +------------------+
```

---

## Component Responsibilities

### Component Matrix

| Component                      | Responsibility          | Inputs                      | Outputs            | Dependencies                 |
| ------------------------------ | ----------------------- | --------------------------- | ------------------ | ---------------------------- |
| **MCP Server**                 | External interface      | MCP requests                | MCP responses      | Tools                        |
| **orchestrate tool**           | Task coordination       | Task description            | Execution result   | TechLead                     |
| **run_workflow tool**          | Workflow execution      | Template + inputs           | Workflow result    | WorkflowEngine               |
| **TechLead**                   | Planning & coordination | Task                        | ExecutionPlan      | ExpertSelector, BaseAgent    |
| **WorkflowEngine**             | Workflow execution      | WorkflowDefinition + inputs | WorkflowResult     | StepExecutor                 |
| **ExpertSelector**             | Expert matching         | Task                        | SelectionResult    | TaskAnalyzer, ExpertRegistry |
| **Expert (Code/Security/etc)** | Domain expertise        | Task                        | TaskResult         | BaseAgent, Adapter           |
| **Adapter**                    | Model communication     | CompletionRequest           | CompletionResponse | Core                         |

### Module Boundaries

```
src/
|
+-- core/               # FOUNDATION - No external dependencies
|   +-- result.ts       # Result<T, E> pattern
|   +-- errors.ts       # Error hierarchy
|   +-- logger.ts       # Logging utilities
|   +-- trace.ts        # Tracing and observability
|   +-- artifact.ts     # Artifact provenance tracking
|   +-- types/          # Shared type definitions
|
+-- config/             # CONFIG LAYER - Depends on core only
|   +-- schemas.ts      # Configuration Zod schemas
|   +-- loader.ts       # Config loading utilities
|
+-- adapters/           # MODEL LAYER - Depends on core only
|   +-- base-adapter.ts # Abstract adapter interface
|   +-- claude-adapter.ts
|   +-- openai-adapter.ts
|   +-- gemini-adapter.ts
|   +-- ollama-adapter.ts
|   +-- factory.ts      # Adapter factory
|
+-- agents/             # AGENT LAYER - Depends on core, adapters
|   +-- base-agent.ts   # Abstract agent interface
|   +-- tech-lead.ts    # TechLead (Planner)
|   +-- experts/        # Expert implementations
|   +-- collaboration/  # Multi-agent protocols
|
+-- workflows/          # WORKFLOW LAYER - Depends on core, agents
|   +-- workflow-types.ts      # Workflow schemas
|   +-- workflow-engine.ts     # WorkflowEngine (Executor)
|   +-- workflow-parser.ts     # YAML/JSON parsing
|   +-- execution-planner.ts   # Dependency ordering
|   +-- step-executor.ts       # Individual step execution
|
+-- mcp/                # MCP LAYER - Depends on all internal layers
|   +-- server.ts       # MCP server setup
|   +-- tools/          # Tool implementations
|   +-- middleware/     # Policy firewall, logging
|
+-- cli/                # CLI LAYER - CLI subcommand implementations
|   +-- doctor.ts       # Health check command
|   +-- repl.ts         # Interactive REPL
|   +-- config-init.ts  # Config file generation
|   +-- expert-list.ts  # Expert listing
|   +-- workflow-run.ts # Workflow execution
|
+-- cli-adapters/       # CLI ADAPTER LAYER - External CLI integration
    +-- types.ts        # CLI adapter type definitions
    +-- base-adapter.ts # Abstract CLI adapter base class
    +-- factory.ts      # CLI adapter factory
    +-- router.ts       # Capability-based task routing
    +-- circuit-breaker.ts # Fault tolerance patterns
    +-- adapters/       # Concrete adapter implementations
    |   +-- claude-adapter.ts
    |   +-- gemini-adapter.ts
    |   +-- codex-adapter.ts
    +-- parsers/        # Output parsing per CLI
        +-- claude-parser.ts
        +-- gemini-parser.ts
        +-- codex-parser.ts
```

---

## Data Flow

### Request Flow: orchestrate Tool

```
1. Claude CLI sends MCP request
   |
2. MCP Server receives request, routes to orchestrate tool
   |
3. orchestrate tool creates Task object
   |
4. TechLead.execute(task) is called
   |
5. TechLead.analyzeTask() returns TaskAnalysis
   |
6. If complex: TechLead.decomposeTask() returns SubTask[]
   |
7. TechLead.selectExperts() returns ExpertAssignment[]
   |
8. TechLead builds ExecutionPlan
   |
9. (Optional) ExecutionPlan can be converted to WorkflowDefinition
   |
10. Response returned to Claude CLI
```

### Request Flow: run_workflow Tool

```
1. Claude CLI sends MCP request with workflow template ID + inputs
   |
2. MCP Server receives request, routes to run_workflow tool
   |
3. WorkflowEngine.loadTemplate() parses YAML/JSON
   |
4. WorkflowEngine.execute(workflow, inputs) is called
   |
5. createExecutionPlan() orders steps by dependencies
   |
6. For each phase:
   |   executePhase() runs steps concurrently
   |   StepExecutor dispatches to appropriate Expert
   |   Expert.execute() returns TaskResult
   |   StepResult stored in context
   |
7. WorkflowResult assembled from all StepResults
   |
8. Response returned to Claude CLI
```

---

## TechLead vs WorkflowEngine

### Conceptual Comparison

```
                TechLead                    WorkflowEngine
                --------                    --------------
Purpose:        Dynamic planning            Static execution
Input:          Free-form task description  Structured workflow definition
Output:         ExecutionPlan               WorkflowResult
Expert Choice:  Runtime selection           Predefined in template
Parallelism:    Hints (advisory)            Enforced (execution phases)
Reusability:    Single-use                  Template-based, repeatable
Traceability:   In-memory only              Execution IDs, status tracking
```

### Interface Comparison

```typescript
// TechLead produces ExecutionPlan
interface ExecutionPlan {
  taskId: string;
  analysis: TaskAnalysis;
  subtasks: SubTask[];
  assignments: ExpertAssignment[];
  parallelGroups: string[][]; // Advisory parallelism hints
  estimatedDuration: number;
}

// WorkflowEngine consumes WorkflowDefinition
interface WorkflowDefinition {
  name: string;
  version: string;
  description?: string;
  inputs: InputDefinition[];
  steps: WorkflowStep[]; // Concrete step definitions
  timeout?: number;
}
```

### When to Use Each

**Use TechLead when:**

- Task requirements are ambiguous or complex
- You need adaptive expert selection
- One-off analysis is sufficient
- You want AI-driven decomposition

**Use WorkflowEngine when:**

- Process is well-defined and repeatable
- You need audit trails and execution IDs
- Steps and experts are known in advance
- You want deterministic execution

---

## Plan-to-Workflow Conversion

### Purpose

Sometimes you want to "crystallize" a TechLead-generated plan into a reusable workflow. This is an **optional** feature that bridges the two systems.

### Conversion Function

```typescript
// Optional method on ExecutionPlan
interface ExecutionPlan {
  taskId: string;
  analysis: TaskAnalysis;
  subtasks: SubTask[];
  assignments: ExpertAssignment[];
  parallelGroups: string[][];
  estimatedDuration: number;

  /**
   * Convert this execution plan to a reusable WorkflowDefinition.
   * This "crystallizes" the dynamic plan into a static, replayable workflow.
   *
   * @param options - Conversion options
   * @returns WorkflowDefinition that can be executed by WorkflowEngine
   */
  asWorkflowDefinition?(options?: PlanConversionOptions): WorkflowDefinition;
}

interface PlanConversionOptions {
  /** Workflow name (defaults to taskId) */
  name?: string;
  /** Workflow version (defaults to "1.0.0") */
  version?: string;
  /** Additional description */
  description?: string;
  /** Include original analysis as metadata */
  includeAnalysis?: boolean;
}
```

### Conversion Logic

```
ExecutionPlan                    WorkflowDefinition
-------------                    ------------------
taskId              -->          name (or custom)
(generated)         -->          version: "1.0.0"
analysis.approach   -->          description
(inferred)          -->          inputs: []
subtasks[]          -->          steps[]
  |
  +-- SubTask.id            -->  WorkflowStep.id
  +-- SubTask.description   -->  WorkflowStep.action
  +-- SubTask.assignedRole  -->  WorkflowStep.agent
  +-- SubTask.dependencies  -->  WorkflowStep.dependsOn
parallelGroups      -->          (sets parallel: true on steps)
estimatedDuration   -->          timeout (optional)
```

### Usage Example

```typescript
import { TechLead, WorkflowEngine } from 'nexus-agents';

// Step 1: TechLead creates a dynamic plan
const techLead = new TechLead({ adapter });
const result = await techLead.execute(task);
const plan = result.value.output as ExecutionPlan;

// Step 2: (Optional) Convert to reusable workflow
if (plan.asWorkflowDefinition) {
  const workflow = plan.asWorkflowDefinition({
    name: 'code-review-workflow',
    version: '1.0.0',
    description: 'Generated from TechLead analysis',
  });

  // Step 3: Save workflow for future use
  await saveWorkflowTemplate(workflow);

  // Step 4: Execute via WorkflowEngine
  const engine = new WorkflowEngine(deps);
  const workflowResult = await engine.execute(workflow, inputs);
}
```

### Conversion Constraints

Not all ExecutionPlans can be cleanly converted:

| Aspect           | ExecutionPlan        | WorkflowDefinition    | Conversion Notes                       |
| ---------------- | -------------------- | --------------------- | -------------------------------------- |
| Expert selection | Dynamic (at runtime) | Static (agent role)   | Role is "frozen" at conversion time    |
| Parallelism      | Advisory groups      | Explicit dependencies | parallelGroups become dependsOn chains |
| Inputs           | Implicit from task   | Explicit definitions  | Must be inferred or specified          |
| Conditions       | None                 | Optional              | Not supported in conversion            |
| Retries          | None                 | Optional              | Can be added post-conversion           |

---

## Integration Patterns

### Pattern 1: TechLead-Only (Dynamic)

```
Task -> TechLead -> ExecutionPlan -> (execute manually or discard)
```

Best for: One-off complex tasks, exploration, prototyping

### Pattern 2: WorkflowEngine-Only (Static)

```
Template -> WorkflowEngine -> WorkflowResult
```

Best for: Well-defined processes, CI/CD integration, audit requirements

### Pattern 3: TechLead + Crystallization (Hybrid)

```
Task -> TechLead -> ExecutionPlan -> asWorkflowDefinition() -> Template
                                            |
                                            v
                        WorkflowEngine.execute() -> WorkflowResult
```

Best for: Learning from ad-hoc tasks, creating reusable workflows from analysis

### Pattern 4: Collaboration Protocol

```
Task -> TechLead -> Expert Selection -> CollaborationSession
                                              |
                    +---------+-------+-------+
                    v         v       v       v
               Expert1   Expert2  Expert3  Expert4
                    |         |       |       |
                    +----+----+---+---+---+---+
                         v            v
                   ResultAggregator   ConsensusProtocol
                         |
                         v
                  AggregatedResult
```

Best for: Complex tasks requiring multiple expert perspectives

---

## Appendix: Key Type Definitions

### ExecutionPlan (TechLead Output)

```typescript
interface ExecutionPlan {
  taskId: string;
  analysis: TaskAnalysis;
  subtasks: SubTask[];
  assignments: ExpertAssignment[];
  parallelGroups: string[][];
  estimatedDuration: number;
  asWorkflowDefinition?(options?: PlanConversionOptions): WorkflowDefinition;
}

interface TaskAnalysis {
  taskId: string;
  complexity: number; // 1-10
  taskType: string;
  requirements: string[];
  risks: string[];
  needsDecomposition: boolean;
  approach: string;
  estimatedEffort: number;
}

interface SubTask {
  id: string;
  parentTaskId: string;
  description: string;
  expectedOutput: string;
  dependencies: string[];
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'failed';
  assignedRole?: AgentRole;
  complexity: number;
  requiredCapabilities: string[];
}

interface ExpertAssignment {
  subtaskId: string;
  expertRole: AgentRole;
  selectionReason: string;
  confidence: number; // 0-1
}
```

### WorkflowDefinition (WorkflowEngine Input)

```typescript
interface WorkflowDefinition {
  name: string;
  version: string; // semver
  description?: string;
  inputs: InputDefinition[];
  steps: WorkflowStep[];
  timeout?: number; // ms
}

interface WorkflowStep {
  id: string;
  agent: AgentRole;
  action: string;
  inputs: Record<string, unknown>;
  dependsOn?: string[];
  parallel?: boolean;
  retries?: number;
  timeout?: number;
  condition?: string;
}

interface InputDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  required?: boolean;
  default?: unknown;
}
```

---

_Architecture documented: 2026-01-06 (ET)_
_Reviewed by: TechLead, Architecture Expert, Security Expert_
