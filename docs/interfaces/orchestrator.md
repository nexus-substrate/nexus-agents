# IOrchestrator Interface

## Purpose

`IOrchestrator` is the unified interface for all orchestration strategies in the system. It provides a canonical path for coordinating tasks, workflows, and policy-based executions regardless of the underlying implementation. Three implementations exist:

- **TechLead** (`tech_lead`) — LLM-based task decomposition and expert selection
- **PuppeteerOrchestrator** (`puppeteer`) — Policy-based step execution with learning
- **WorkflowEngine** (`workflow`) — Static template-based workflow execution

See `docs/adr/0002-orchestrator-interface.md` for design rationale.

## Contract

```typescript
interface IOrchestrator {
  /** Unique orchestrator instance ID */
  readonly id: string;

  /** Orchestrator type */
  readonly type: OrchestratorType;

  /**
   * Execute an orchestration.
   * @param definition - What to orchestrate (task, workflow, or policy)
   * @param inputs - Input values for the orchestration
   * @param options - Execution options (timeout, budget, callbacks)
   * @returns Result with OrchestratorResult or OrchestratorError
   */
  execute(
    definition: OrchestratorDefinition,
    inputs: Record<string, unknown>,
    options?: OrchestratorExecuteOptions
  ): Promise<Result<OrchestratorResult, OrchestratorError>>;

  /**
   * Get status of an execution.
   * @param executionId - Execution ID to check
   * @returns Current execution status
   */
  getStatus(executionId: string): ExecutionStatus;

  /**
   * Cancel a running execution.
   * @param executionId - Execution ID to cancel
   * @param reason - Optional cancellation reason
   * @returns Result with void or OrchestratorError
   */
  cancel(executionId: string, reason?: string): Promise<Result<void, OrchestratorError>>;

  /**
   * Register an agent with this orchestrator.
   * Optional — not all orchestrators manage agent pools.
   */
  registerAgent?(agent: IAgent): void;

  /**
   * Unregister an agent.
   * Optional — not all orchestrators manage agent pools.
   */
  unregisterAgent?(agentId: string): void;

  /**
   * List registered agents.
   * Optional — not all orchestrators manage agent pools.
   */
  listAgents?(): Array<{ id: string; role: AgentRole }>;

  /**
   * Get execution history.
   * Optional — for orchestrators that track history.
   * @param limit - Maximum number of executions to return
   */
  getHistory?(limit?: number): OrchestratorResult[];
}
```

## Factory Interface

```typescript
interface IOrchestratorFactory {
  /**
   * Create an orchestrator instance.
   * @param type - Orchestrator type
   * @param config - Optional configuration
   */
  create(type: OrchestratorType, config?: Record<string, unknown>): IOrchestrator;

  /** List available orchestrator types. */
  listTypes(): OrchestratorType[];
}
```

## Supporting Types

### OrchestratorType

```typescript
type OrchestratorType = 'tech_lead' | 'puppeteer' | 'workflow' | 'custom';
```

### OrchestratorDefinition

Discriminated union that describes what to orchestrate:

```typescript
type OrchestratorDefinition =
  | { type: 'task'; task: Task }
  | { type: 'workflow'; templatePath: string }
  | { type: 'policy'; policyId: string; initialState: Record<string, unknown> };
```

### OrchestratorExecuteOptions

```typescript
interface OrchestratorExecuteOptions {
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Maximum execution time in ms */
  timeout?: number;
  /** Maximum number of steps/iterations */
  maxSteps?: number;
  /** Token budget for LLM calls */
  tokenBudget?: number;
  /** Callback for progress updates */
  onProgress?: (status: ExecutionStatus) => void;
  /** Additional metadata passed to orchestrator */
  metadata?: Record<string, unknown>;
}
```

### OrchestratorResult

```typescript
interface OrchestratorResult {
  /** Unique execution ID */
  executionId: string;
  /** Orchestrator type that executed */
  orchestratorType: OrchestratorType;
  /** Steps executed */
  steps: OrchestratorStep[];
  /** Final aggregated output */
  output: unknown;
  /** Total execution time in ms */
  totalDurationMs: number;
  /** Total tokens consumed */
  totalTokensUsed: number;
  /** Agents involved */
  agentsUsed: string[];
}
```

### OrchestratorStep

```typescript
interface OrchestratorStep {
  id: string;
  agentId: string;
  role: AgentRole;
  action: string;
  output: unknown;
  durationMs: number;
  tokensUsed: number;
  status: 'success' | 'failed' | 'skipped';
  error: string | undefined;
}
```

### OrchestratorError

```typescript
class OrchestratorError extends Error {
  readonly name: 'OrchestratorError';
  readonly code: OrchestratorErrorCode;
  readonly step: string | undefined;
  readonly cause: Error | undefined;
}
```

### OrchestratorErrorCode

```typescript
type OrchestratorErrorCode =
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'STEP_FAILED'
  | 'AGENT_ERROR'
  | 'BUDGET_EXCEEDED'
  | 'INVALID_DEFINITION'
  | 'NO_AGENTS_AVAILABLE'
  | 'POLICY_VIOLATION';
```

## Usage Example

```typescript
import { type IOrchestrator, type OrchestratorDefinition, isOk } from 'nexus-agents';

async function runTask(orchestrator: IOrchestrator, description: string): Promise<void> {
  const definition: OrchestratorDefinition = {
    type: 'task',
    task: {
      id: crypto.randomUUID(),
      description,
      context: { workingDirectory: './' },
    },
  };

  const result = await orchestrator.execute(definition, {}, { timeout: 30_000 });

  if (isOk(result)) {
    console.log('Output:', result.value.output);
    console.log('Steps:', result.value.steps.length);
    console.log('Tokens:', result.value.totalTokensUsed);
  } else {
    console.error(`Orchestration failed [${result.error.code}]:`, result.error.message);
  }
}

// Run a workflow template
async function runWorkflow(orchestrator: IOrchestrator): Promise<void> {
  const definition: OrchestratorDefinition = {
    type: 'workflow',
    templatePath: './workflows/code-review.yaml',
  };

  const result = await orchestrator.execute(
    definition,
    { files: ['src/index.ts'] },
    {
      onProgress: (status) => {
        if (status.state === 'running') {
          console.log(`Step: ${status.currentStep} (${Math.round(status.progress * 100)}%)`);
        }
      },
    }
  );

  if (!isOk(result)) throw result.error;
  console.log('Review complete:', result.value.output);
}
```

## Error Handling

| Error Code            | Cause                                   | Recovery                         |
| --------------------- | --------------------------------------- | -------------------------------- |
| `TIMEOUT`             | Execution exceeded `timeout` ms         | Increase timeout or reduce scope |
| `CANCELLED`           | `cancel()` called during execution      | Expected — handle gracefully     |
| `STEP_FAILED`         | An individual step returned an error    | Check `step` field for step ID   |
| `AGENT_ERROR`         | Agent threw or returned an error result | Check agent logs for root cause  |
| `BUDGET_EXCEEDED`     | `tokenBudget` or `maxSteps` was hit     | Increase budget or simplify task |
| `INVALID_DEFINITION`  | Malformed `OrchestratorDefinition`      | Validate definition before use   |
| `NO_AGENTS_AVAILABLE` | No agents registered for required role  | Register agents before executing |
| `POLICY_VIOLATION`    | Step violated a policy rule             | Check policy firewall config     |

## Related Interfaces

- [`IAgent`](./agent.md) — The agents orchestrators coordinate
- [`IWorkflowEngine`](./workflow-engine.md) — The `workflow` orchestrator type delegates to this
