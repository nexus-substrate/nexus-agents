# Nexus Agents

> The intelligence layer between you and your AI coding tools

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-blue)](https://www.typescriptlang.org)
[![MCP Protocol](https://img.shields.io/badge/MCP-2025--11--25-purple)](https://modelcontextprotocol.io)
[![npm version](https://img.shields.io/npm/v/nexus-agents)](https://www.npmjs.com/package/nexus-agents)

---

## Overview

Nexus Agents makes your AI coding tools work together intelligently. It coordinates Claude, Codex, Gemini, and OpenCode — routing each task to the best model using data-driven algorithms (LinUCB bandit, TOPSIS scoring, adaptive bonuses), validating outputs through multi-model consensus voting, and continuously improving through outcome-driven learning. Connect it to any MCP-compatible editor and it handles the rest.

### Key Capabilities

- **Intelligent Routing** — Multi-stage CompositeRouter (TOPSIS, LinUCB bandit, distilled-rule short-circuit, weather-aware penalties). Learns from outcomes.
- **Multi-Expert Orchestration** — Specialized expert agents (code, architecture, security, testing, docs, devops, research, PM, UX, infrastructure, QA, data-visualization) coordinated by an Orchestrator.
- **Consensus Voting** — Six aggregation strategies: simple/super-majority, unanimous, higher-order Bayesian, opinion-wise, proof-of-learning.
- **Development Pipeline** — Research → Plan → Vote → Decompose → Implement → QA → Security. Autonomous, harness, and dry-run modes.
- **Memory & Learning** — Multiple backends (session, belief, adaptive, routing, graph, hybrid, agentic, typed) with cross-session persistence.
- **MCP Tools** — Agent management, workflow execution, research, memory, codebase intelligence, repo analysis, consensus, operations. See [docs/ENTRYPOINTS.md](https://github.com/williamzujkowski/nexus-agents/blob/main/docs/ENTRYPOINTS.md) for the canonical list.
- **Research System** — Discovery across arXiv, GitHub, Semantic Scholar, and other sources with auto-catalog and synthesis.
- **Security** — Sandboxing, trust classification, SARIF parsing, input sanitization, red team pipeline.

---

## Quick Start

### Installation

```bash
# Install the package
npm install nexus-agents

# Or install globally for CLI usage
npm install -g nexus-agents
```

### CLI Usage

Start the MCP server:

```bash
# If installed globally
nexus-agents

# Or with npx
npx nexus-agents
```

### Programmatic Usage

```typescript
import { startStdioServer, ExpertFactory, createClaudeAdapter } from 'nexus-agents';

// Start MCP server (recommended — used by Claude Code, Claude Desktop, etc.)
const result = await startStdioServer({
  name: 'my-server',
  version: '1.0.0',
});

// Or use programmatically with model adapters
const adapter = createClaudeAdapter({
  model: 'claude-sonnet-4-6',
});

// Create experts dynamically
const factory = new ExpertFactory(adapter);
const codeExpert = factory.create({ type: 'code' });
const securityExpert = factory.create({ type: 'security' });
```

### Claude Desktop Integration

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "nexus-agents": {
      "command": "npx",
      "args": ["nexus-agents"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

---

## Features

### Multi-Agent Orchestration

The Orchestrator agent analyzes incoming tasks and delegates to specialized experts:

| Expert                    | Specialization                                         |
| ------------------------- | ------------------------------------------------------ |
| **Code Expert**           | Implementation, debugging, optimization, refactoring   |
| **Architecture Expert**   | System design, patterns, trade-offs, scalability       |
| **Security Expert**       | Vulnerability analysis, secure coding, threat modeling |
| **Documentation Expert**  | Technical writing, API docs, code comments             |
| **Testing Expert**        | Test strategies, coverage analysis, test generation    |
| **DevOps Expert**         | CI/CD, deployment, containerization                    |
| **Research Expert**       | Literature review, state-of-the-art analysis           |
| **PM Expert**             | Product management, requirements, priorities           |
| **UX Expert**             | User experience, usability, accessibility              |
| **Infrastructure Expert** | Server management, bare metal, networking              |

Experts can collaborate on complex tasks. The Orchestrator combines their outputs into a single response.

### Model Adapters

Use different AI models through unified interfaces:

| Provider     | CLI      | Best For                           |
| ------------ | -------- | ---------------------------------- |
| **Claude**   | claude   | Complex reasoning, analysis        |
| **Gemini**   | gemini   | Long context, multimodal           |
| **Codex**    | codex    | Code generation, reasoning         |
| **OpenCode** | opencode | Custom OpenAI-compatible endpoints |

Model selection uses composite routing: Budget → Zero-cost → Preference → TOPSIS → LinUCB bandit.

### Workflow Engine

Define reusable workflows in YAML:

```yaml
name: code-review
description: Comprehensive code review workflow
steps:
  - agent: security_expert
    action: scan_vulnerabilities
    output: security_report

  - agent: code_expert
    action: review_quality
    input: ${security_report}
    output: quality_report

  - agent: testing_expert
    action: analyze_coverage
    parallel: true

  - agent: documentation_expert
    action: check_documentation
    parallel: true
```

### MCP Tools

The server exposes 24 MCP tools for integration. Key tools include:

| Tool                 | Description                                    |
| -------------------- | ---------------------------------------------- |
| `orchestrate`        | Analyze task and coordinate expert execution   |
| `create_expert`      | Create a specialized expert agent              |
| `execute_expert`     | Execute a task using a created expert          |
| `run_workflow`       | Execute a workflow template                    |
| `delegate_to_model`  | Route task to optimal model                    |
| `consensus_vote`     | Multi-model consensus voting on proposals      |
| `research_discover`  | Discover papers/repos from external sources    |
| `memory_query`       | Query across all memory backends               |
| `issue_triage`       | Triage GitHub issues with trust classification |
| `repo_analyze`       | Analyze GitHub repository structure            |
| `repo_security_plan` | Generate security scanning pipeline for a repo |

See the root [README](../../README.md) for the complete tool list.

---

## Architecture

```
nexus-agents/
├── packages/
│   └── nexus-agents/         # Main package
│       ├── src/
│       │   ├── core/         # Shared types, Result<T,E>, errors, logger
│       │   ├── config/       # Configuration, model registry, timeouts
│       │   ├── adapters/     # Model adapters (Claude, OpenAI, Gemini, Ollama)
│       │   ├── agents/       # Agent framework (Orchestrator, Experts)
│       │   ├── workflows/    # Workflow engine and YAML templates
│       │   ├── mcp/          # MCP server and tool definitions
│       │   ├── cli-adapters/ # External CLI integration (Claude/Gemini/Codex/OpenCode)
│       │   ├── context/      # Token counting, work balancing
│       │   ├── consensus/    # Multi-agent voting with higher-order aggregation
│       │   ├── memory/       # 8 memory backends (session, belief, adaptive, routing, graph, hybrid, agentic, typed)
│       │   ├── security/     # Input sanitization, trust classification, policy gate
│       │   ├── orchestration/# Graph workflows, AOrchestra, worker dispatch
│       │   ├── pipeline/     # Task contracts, plugin registry, event bus
│       │   ├── index.ts      # Main exports
│       │   └── cli.ts        # CLI entry point
│       └── package.json
├── .claude/
│   ├── rules/                # Claude Code rules
│   └── skills/               # Project-specific skills
└── pnpm-workspace.yaml
```

See [docs/architecture/README.md](../../docs/architecture/README.md) for detailed module descriptions.

### Dependency Flow

```
MCP Server (external boundary)
    ↓
Orchestration Layer (workflows, graph execution, worker dispatch)
    ↓
Agents Layer (Orchestrator, 10 Expert types)
    ↓
Adapters Layer (Claude, Gemini, Codex, OpenCode CLIs)
    ↓
Core Layer (Types, Result<T,E>, Errors, Logger)
```

### Core Interfaces

```typescript
// Unified model interaction
interface IModelAdapter {
  complete(request: CompletionRequest): Promise<Result<Response, ModelError>>;
  stream(request: CompletionRequest): AsyncIterable<StreamChunk>;
  countTokens(text: string): Promise<number>;
}

// Base agent contract
interface IAgent {
  readonly id: string;
  readonly role: AgentRole;
  execute(task: Task): Promise<Result<TaskResult, AgentError>>;
  handleMessage(msg: AgentMessage): Promise<Result<AgentResponse, AgentError>>;
}

// Workflow execution
interface IWorkflowEngine {
  loadTemplate(path: string): Promise<Result<WorkflowDefinition, ParseError>>;
  execute(
    workflow: WorkflowDefinition,
    inputs: unknown
  ): Promise<Result<WorkflowResult, WorkflowError>>;
}
```

---

## Configuration

### Environment Variables

| Variable            | Description                       | Required                              |
| ------------------- | --------------------------------- | ------------------------------------- |
| `ANTHROPIC_API_KEY` | Claude API key                    | Yes (for Claude)                      |
| `OPENAI_API_KEY`    | OpenAI API key                    | For OpenAI models                     |
| `GOOGLE_AI_API_KEY` | Google AI API key                 | For Gemini models                     |
| `OLLAMA_HOST`       | Ollama server URL                 | For Ollama (default: localhost:11434) |
| `NEXUS_LOG_LEVEL`   | Log level (debug/info/warn/error) | No                                    |

---

## API Reference

### Adapters

```typescript
import {
  createClaudeAdapter,
  createOpenAIAdapter,
  createGeminiAdapter,
  createOllamaAdapter,
  AdapterFactory,
} from 'nexus-agents';

// Create individual adapters
const claude = createClaudeAdapter({ model: 'claude-sonnet-4-6' });
const openai = createOpenAIAdapter({ model: 'gpt-4o' });
const gemini = createGeminiAdapter({ model: 'gemini-1.5-pro' });
const ollama = createOllamaAdapter({ model: 'llama3:8b' });

// Or use the factory
const factory = new AdapterFactory();
const adapter = factory.create({ provider: 'anthropic', model: 'claude-sonnet-4-6' });
```

### Agents

```typescript
import { ExpertFactory } from 'nexus-agents';

// Create experts for specific domains
const factory = new ExpertFactory(adapter);
const codeExpert = factory.create({ type: 'code' });
const securityExpert = factory.create({ type: 'security' });
const infraExpert = factory.create({ type: 'infrastructure' });
```

### MCP Server

```typescript
import { createServer, startStdioServer, registerTools } from 'nexus-agents';

// Create and start server
const result = await startStdioServer({
  name: 'my-server',
  version: '1.0.0',
});

if (result.ok) {
  const { server } = result.value;
  // Server is running with stdio transport
}
```

---

## Development

### Prerequisites

- Node.js 22.x LTS
- pnpm 9.x
- TypeScript 5.9+

### Setup

```bash
# Clone the repository
git clone https://github.com/williamzujkowski/nexus-agents.git
cd nexus-agents

# Install dependencies
pnpm install

# Build the package
pnpm build

# Run tests
pnpm test

# Start development mode
pnpm dev
```

### Commands

```bash
# Development
pnpm dev              # Start dev server with watch mode
pnpm build            # Build the package
pnpm clean            # Clean build artifacts

# Quality
pnpm lint             # Run ESLint
pnpm lint:fix         # Fix linting issues
pnpm typecheck        # Run TypeScript type checking
pnpm test             # Run all tests
pnpm test:coverage    # Run tests with coverage
```

---

## Contributing

We welcome contributions! Please see our guidelines:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feat/amazing-feature`)
3. **Commit** with conventional commits (`git commit -m 'feat(agents): add amazing feature'`)
4. **Push** to your branch (`git push origin feat/amazing-feature`)
5. **Open** a Pull Request

### Code Standards

- Files must be under 400 lines
- Functions must be under 50 lines
- Test coverage must be at least 80%
- All code must pass linting and type checking

See [CODING_STANDARDS.md](../../CODING_STANDARDS.md) for detailed guidelines.
See [CONTRIBUTING.md](../../CONTRIBUTING.md) for contribution workflow.

### Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(scope): add new feature
fix(scope): fix bug
refactor(scope): refactor code
docs(scope): update documentation
test(scope): add tests
chore(scope): maintenance tasks
```

---

## License

MIT - See [LICENSE](../../LICENSE) for details.

---

---

Built with Claude Code
