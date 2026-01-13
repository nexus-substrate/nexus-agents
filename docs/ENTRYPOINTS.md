# Nexus-Agents Entrypoints

**Last Updated:** 2026-01-12 (ET)
**Canonical Source:** This document is the single source of truth for all entrypoints.
**Issue:** #210 (Epic #209)

---

## Overview

Nexus-agents provides four interface categories:

| Interface        | Use Case                            | Transport           |
| ---------------- | ----------------------------------- | ------------------- |
| CLI Commands     | Terminal usage, CI/CD pipelines     | Process             |
| MCP Tools        | Claude Desktop, MCP clients         | JSON-RPC over stdio |
| REST API         | Enterprise integration, web clients | HTTP                |
| Programmatic API | Library usage, custom applications  | TypeScript import   |

---

## CLI Commands

**Entry Point:** `nexus-agents [command] [options]`

| Command         | Subcommand      | Description                                | Mode         |
| --------------- | --------------- | ------------------------------------------ | ------------ |
| `(default)`     | -               | Start MCP server                           | server       |
| `--help`        | -               | Display help text                          | any          |
| `--version`     | -               | Display version                            | any          |
| `doctor`        | -               | Check CLI health and dependencies          | any          |
| `config`        | `init`          | Generate starter configuration file        | any          |
| `expert`        | `list`          | List available experts (built-in + custom) | any          |
| `workflow`      | `list`          | List available workflow templates          | any          |
| `workflow`      | `run <name>`    | Execute a workflow template                | orchestrator |
| `server`        | -               | Start MCP server (explicit)                | server       |
| `server`        | `--interactive` | Start interactive REPL mode                | server       |
| `review`        | `<url>`         | Review a GitHub PR                         | orchestrator |
| `routing-audit` | `<task>`        | Debug routing decisions (dry-run)          | any          |
| `orchestrate`   | `<task>`        | Execute task standalone                    | orchestrator |
| `system-review` | -               | Run 5-phase system review                  | any          |
| `vote`          | `<proposal>`    | Consensus voting with 5 agents             | any          |
| `issue`         | `validate`      | Validate issue against templates           | any          |
| `sprint`        | `plan`          | Generate sprint proposal from open issues  | any          |
| `sprint`        | `list`          | List open issues with priority labels      | any          |

### Mode Selection

| Mode           | Flag                  | Description                             |
| -------------- | --------------------- | --------------------------------------- |
| `server`       | `--mode=server`       | MCP server for Claude Desktop (default) |
| `orchestrator` | `--mode=orchestrator` | Standalone CLI, CI/CD pipelines         |
| `mesh`         | `--mode=mesh`         | Hybrid bidirectional mode               |

### Usage Examples

```bash
# Start MCP server (default)
nexus-agents

# Health check
nexus-agents doctor

# Generate config
nexus-agents config init

# List experts
nexus-agents expert list

# Run workflow
nexus-agents workflow run code-review --input='{"url": "..."}'

# Review PR
nexus-agents review https://github.com/owner/repo/pull/123

# Debug routing
nexus-agents routing-audit "Implement a sorting algorithm" --format=json

# Standalone orchestration
nexus-agents orchestrate "Review this code for security issues"

# Consensus voting
nexus-agents vote "Should we adopt TypeScript 6.0?"

# Validate issue body
nexus-agents issue validate --body="## Summary\nFix bug..."

# Generate sprint proposal
nexus-agents sprint plan --max=10 --create-issue

# List sprint candidates
nexus-agents sprint list --format=table

# System review (5-phase checklist)
nexus-agents system-review
nexus-agents system-review --create-issue
nexus-agents system-review --fix --verbose
```

### Source Files

| File                             | Purpose               |
| -------------------------------- | --------------------- |
| `src/cli-commands.ts`            | Command dispatcher    |
| `src/cli/doctor.ts`              | Doctor command        |
| `src/cli/config-init.ts`         | Config init command   |
| `src/cli/expert-list.ts`         | Expert list command   |
| `src/cli/workflow-run.ts`        | Workflow commands     |
| `src/cli/review-command.ts`      | PR review command     |
| `src/cli/routing-audit.ts`       | Routing audit command |
| `src/cli/orchestrate-command.ts` | Orchestrate command   |
| `src/cli/system-review.ts`       | System review command |

---

## MCP Tools

**Protocol:** Model Context Protocol (2025-11-25)
**Transport:** JSON-RPC 2.0 over stdio

| Tool                | Description                                   | Auth         | Rate Limit |
| ------------------- | --------------------------------------------- | ------------ | ---------- |
| `orchestrate`       | Task orchestration with TechLead coordination | None (local) | 60/min     |
| `create_expert`     | Dynamic expert agent creation                 | None (local) | 60/min     |
| `run_workflow`      | Execute workflow template                     | None (local) | 60/min     |
| `delegate_to_model` | Route task to optimal model                   | None (local) | 60/min     |

### Tool Schemas

#### orchestrate

```json
{
  "name": "orchestrate",
  "description": "Orchestrate a complex task using specialized expert agents",
  "inputSchema": {
    "type": "object",
    "properties": {
      "task": { "type": "string", "description": "Task description" },
      "context": { "type": "object", "description": "Optional context" },
      "maxIterations": { "type": "number", "default": 3 }
    },
    "required": ["task"]
  }
}
```

#### create_expert

```json
{
  "name": "create_expert",
  "description": "Create a specialized expert agent",
  "inputSchema": {
    "type": "object",
    "properties": {
      "role": {
        "type": "string",
        "enum": ["code", "security", "architecture", "testing", "documentation"]
      },
      "modelPreference": { "type": "string", "description": "Preferred model tier" }
    },
    "required": ["role"]
  }
}
```

#### run_workflow

```json
{
  "name": "run_workflow",
  "description": "Execute a predefined workflow template",
  "inputSchema": {
    "type": "object",
    "properties": {
      "template": { "type": "string", "description": "Workflow template name" },
      "inputs": { "type": "object", "description": "Workflow inputs" },
      "dryRun": { "type": "boolean", "default": false }
    },
    "required": ["template"]
  }
}
```

#### delegate_to_model

```json
{
  "name": "delegate_to_model",
  "description": "Route a task to the optimal model based on capabilities",
  "inputSchema": {
    "type": "object",
    "properties": {
      "task": { "type": "string", "description": "Task description" },
      "preferredCapability": { "type": "string", "enum": ["reasoning", "code", "speed", "cost"] }
    },
    "required": ["task"]
  }
}
```

### Source Files

| File                                 | Purpose            |
| ------------------------------------ | ------------------ |
| `src/mcp/tools/index.ts`             | Tool registration  |
| `src/mcp/tools/orchestrate.ts`       | Orchestrate tool   |
| `src/mcp/tools/create-expert.ts`     | Create expert tool |
| `src/mcp/tools/run-workflow.ts`      | Run workflow tool  |
| `src/mcp/tools/delegate-to-model.ts` | Delegate tool      |

---

## REST API

**Base URL:** `http://localhost:3000`
**API Version:** v1

| Method | Endpoint              | Description           | Auth    | Rate Limit |
| ------ | --------------------- | --------------------- | ------- | ---------- |
| GET    | `/health`             | Health check          | None    | None       |
| GET    | `/metrics`            | Prometheus metrics    | None    | None       |
| GET    | `/metrics/prometheus` | Prometheus format     | None    | None       |
| POST   | `/api/v1/orchestrate` | Task orchestration    | API Key | 60/min     |
| POST   | `/api/v1/delegate`    | Model routing         | API Key | 60/min     |
| POST   | `/api/v1/workflow`    | Workflow execution    | API Key | 60/min     |
| POST   | `/api/v1/expert`      | Expert task execution | API Key | 60/min     |

### Authentication

All `/api/v1/*` endpoints require API key authentication:

```bash
curl -X POST http://localhost:3000/api/v1/orchestrate \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"task": "Review this code"}'
```

### Request/Response Examples

#### POST /api/v1/orchestrate

```json
// Request
{
  "task": "Analyze security vulnerabilities in auth.ts",
  "context": { "file": "src/auth.ts" },
  "maxIterations": 3
}

// Response
{
  "success": true,
  "result": {
    "summary": "...",
    "experts_consulted": ["security", "code"],
    "recommendations": [...]
  },
  "metadata": {
    "duration_ms": 1234,
    "tokens_used": 5678
  }
}
```

#### POST /api/v1/workflow

```json
// Request
{
  "template": "code-review",
  "inputs": {
    "url": "https://github.com/owner/repo/pull/123"
  },
  "dryRun": false
}

// Response
{
  "success": true,
  "result": {
    "status": "completed",
    "steps": [...],
    "output": "..."
  }
}
```

### Configuration

```yaml
# nexus-agents.yaml
api:
  port: 3000
  host: 0.0.0.0
  enableCors: true
  rateLimitPerMinute: 60
  apiKeyHeader: X-API-Key
```

### Source Files

| File                            | Purpose               |
| ------------------------------- | --------------------- |
| `src/api/rest-server.ts`        | Server implementation |
| `src/api/rest-types.ts`         | Type definitions      |
| `src/api/routes/index.ts`       | Route registration    |
| `src/api/routes/health.ts`      | Health endpoints      |
| `src/api/routes/orchestrate.ts` | Orchestrate endpoint  |
| `src/api/routes/delegate.ts`    | Delegate endpoint     |
| `src/api/routes/workflow.ts`    | Workflow endpoint     |
| `src/api/routes/expert.ts`      | Expert endpoint       |

---

## Programmatic API

**Package:** `nexus-agents`
**Entry Point:** `import { ... } from 'nexus-agents'`

### Core Exports

```typescript
// Result Pattern
import { ok, err, isOk, isErr, map, mapErr, unwrap } from 'nexus-agents';

// Errors
import {
  NexusError,
  ValidationError,
  ConfigError,
  ModelError,
  AgentError,
  WorkflowError,
  SecurityError,
  TimeoutError,
} from 'nexus-agents';

// Configuration
import { AppConfigSchema, defaultConfig, type AppConfig } from 'nexus-agents';
```

### Model Adapters

```typescript
import {
  // Factory functions
  createClaudeAdapter,
  createOpenAIAdapter,
  createGeminiAdapter,
  createOllamaAdapter,
  AdapterFactory,

  // Classes
  ClaudeAdapter,
  OpenAIAdapter,
  GeminiAdapter,
  OllamaAdapter,

  // Types
  type IModelAdapter,
  type CompletionRequest,
  type CompletionResponse,
} from 'nexus-agents';
```

### Agents & Experts

```typescript
import {
  // Core agents
  TechLead,
  Expert,
  ExpertFactory,

  // Built-in experts
  CodeExpert,
  SecurityExpert,
  ArchitectureExpert,
  TestingExpert,
  DocumentationExpert,

  // Selection utilities
  selectExperts,
  analyzeTask,

  // Types
  type Task,
  type TaskResult,
  type ExecutionPlan,
} from 'nexus-agents';
```

### Workflows

```typescript
import {
  // Parsing
  parseWorkflowYaml,
  loadWorkflowFile,
  validateWorkflow,

  // Templates
  BUILT_IN_TEMPLATES,
  createTemplateRegistry,

  // Types
  type WorkflowDefinition,
  type WorkflowStep,
  type WorkflowResult,
} from 'nexus-agents';
```

### MCP Server

```typescript
import {
  // Server creation
  createServer,
  startStdioServer,

  // Tool registration
  registerTools,
  registerOrchestrateTool,
  registerCreateExpertTool,
  registerRunWorkflowTool,

  // Types
  type ServerConfig,
  type ServerInstance,
} from 'nexus-agents';
```

### CLI Adapters

```typescript
import {
  // Adapter creation
  createCliAdapter,
  createAllAdapters,
  getAvailableClis,

  // Adapter classes
  ClaudeCliAdapter,
  GeminiCliAdapter,
  CodexCliAdapter,

  // Routing
  CompositeRouter,
  createCompositeRouter,

  // Detection
  CliDetectionCache,
  createCliDetectionCache,

  // Types
  type ICliAdapter,
  type CliTask,
  type CliResponse,
} from 'nexus-agents';
```

### Context & Memory

```typescript
import {
  // Token counting
  TokenCounter,
  createTokenCounter,

  // Context management
  ContextManager,

  // Types
  type ITokenCounter,
  type TokenCountResult,
} from 'nexus-agents';
```

### Observability

```typescript
import {
  // Swarm observation
  SwarmObserver,
  createSwarmObserver,

  // Audit logging
  AuditLogger,
  createAuditLogger,

  // Types
  type ISwarmObserver,
  type IAuditLogger,
} from 'nexus-agents';
```

### Learning & Feedback

```typescript
import {
  // Feedback collection
  OutcomeFeedbackCollector,
  createOutcomeFeedbackCollector,

  // Integration
  FeedbackIntegration,
  createFeedbackIntegration,

  // Utilities
  computeOutcomeReward,

  // Types
  type TaskOutcome,
  type ComputedReward,
} from 'nexus-agents';
```

### REST API Server

```typescript
import {
  RestApiServer,
  createRestApiServer,

  // Types
  type RestApiConfig,
  type RestApiServerOptions,
} from 'nexus-agents';
```

### Quick Start Examples

#### MCP Server Mode

```typescript
import { startStdioServer } from 'nexus-agents';

await startStdioServer({
  name: 'my-server',
  version: '1.0.0',
});
```

#### Programmatic Usage

```typescript
import { createClaudeAdapter, TechLead } from 'nexus-agents';

const adapter = createClaudeAdapter({ model: 'claude-sonnet-4-20250514' });
const techLead = new TechLead({ adapter });
const result = await techLead.execute({
  description: 'Analyze this codebase for security issues',
});

if (result.ok) {
  console.log(result.value.summary);
}
```

#### REST API Server

```typescript
import { createRestApiServer } from 'nexus-agents';

const server = await createRestApiServer({
  port: 3000,
  enableCors: true,
  rateLimitPerMinute: 100,
});

await server.start();
```

### Source Files

| File                      | Purpose          |
| ------------------------- | ---------------- |
| `src/index.ts`            | Main exports     |
| `src/core/types/index.ts` | Type definitions |
| `src/adapters/index.ts`   | Model adapters   |
| `src/agents/index.ts`     | Agent framework  |
| `src/workflows/index.ts`  | Workflow engine  |

---

## Machine-Parseable Reference

<!-- BEGIN:CLI_COMMANDS -->

```yaml
cli_commands:
  - name: help
    flags: ['--help', '-h']
    mode: any
  - name: version
    flags: ['--version', '-v']
    mode: any
  - name: doctor
    mode: any
  - name: config init
    mode: any
  - name: expert list
    mode: any
  - name: workflow list
    mode: any
  - name: workflow run
    args: ['<template>']
    mode: orchestrator
  - name: server
    flags: ['--interactive']
    mode: server
  - name: review
    args: ['<url>']
    mode: orchestrator
  - name: routing-audit
    args: ['<task>']
    flags: ['--format', '--verbose', '--dry-run']
    mode: any
  - name: orchestrate
    args: ['<task>']
    mode: orchestrator
  - name: system-review
    flags: ['--create-issue', '--fix', '--verbose']
    mode: any
```

<!-- END:CLI_COMMANDS -->

<!-- BEGIN:MCP_TOOLS -->

```yaml
mcp_tools:
  - name: orchestrate
    auth: none
    rate_limit: 60/min
  - name: create_expert
    auth: none
    rate_limit: 60/min
  - name: run_workflow
    auth: none
    rate_limit: 60/min
  - name: delegate_to_model
    auth: none
    rate_limit: 60/min
```

<!-- END:MCP_TOOLS -->

<!-- BEGIN:REST_API -->

```yaml
rest_api:
  base_url: http://localhost:3000
  version: v1
  endpoints:
    - method: GET
      path: /health
      auth: none
    - method: GET
      path: /metrics
      auth: none
    - method: POST
      path: /api/v1/orchestrate
      auth: api_key
      rate_limit: 60/min
    - method: POST
      path: /api/v1/delegate
      auth: api_key
      rate_limit: 60/min
    - method: POST
      path: /api/v1/workflow
      auth: api_key
      rate_limit: 60/min
    - method: POST
      path: /api/v1/expert
      auth: api_key
      rate_limit: 60/min
```

<!-- END:REST_API -->

---

## Cross-References

- **CLAUDE.md** - Quick Reference section links here
- **README.md** - Installation links here for "full reference"
- **ARCHITECTURE.md** - Interface Layer section links here

---

_Generated per Process Automation Proposal #3 (Issue #210)_
_Approved by 5-agent consensus vote (8.6/10, unanimous)_
