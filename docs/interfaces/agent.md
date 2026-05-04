# IAgent Interface

## Purpose

`IAgent` defines the contract for all agents in the system. Agents are autonomous entities that can execute tasks, collaborate with other agents, and maintain their own lifecycle state.

## Contract

```typescript
interface IAgent {
  /** Unique agent identifier */
  readonly id: string;

  /** Agent role */
  readonly role: AgentRole;

  /** Current state */
  readonly state: AgentState;

  /** Agent capabilities */
  readonly capabilities: readonly AgentCapability[];

  /**
   * Execute a task.
   * @param task - Task to execute
   * @returns Result with TaskResult or AgentError
   */
  execute(task: Task): Promise<Result<TaskResult, AgentError>>;

  /**
   * Handle an inter-agent message.
   * @param msg - Message to handle
   * @returns Result with AgentResponse or AgentError
   */
  handleMessage(msg: AgentMessage): Promise<Result<AgentResponse, AgentError>>;

  /**
   * Initialize the agent with context.
   * @param ctx - Agent context
   * @returns Result with void or AgentError
   */
  initialize(ctx: AgentContext): Promise<Result<void, AgentError>>;

  /**
   * Cleanup agent resources.
   */
  cleanup(): Promise<void>;
}
```

## Supporting Types

### AgentState

```typescript
type AgentState = 'idle' | 'thinking' | 'acting' | 'waiting' | 'error';
```

### AgentRole

```typescript
type AgentRole =
  | 'orchestrator' // Coordinates multi-agent workflows (Issue #759)
  | 'code_expert'
  | 'architecture_expert'
  | 'security_expert'
  | 'documentation_expert'
  | 'testing_expert'
  | 'devops_expert'
  | 'research_expert'
  | 'pm_expert' // Product manager: requirements, user stories, acceptance criteria (Issue #902)
  | 'ux_expert' // UX designer: interaction design, usability, user journeys (Issue #902)
  | 'infrastructure_expert' // Physical server, bare metal, OOB management (Issue #1082)
  | 'qa_expert' // Quality assurance: code review, standards compliance, regression (#1684)
  | 'data_visualization_expert' // Data analysis, chart design, interactive visualizations
  | 'thinker' // TRINITY: High-level reasoning (arXiv:2512.04695)
  | 'worker' // TRINITY: Task execution
  | 'verifier' // TRINITY: Output validation
  | 'custom';
```

### Task

```typescript
interface Task {
  id: string;
  description: string;
  context: TaskContext;
  constraints?: TaskConstraints;
  priority?: number;
}
```

### TaskResult

```typescript
interface TaskResult {
  taskId: string;
  output: unknown;
  metadata: ResultMetadata;
}
```

## Implementations

| Agent                   | Role                | Specialization                             |
| ----------------------- | ------------------- | ------------------------------------------ |
| Orchestrator (TechLead) | orchestrator        | Task analysis, expert selection, synthesis |
| CodeExpert              | code_expert         | Code generation, review, refactoring       |
| ArchitectureExpert      | architecture_expert | System design, patterns                    |
| SecurityExpert          | security_expert     | Security review, threat modeling           |

## Usage Example

```typescript
import { type IAgent, type Task, isOk } from 'nexus-agents';

async function executeWithAgent(agent: IAgent, description: string): Promise<void> {
  // Initialize agent
  const initResult = await agent.initialize({
    config: { modelId: 'claude-sonnet-4', temperature: 0.3 },
  });
  if (!isOk(initResult)) throw initResult.error;

  // Create and execute task
  const task: Task = {
    id: crypto.randomUUID(),
    description,
    context: { workingDirectory: './' },
  };

  const result = await agent.execute(task);
  if (isOk(result)) {
    console.log('Task completed:', result.value.output);
  }

  // Cleanup
  await agent.cleanup();
}
```

## Error Handling

| Error                                 | Cause                 | Recovery           |
| ------------------------------------- | --------------------- | ------------------ |
| `AgentError` (AGENT_NOT_FOUND)        | Agent not registered  | Check agent ID     |
| `AgentError` (AGENT_EXECUTION_FAILED) | Task execution failed | Check task/context |

## State Machine

```
[*] --> Idle: initialize()
Idle --> Thinking: execute()
Thinking --> Acting: plan ready
Acting --> Waiting: external call
Waiting --> Thinking: response
Acting --> Idle: complete
```

## Testing

```typescript
import { describe, it, expect } from 'vitest';
import type { IAgent } from 'nexus-agents';

describe('IAgent', () => {
  it('should transition through states correctly', async () => {
    const agent = createMockAgent();
    expect(agent.state).toBe('idle');

    const task = { id: '1', description: 'test', context: {} };
    const promise = agent.execute(task);

    // State should change during execution
    expect(['thinking', 'acting']).toContain(agent.state);

    await promise;
    expect(agent.state).toBe('idle');
  });
});
```
