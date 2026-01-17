---
title: Agent Development
description: Create custom agents that participate in multi-agent collaboration and consensus protocols.
---

This guide covers creating custom agents for nexus-agents. Agents implement the `IAgent` interface and can participate in collaboration protocols.

## Agent Architecture

### Core Interface

```typescript
interface IAgent {
  readonly id: string;
  readonly role: AgentRole;
  readonly state: AgentState;
  readonly capabilities: readonly AgentCapability[];

  execute(task: Task): Promise<Result<TaskResult, AgentError>>;
  handleMessage(msg: AgentMessage): Promise<Result<AgentResponse, AgentError>>;
  initialize(ctx: AgentContext): Promise<Result<void, AgentError>>;
  cleanup(): Promise<void>;
}

type AgentState = 'idle' | 'thinking' | 'acting' | 'waiting' | 'error';

type AgentRole =
  | 'tech-lead'
  | 'architect'
  | 'code'
  | 'security'
  | 'docs'
  | 'test'
  | 'research'
  | 'devops'
  | 'worker'
  | 'thinker'
  | 'verifier';
```

### State Machine

Agents transition through states during execution:

```
Idle -> Thinking -> Acting -> Waiting -> Thinking -> ... -> Idle
          |           |         |
          v           v         v
        Error       Error     Error
          |           |         |
          v           v         v
        Idle        Idle      Idle
```

**State descriptions:**

- `idle` - Agent ready for new tasks
- `thinking` - Processing input, planning action
- `acting` - Executing planned action
- `waiting` - Waiting for external response
- `error` - Recoverable error state

## Creating Expert Agents

The simplest way to create custom agents is through the expert configuration.

### Step 1: Define Expert Configuration

```typescript
// src/agents/experts/my-expert.ts
import type { ExpertConfig } from './expert-types.js';

export const myExpertConfig: ExpertConfig = {
  type: 'my-domain',
  prompt: `You are an expert in [domain].

Your capabilities:
- Capability 1
- Capability 2

Your constraints:
- Always [constraint]
- Never [constraint]

Output format:
- Provide structured analysis
- Include actionable recommendations`,
  tier: 'balanced', // 'fast' | 'balanced' | 'powerful'
  tools: ['read_files', 'analyze_code'],
};
```

### Step 2: Register with ExpertFactory

```typescript
// src/agents/experts/expert-factory.ts
import { myExpertConfig } from './my-expert.js';

ExpertFactory.register('my-domain', myExpertConfig);
```

### Step 3: Use via Configuration

```yaml
# nexus-agents.yaml
experts:
  custom:
    my_expert:
      prompt: |
        You are an expert in Rust programming.
        Focus on memory safety and idiomatic patterns.
      tier: powerful
      tools: [read_files, analyze_code]
```

## Creating Custom Agent Classes

For complex agents with custom logic:

### Basic Agent Implementation

```typescript
// src/agents/custom/my-agent.ts
import type { IAgent, Task, TaskResult, AgentContext } from '../../core/types/index.js';
import { Result } from '../../core/result.js';
import { AgentError } from '../../core/errors.js';

export class MyAgent implements IAgent {
  readonly id: string;
  readonly role: AgentRole = 'worker';
  readonly capabilities = ['custom-capability'] as const;

  private _state: AgentState = 'idle';
  private context: AgentContext | null = null;

  constructor(id: string) {
    this.id = id;
  }

  get state(): AgentState {
    return this._state;
  }

  async initialize(ctx: AgentContext): Promise<Result<void, AgentError>> {
    this.context = ctx;
    this._state = 'idle';
    return { ok: true, value: undefined };
  }

  async execute(task: Task): Promise<Result<TaskResult, AgentError>> {
    this._state = 'thinking';

    try {
      // 1. Analyze task
      const analysis = this.analyzeTask(task);

      this._state = 'acting';

      // 2. Execute logic
      const result = await this.performAction(analysis);

      this._state = 'idle';

      return {
        ok: true,
        value: {
          agentId: this.id,
          output: result,
          metadata: { duration: Date.now() - task.createdAt },
        },
      };
    } catch (error) {
      this._state = 'error';
      return {
        ok: false,
        error: new AgentError(`Execution failed: ${error}`),
      };
    }
  }

  async handleMessage(msg: AgentMessage): Promise<Result<AgentResponse, AgentError>> {
    return {
      ok: true,
      value: { type: 'ack', content: 'Received' },
    };
  }

  async cleanup(): Promise<void> {
    this.context = null;
    this._state = 'idle';
  }

  private analyzeTask(task: Task): TaskAnalysis {
    // Task analysis logic
    return {
      /* ... */
    };
  }

  private async performAction(analysis: TaskAnalysis): Promise<string> {
    // Action execution logic
    return 'Result';
  }
}
```

### Agent with Model Integration

```typescript
import type { IModelAdapter } from '../../core/types/index.js';

export class ModelPoweredAgent implements IAgent {
  readonly id: string;
  readonly role: AgentRole = 'code';

  private adapter: IModelAdapter;
  private _state: AgentState = 'idle';

  constructor(id: string, adapter: IModelAdapter) {
    this.id = id;
    this.adapter = adapter;
  }

  async execute(task: Task): Promise<Result<TaskResult, AgentError>> {
    this._state = 'thinking';

    try {
      // Build prompt from task
      const prompt = this.buildPrompt(task);

      this._state = 'waiting';

      // Call model
      const response = await this.adapter.complete({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 4096,
      });

      if (!response.ok) {
        throw response.error;
      }

      this._state = 'idle';

      return {
        ok: true,
        value: {
          agentId: this.id,
          output: response.value.content,
          metadata: {
            tokens: response.value.usage.totalTokens,
          },
        },
      };
    } catch (error) {
      this._state = 'error';
      return {
        ok: false,
        error: new AgentError(`Model call failed: ${error}`),
      };
    }
  }

  private buildPrompt(task: Task): string {
    return `Task: ${task.description}\nContext: ${JSON.stringify(task.context)}`;
  }
}
```

## Collaboration Protocols

Agents can participate in multi-agent collaboration protocols.

### Sequential Collaboration

```typescript
import { CollaborationSession } from '../collaboration/collaboration-session.js';

const session = new CollaborationSession({
  pattern: 'sequential',
  agents: [agent1, agent2, agent3],
});

const result = await session.execute(task);
```

### Parallel Collaboration

```typescript
const session = new CollaborationSession({
  pattern: 'parallel',
  agents: [securityExpert, codeExpert, testExpert],
});

const results = await session.execute(task);
```

### Consensus Voting

```typescript
const session = new CollaborationSession({
  pattern: 'consensus',
  agents: [architect, security, devex, aiml, pm],
  consensusThreshold: 0.67, // Supermajority
});

const decision = await session.execute(proposal);
```

## Protocol-Aware Agents

For agents that participate in specific protocols:

### TRINITY Worker Agent

```typescript
class TrinityWorkerAgent implements IAgent {
  readonly role: AgentRole = 'worker';

  async execute(task: Task): Promise<Result<TaskResult, AgentError>> {
    // Worker role: Execute based on thinker's plan
    const plan = task.context?.plan;

    if (!plan) {
      return { ok: false, error: new AgentError('No plan provided') };
    }

    // Execute plan steps
    const results = await this.executePlan(plan);

    return {
      ok: true,
      value: { output: results, metadata: {} },
    };
  }

  private async executePlan(plan: ExecutionPlan): Promise<string> {
    // Implementation
    return 'Execution complete';
  }
}
```

### Reflexion Agent

```typescript
class ReflexionAgent implements IAgent {
  readonly role: AgentRole = 'verifier';

  async execute(task: Task): Promise<Result<TaskResult, AgentError>> {
    const output = task.context?.previousOutput;

    // Critique the output
    const critique = await this.critique(output);

    // Determine if revision needed
    const needsRevision = critique.severity > 0.3;

    return {
      ok: true,
      value: {
        output: critique.feedback,
        metadata: {
          needsRevision,
          severity: critique.severity,
        },
      },
    };
  }

  private async critique(output: string): Promise<Critique> {
    // Critique logic
    return { feedback: '', severity: 0 };
  }
}
```

## EventBus Integration

Agents can emit and subscribe to events for coordination.

### Emitting Events

```typescript
import { getGlobalEventBus } from '../collaboration/event-bus.js';

class EventAwareAgent implements IAgent {
  private eventBus = getGlobalEventBus();

  async execute(task: Task): Promise<Result<TaskResult, AgentError>> {
    // Emit task started event
    this.eventBus.emit({
      topic: 'agent.task_delegated',
      agentId: this.id,
      payload: { taskId: task.id },
      timestamp: Date.now(),
    });

    // ... execution ...

    // Emit result
    this.eventBus.emit({
      topic: 'agent.result_broadcast',
      agentId: this.id,
      payload: { taskId: task.id, success: true },
      timestamp: Date.now(),
    });

    return result;
  }
}
```

### Subscribing to Events

```typescript
constructor() {
  const eventBus = getGlobalEventBus();

  // Subscribe to consensus events
  eventBus.subscribe('consensus.*', (event) => {
    if (event.topic === 'consensus.vote_requested') {
      this.handleVoteRequest(event.payload);
    }
  });
}
```

## Testing Agents

### Unit Tests

```typescript
// src/agents/custom/my-agent.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { MyAgent } from './my-agent.js';

describe('MyAgent', () => {
  let agent: MyAgent;

  beforeEach(() => {
    agent = new MyAgent('test-agent');
  });

  it('should initialize correctly', async () => {
    const result = await agent.initialize({
      /* context */
    });
    expect(result.ok).toBe(true);
    expect(agent.state).toBe('idle');
  });

  it('should execute task', async () => {
    await agent.initialize({
      /* context */
    });

    const result = await agent.execute({
      id: 'task-1',
      description: 'Test task',
      createdAt: Date.now(),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.agentId).toBe('test-agent');
    }
  });

  it('should transition through states', async () => {
    await agent.initialize({
      /* context */
    });
    expect(agent.state).toBe('idle');

    const executePromise = agent.execute({
      id: 'task-1',
      description: 'Test',
      createdAt: Date.now(),
    });

    // State should change during execution
    await executePromise;
    expect(agent.state).toBe('idle');
  });

  it('should handle errors gracefully', async () => {
    await agent.initialize({
      /* context */
    });

    const result = await agent.execute({
      id: 'task-1',
      description: '', // Invalid
      createdAt: Date.now(),
    });

    expect(result.ok).toBe(false);
    expect(agent.state).toBe('idle'); // Reset after error
  });
});
```

### Integration Tests

```typescript
describe('Agent Collaboration', () => {
  it('should participate in consensus', async () => {
    const agents = [new MyAgent('agent-1'), new MyAgent('agent-2'), new MyAgent('agent-3')];

    const session = new CollaborationSession({
      pattern: 'consensus',
      agents,
    });

    const result = await session.execute({
      id: 'proposal-1',
      description: 'Test proposal',
      createdAt: Date.now(),
    });

    expect(result.ok).toBe(true);
  });
});
```

## Best Practices

### State Management

- Always transition through proper states
- Reset to `idle` after `error`
- Never skip states (idle -> acting is invalid)

### Error Handling

```typescript
async execute(task: Task): Promise<Result<TaskResult, AgentError>> {
  try {
    // Execution logic
  } catch (error) {
    this._state = 'error';

    // Log error with context
    logger.error('Agent execution failed', {
      agentId: this.id,
      taskId: task.id,
      error: error instanceof Error ? error.message : String(error),
    });

    // Reset state
    this._state = 'idle';

    return {
      ok: false,
      error: new AgentError(`Execution failed: ${error}`),
    };
  }
}
```

### Context Management

- Use ContextPruner for large contexts
- Prioritize recent and relevant information
- Clear context on cleanup

```typescript
import { ContextPruner } from '../context-pruner.js';

class ContextAwareAgent implements IAgent {
  private pruner = new ContextPruner({
    strategy: 'priority_weighted_age',
    maxTokens: 100000,
  });

  async execute(task: Task): Promise<Result<TaskResult, AgentError>> {
    // Prune context if needed
    const prunedContext = await this.pruner.prune(task.context);

    // Use pruned context
    // ...
  }
}
```

## Source Files

| File                                   | Purpose                   |
| -------------------------------------- | ------------------------- |
| `src/core/types/agent.ts`              | Agent type definitions    |
| `src/agents/base-agent.ts`             | Base agent implementation |
| `src/agents/experts/expert-factory.ts` | Expert registration       |
| `src/agents/collaboration/`            | Collaboration protocols   |
| `src/agents/context-pruner.ts`         | Context management        |

## Next Steps

- [Tool Development](/development/tool-development) - Create MCP tools for agents
- [Memory Development](/development/memory-development) - Add memory to agents
- [Debugging & Observability](/guides/debugging-observability) - Debug agent behavior
