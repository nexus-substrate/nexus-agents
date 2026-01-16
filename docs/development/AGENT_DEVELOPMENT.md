# Agent Development Guide

**Tier 3** | Walkthrough for creating and extending agents
**Hub:** [README.md](./README.md) | **Architecture:** [AGENT_SYSTEM.md](../architecture/AGENT_SYSTEM.md)

---

## Overview

This guide walks through creating custom agents for nexus-agents. Agents follow the IAgent interface and can participate in collaboration protocols.

---

## Agent Architecture

### Core Interfaces

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

```
Idle → Thinking → Acting → Waiting → Thinking → ...
         ↓          ↓         ↓
       Error      Error     Error
         ↓          ↓         ↓
       Idle       Idle      Idle
```

---

## Creating a Basic Agent

### Step 1: Define the Expert Configuration

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
- Never [constraint]`,
  tier: 'balanced', // 'fast' | 'balanced' | 'powerful'
  tools: ['read_files', 'analyze_code'],
};
```

### Step 2: Register with ExpertFactory

```typescript
// src/agents/experts/expert-factory.ts
import { myExpertConfig } from './my-expert.js';

// In the factory registration
ExpertFactory.register('my-domain', myExpertConfig);
```

### Step 3: Use via MCP Tools

```typescript
// Via orchestrate tool
{ task: "Review this code for [domain] issues" }

// Via expert tool
{ type: "my-domain", task: "Analyze..." }
```

---

## Creating a Custom Agent Class

For complex agents requiring custom logic:

### Step 1: Create Agent Class

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
    // Handle inter-agent messages
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

### Step 2: Add Tests

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

  it('should handle errors gracefully', async () => {
    // Test error handling
  });
});
```

---

## Collaboration Protocols

### Integrating with Protocols

Agents can participate in collaboration protocols:

```typescript
import { CollaborationSession } from '../collaboration/collaboration-session.js';

// Sequential collaboration
const session = new CollaborationSession({
  pattern: 'sequential',
  agents: [agent1, agent2, agent3],
});

const result = await session.execute(task);
```

### Implementing Protocol-Aware Agents

For agents that need to participate in specific protocols:

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
}
```

---

## Event Bus Integration

### Emitting Events

```typescript
import { getGlobalEventBus } from '../collaboration/event-bus.js';

class MyAgent implements IAgent {
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

---

## Best Practices

### State Management

- Always transition through proper states
- Reset to `idle` after `error`
- Never skip states (idle → acting is invalid)

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

---

## Source Files

| File                                   | Purpose                   |
| -------------------------------------- | ------------------------- |
| `src/core/types/agent.ts`              | Agent type definitions    |
| `src/agents/base-agent.ts`             | Base agent implementation |
| `src/agents/experts/expert-factory.ts` | Expert registration       |
| `src/agents/collaboration/`            | Collaboration protocols   |
| `src/agents/context-pruner.ts`         | Context management        |

---

## Related Documents

- **Architecture:** [AGENT_SYSTEM.md](../architecture/AGENT_SYSTEM.md)
- **Consensus:** [CONSENSUS_PROTOCOLS.md](../architecture/CONSENSUS_PROTOCOLS.md)
- **Memory:** [MEMORY_SYSTEM.md](../architecture/MEMORY_SYSTEM.md)
