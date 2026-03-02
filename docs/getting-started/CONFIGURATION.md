---
title: 'Configuration Guide'
description: Configure nexus-agents with YAML files, environment variables, and programmatic options
tier: 2
keywords: [configuration, yaml, environment, settings, options, getting-started]
---

# Configuration

Configure nexus-agents with YAML files, environment variables, and programmatic options.

## Configuration Precedence

Configuration is loaded in order of precedence (highest to lowest):

1. **Environment variables** (`NEXUS_*` prefix)
2. **Project config** (`./nexus-agents.yaml` in current directory)
3. **User config** (`~/.config/nexus-agents/config.yaml`)
4. **Default values**

## Quick Setup

Generate a starter configuration file:

```bash
nexus-agents config init
```

This creates `nexus-agents.yaml` with sensible defaults.

## Configuration File

The main configuration file is `nexus-agents.yaml`:

> **Note:** Model names shown below are examples. Use the latest available models from each provider (Anthropic, OpenAI, Google, Ollama). Check provider documentation for current model identifiers.

```yaml
# nexus-agents.yaml

# Model configuration — use latest models from each provider
models:
  # Default model for general tasks
  default: claude-sonnet-4-20250514

  # Model tiers for routing
  tiers:
    fast:
      - claude-haiku-3
      - gpt-4o-mini
      - gemini-3-flash
    balanced:
      - claude-sonnet-4-20250514
      - gpt-4o
      - gemini-3-pro
    powerful:
      - claude-opus-4
      - o1-pro
      - gemini-3-pro

# Expert configuration
experts:
  # Enable built-in experts (code, architecture, security, performance, research)
  builtin: true

  # Custom expert definitions
  custom:
    rust_expert:
      prompt: |
        You are a Rust expert specializing in systems programming,
        memory safety, and performance optimization. You follow the
        Rust API Guidelines and prefer idiomatic solutions.
      tier: powerful
      tools:
        - read_file
        - write_file
        - execute_command

    react_expert:
      prompt: |
        You are a React expert specializing in modern React patterns,
        hooks, and performance optimization. You follow React best
        practices and prefer functional components.
      tier: balanced

# Routing configuration
routing:
  # Enable three-stage routing pipeline
  enableBudgetFilter: true
  enableTopsisRanking: true
  enableLinUCBSelection: true

  # Budget constraints
  budget:
    tokenBudget: 1000000 # Session token limit
    costBudgetUsd: 10.0 # Session cost limit
    resetIntervalMs: 3600000 # 1 hour reset

  # TOPSIS multi-criteria weights
  topsis:
    qualityWeight: 0.5
    costWeight: 0.3
    latencyWeight: 0.2

  # LinUCB bandit configuration
  linucb:
    alpha: 1.0 # Exploration parameter

# Memory configuration
memory:
  # Session memory
  session:
    maxEntries: 1000
    ttlMs: 86400000 # 24 hours

  # Graph memory
  graph:
    enabled: true
    maxNodes: 10000
    maxEdges: 50000

  # Typed memory (MIRIX six-type system)
  typed:
    enabled: true
    pruneThreshold: 0.3

# Security configuration
security:
  # Allowed paths for file operations
  allowedPaths:
    - ./
    - /tmp

  # Sandbox execution mode: none, policy, container
  sandbox:
    mode: policy
    fallbackMode: none
    resourceLimits:
      memory: 512m
      cpu: 2
      timeout: 300s
      maxProcesses: 10

  # Rate limiting
  rateLimit:
    enabled: true
    requestsPerMinute: 60

# Workflow configuration
workflows:
  # Directory containing workflow templates
  templateDir: ./workflows

  # Maximum parallel steps
  maxParallelSteps: 5

  # Step timeout
  stepTimeoutMs: 300000 # 5 minutes

# REST API configuration (optional)
api:
  enabled: false
  port: 3000
  host: 0.0.0.0
  enableCors: true
  rateLimitPerMinute: 100
  apiKeyHeader: X-API-Key
  apiKeys:
    - key: 'your-secret-key'
      name: 'ci-pipeline'
      scopes:
        - read
        - execute

# Logging configuration
logging:
  level: info # debug, info, warn, error
  format: json # json, pretty
  file: null # Optional log file path
```

## Environment Variables

All configuration can be overridden with environment variables:

### Core Variables

| Variable            | Description              | Default               |
| ------------------- | ------------------------ | --------------------- |
| `NEXUS_CONFIG_PATH` | Path to config file      | `./nexus-agents.yaml` |
| `NEXUS_LOG_LEVEL`   | Logging level            | `info`                |
| `NEXUS_LOG_FORMAT`  | Log format (json/pretty) | `json`                |

### Model Provider Keys

| Variable            | Description                                           |
| ------------------- | ----------------------------------------------------- |
| `ANTHROPIC_API_KEY` | Claude API key                                        |
| `OPENAI_API_KEY`    | OpenAI API key                                        |
| `GOOGLE_AI_API_KEY` | Google AI (Gemini) API key                            |
| `OLLAMA_HOST`       | Ollama server URL (default: `http://localhost:11434`) |

### Routing Variables

| Variable                | Description          | Default   |
| ----------------------- | -------------------- | --------- |
| `NEXUS_BUDGET_TOKENS`   | Session token budget | `1000000` |
| `NEXUS_BUDGET_COST_USD` | Session cost budget  | `10.0`    |
| `NEXUS_ROUTING_ALPHA`   | LinUCB exploration   | `1.0`     |

### Security Variables

| Variable             | Description         | Default  |
| -------------------- | ------------------- | -------- |
| `NEXUS_SANDBOX_MODE` | Sandbox mode        | `policy` |
| `NEXUS_RATE_LIMIT`   | Requests per minute | `60`     |
| `NEXUS_AUTH_ENABLED` | Enable MCP auth     | `false`  |
| `NEXUS_AUTH_METHOD`  | Auth method         | `token`  |

### Learning Variables

| Variable                 | Description                        | Default |
| ------------------------ | ---------------------------------- | ------- |
| `NEXUS_PERSIST_LEARNING` | Cross-session learning persistence | `true`  |

Outcomes and distilled routing rules persist to `~/.nexus-agents/learning/` by default. When persistence is enabled, `routingMemory`, `strategyDistillation`, and `preferenceRouting` also auto-enable (no separate config needed). Opt out with `NEXUS_PERSIST_LEARNING=false`.

Files stored:

- `outcomes.jsonl` — Append-only JSONL of task outcomes
- `rules.json` — Atomic JSON snapshot of distilled routing rules

### API Variables

| Variable            | Description            | Default |
| ------------------- | ---------------------- | ------- |
| `NEXUS_API_ENABLED` | Enable REST API        | `false` |
| `NEXUS_API_PORT`    | REST API port          | `3000`  |
| `NEXUS_API_KEY`     | API authentication key | None    |

## Model Configuration

### Default Model

The default model is used when no specific model is requested:

```yaml
models:
  default: claude-sonnet-4-20250514
```

### Model Tiers

Models are organized into tiers for automatic routing:

```yaml
models:
  tiers:
    fast:
      - claude-haiku-3 # Quick, simple tasks
      - gpt-4o-mini
    balanced:
      - claude-sonnet-4-20250514 # Most tasks
      - gpt-4o
    powerful:
      - claude-opus-4 # Complex reasoning
      - o1-pro
```

The router selects the appropriate tier based on task complexity.

### Model-Specific Settings

Override settings for specific models:

```yaml
models:
  settings:
    claude-opus-4:
      temperature: 0.7
      maxTokens: 8192
    gpt-4o:
      temperature: 0.5
      maxTokens: 4096
```

## Expert Configuration

### Built-in Experts

Enable or disable built-in experts:

```yaml
experts:
  builtin: true # Enable code, architecture, security, performance, research
```

### Custom Experts

Define domain-specific experts:

```yaml
experts:
  custom:
    database_expert:
      prompt: |
        You are a database expert specializing in PostgreSQL,
        query optimization, and schema design. You follow
        database normalization principles and prefer
        efficient, maintainable solutions.
      tier: balanced
      tools:
        - read_file
        - execute_command
      capabilities:
        - sql_analysis
        - schema_design
        - query_optimization
```

### Expert Prompt Templates

Use variables in expert prompts:

```yaml
experts:
  custom:
    project_expert:
      prompt: |
        You are an expert for the {{project_name}} project.
        The project uses {{language}} and follows {{style_guide}}.
      variables:
        project_name: nexus-agents
        language: TypeScript
        style_guide: Google TypeScript Style Guide
```

## Routing Configuration

### Budget Constraints

Control cost and resource usage:

```yaml
routing:
  budget:
    tokenBudget: 1000000 # Max tokens per session
    costBudgetUsd: 10.0 # Max cost per session
    resetIntervalMs: 3600000 # Reset every hour
```

### TOPSIS Weights

Adjust multi-criteria optimization:

```yaml
routing:
  topsis:
    qualityWeight: 0.5 # Prioritize quality
    costWeight: 0.3 # Consider cost
    latencyWeight: 0.2 # Some latency tolerance
```

For cost-sensitive deployments:

```yaml
routing:
  topsis:
    qualityWeight: 0.3
    costWeight: 0.5
    latencyWeight: 0.2
```

### LinUCB Bandit

Control exploration vs exploitation:

```yaml
routing:
  linucb:
    alpha: 1.0 # Higher = more exploration
```

- `alpha: 0.5` - Conservative, prefer known-good models
- `alpha: 1.0` - Balanced exploration (default)
- `alpha: 2.0` - Aggressive exploration, try new combinations

### Advanced Routing Stages (Optional)

Enable optional routing stages for specialized use cases:

```yaml
routing:
  stages:
    # Confidence-based cascade routing (SATER-style escalation)
    confidenceCascade: false

    # Task capability matching (matches task requirements to model capabilities)
    capabilityMatch: false

    # Quality-constrained routing (RouteLLM-style cost/quality tradeoff)
    qualityConstraint: false
```

These stages are disabled by default for backward compatibility. Enable them to add additional routing intelligence:

| Stage               | Purpose                                            | Use When                   |
| ------------------- | -------------------------------------------------- | -------------------------- |
| `confidenceCascade` | Escalate to more powerful models on low confidence | Quality-sensitive tasks    |
| `capabilityMatch`   | Match task type to model capabilities              | Diverse task workloads     |
| `qualityConstraint` | Enforce quality thresholds with cost awareness     | Balancing quality and cost |

## Memory Configuration

### Session Memory

Configure conversation context:

```yaml
memory:
  session:
    maxEntries: 1000 # Max memories per session
    ttlMs: 86400000 # 24 hour TTL
    pruneStrategy: lru # Least recently used
```

### Graph Memory

Configure relationship tracking:

```yaml
memory:
  graph:
    enabled: true
    maxNodes: 10000
    maxEdges: 50000
    similarityThreshold: 0.6
```

### Typed Memory (MIRIX)

Configure six-type memory system:

```yaml
memory:
  typed:
    enabled: true
    types:
      core: true # Agent identity
      episodic: true # Task experiences
      semantic: true # Domain knowledge
      procedural: true # Learned workflows
      resource: true # External references
      vault: true # Persistent storage
    pruneThreshold: 0.3
```

## Security Configuration

### Sandbox Mode

Choose execution isolation level:

```yaml
security:
  sandbox:
    mode: policy # none, policy, container
    fallbackMode: none
```

| Mode        | Description       | Security         |
| ----------- | ----------------- | ---------------- |
| `none`      | No sandboxing     | Development only |
| `policy`    | Command allowlist | Medium           |
| `container` | Docker isolation  | High             |

### Resource Limits

For container mode:

```yaml
security:
  sandbox:
    resourceLimits:
      memory: 512m
      cpu: 2
      timeout: 300s
      maxProcesses: 10
```

### Rate Limiting

Protect against abuse:

```yaml
security:
  rateLimit:
    enabled: true
    requestsPerMinute: 60
    burstLimit: 10
```

### Authentication (Network Transport)

Configure authentication for network-exposed MCP transports:

```yaml
security:
  auth:
    enabled: true # Enable authentication
    method: token # 'token' or 'oauth2'
    tokenHeader: Authorization # Header name for bearer token
    tokenFile: ~/.nexus-agents/auth/server-token # Token file path
```

Generate and manage auth tokens with CLI commands:

```bash
# Generate initial token
nexus-agents auth init

# Show token status
nexus-agents auth show

# Rotate token (invalidate old, generate new)
nexus-agents auth rotate
```

> **Note:** Authentication is for network-exposed transports (HTTP, WebSocket). Stdio transport is inherently secure as it only communicates with the parent process.

## Workflow Configuration

### Template Directory

Specify where workflows are stored:

```yaml
workflows:
  templateDir: ./workflows
```

### Execution Limits

Control workflow behavior:

```yaml
workflows:
  maxParallelSteps: 5
  stepTimeoutMs: 300000
  maxRetries: 3
  retryDelayMs: 1000
```

## Programmatic Configuration

When using nexus-agents as a library:

```typescript
import { createServer, startStdioServer } from 'nexus-agents';

const result = await startStdioServer({
  name: 'my-server',
  version: '1.0.0',
  config: {
    models: {
      default: 'claude-sonnet-4-20250514',
    },
    routing: {
      enableLinUCBSelection: true,
      budget: {
        tokenBudget: 500000,
      },
    },
    security: {
      sandbox: {
        mode: 'policy',
      },
    },
  },
});
```

## Validating Configuration

Check your configuration for errors:

```bash
nexus-agents config validate
```

Or with a specific file:

```bash
nexus-agents config validate --config ./custom-config.yaml
```

## Configuration Examples

### Cost-Optimized

Minimize API costs:

```yaml
models:
  default: claude-haiku-3

routing:
  budget:
    costBudgetUsd: 1.0
  topsis:
    qualityWeight: 0.3
    costWeight: 0.6
    latencyWeight: 0.1
```

### Quality-Focused

Maximize output quality:

```yaml
models:
  default: claude-opus-4

routing:
  budget:
    costBudgetUsd: 50.0
  topsis:
    qualityWeight: 0.7
    costWeight: 0.1
    latencyWeight: 0.2
```

### CI/CD Pipeline

Fast, secure, cost-aware:

```yaml
models:
  default: claude-sonnet-4-20250514

security:
  sandbox:
    mode: container
  rateLimit:
    enabled: true
    requestsPerMinute: 100

routing:
  budget:
    tokenBudget: 500000
    costBudgetUsd: 5.0

logging:
  level: warn
  format: json
```

## Related Documentation

- [CLI Usage](../ENTRYPOINTS.md) - Use configuration in CLI commands
- [Workflow Templates](../guides/WORKFLOW_TEMPLATES.md) - Create custom workflows
- [Architecture Overview](../architecture/README.md) - Understand system design
