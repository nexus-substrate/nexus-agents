# IWorkflowEngine Interface

## Purpose

`IWorkflowEngine` provides the execution engine for YAML-defined automated workflows. It handles template loading, step execution with dependencies, and progress tracking.

## Contract

```typescript
interface IWorkflowEngine {
  /**
   * Load workflow template from file.
   * @param path - Path to template file
   * @returns Result with WorkflowDefinition or ParseError
   */
  loadTemplate(path: string): Promise<Result<WorkflowDefinition, ParseError>>;

  /**
   * Execute a workflow with inputs.
   * @param workflow - Workflow definition
   * @param inputs - Input values
   * @returns Result with WorkflowResult or WorkflowError
   */
  execute(
    workflow: WorkflowDefinition,
    inputs: Record<string, unknown>
  ): Promise<Result<WorkflowResult, WorkflowError>>;

  /**
   * Get execution status.
   * @param executionId - Execution ID to check
   * @returns Current execution status
   */
  getStatus(executionId: string): ExecutionStatus;

  /**
   * Cancel a running workflow.
   * @param executionId - Execution ID to cancel
   * @returns Result with void or WorkflowError
   */
  cancel(executionId: string): Promise<Result<void, WorkflowError>>;

  /**
   * List available workflow templates.
   * @returns Array of available templates
   */
  listTemplates(): Promise<WorkflowTemplate[]>;

  /**
   * Get a built-in or registered template definition by name.
   * @param name - Template name (e.g., 'code-review')
   * @returns The workflow definition, or undefined if not found
   */
  getTemplateByName(name: string): Promise<WorkflowDefinition | undefined>;
}
```

## Supporting Types

### ContextBudget

```typescript
interface ContextBudget {
  /** System instructions and project context (default: 15%) */
  system: number;
  /** Current task description and requirements (default: 20%) */
  task: number;
  /** Active working content (default: 50%) */
  active: number;
  /** Reserved for response generation (default: 15%) */
  reserved: number;
}
```

### PartialContextBudget

```typescript
type PartialContextBudget = Partial<ContextBudget>;
```

Used for step-level overrides that merge with the workflow's `defaultBudget`.

### WorkflowDefinition

```typescript
interface WorkflowDefinition {
  name: string;
  version: string;
  description?: string;
  inputs: InputDefinition[];
  steps: WorkflowStep[];
  timeout?: number;
  /** Default context budget for workflow steps (individual steps can override) */
  defaultBudget?: ContextBudget;
}
```

### WorkflowStep

```typescript
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
  /** Step-specific context budget override (merges with workflow defaultBudget) */
  contextBudget?: PartialContextBudget;
}
```

### ExecutionStatus

```typescript
type ExecutionStatus =
  | { state: 'pending' }
  | { state: 'running'; currentStep: string; progress: number }
  | { state: 'completed'; result: WorkflowResult }
  | { state: 'failed'; error: string; failedStep?: string }
  | { state: 'cancelled'; cancelledAt: string };
```

### WorkflowResult

```typescript
interface WorkflowResult {
  executionId: string;
  workflowName: string;
  stepResults: StepResult[];
  output: unknown;
  totalDurationMs: number;
}
```

## YAML Template Example

```yaml
name: code-review
version: '1.0.0'
description: Automated code review workflow

inputs:
  - name: files
    type: array
    description: Files to review
    required: true
  - name: focus
    type: string
    description: Review focus area
    default: general

steps:
  - id: analyze
    agent: code_expert
    action: analyze_code
    inputs:
      files: ${{ inputs.files }}

  - id: security
    agent: security_expert
    action: security_review
    inputs:
      files: ${{ inputs.files }}
    parallel: true

  - id: synthesize
    agent: orchestrator # formerly tech_lead
    action: synthesize_reviews
    inputs:
      analysis: ${{ steps.analyze.output }}
      security: ${{ steps.security.output }}
    dependsOn: [analyze, security]

timeout: 300000
```

## Usage Example

```typescript
import { type IWorkflowEngine, isOk } from 'nexus-agents';

async function runCodeReview(engine: IWorkflowEngine, files: string[]): Promise<void> {
  // Load template
  const loadResult = await engine.loadTemplate('./workflows/code-review.yaml');
  if (!isOk(loadResult)) {
    throw new Error(`Failed to load: ${loadResult.error.message}`);
  }

  // Execute workflow
  const execResult = await engine.execute(loadResult.value, { files });
  if (!isOk(execResult)) {
    throw execResult.error;
  }

  console.log('Review complete:', execResult.value.output);
}
```

## Execution Flow

```
[Load Template] --> [Validate Inputs] --> [Resolve Dependencies]
        |                  |                       |
        v                  v                       v
   ParseError?       ValidationError?       Build Step Graph
        |                  |                       |
        v                  v                       v
     Return Err        Return Err          [Execute Steps]
                                                  |
                            +---------+-----------+
                            |         |           |
                            v         v           v
                       Sequential  Parallel   Conditional
                            |         |           |
                            +---------+-----------+
                                      |
                                      v
                               [Collect Results]
                                      |
                                      v
                               WorkflowResult
```

## Error Handling

| Error                                       | Cause               | Recovery                     |
| ------------------------------------------- | ------------------- | ---------------------------- |
| `ParseError`                                | Invalid YAML syntax | Fix template syntax          |
| `WorkflowError` (WORKFLOW_NOT_FOUND)        | Template not found  | Check file path              |
| `WorkflowError` (WORKFLOW_EXECUTION_FAILED) | Step failed         | Check step inputs            |
| `WorkflowError` (WORKFLOW_TIMEOUT)          | Execution timeout   | Increase timeout or optimize |

## Testing

```typescript
import { describe, it, expect } from 'vitest';
import type { IWorkflowEngine } from 'nexus-agents';

describe('IWorkflowEngine', () => {
  it('should execute steps in dependency order', async () => {
    const engine = createMockWorkflowEngine();

    const workflow = {
      name: 'test',
      version: '1.0.0',
      inputs: [],
      steps: [
        { id: 'a', agent: 'code_expert', action: 'test', inputs: {} },
        { id: 'b', agent: 'code_expert', action: 'test', inputs: {}, dependsOn: ['a'] },
      ],
    };

    const result = await engine.execute(workflow, {});
    expect(result.ok).toBe(true);

    // Step 'b' should execute after 'a'
    const stepOrder = result.value.stepResults.map((s) => s.stepId);
    expect(stepOrder.indexOf('a')).toBeLessThan(stepOrder.indexOf('b'));
  });
});
```
