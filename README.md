# Nexus Agents

> Multi-agent orchestration MCP server with model diversity and workflow automation

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-blue)](https://www.typescriptlang.org)
[![MCP Protocol](https://img.shields.io/badge/MCP-2025--11--25-purple)](https://modelcontextprotocol.io)
[![npm version](https://img.shields.io/npm/v/nexus-agents)](https://www.npmjs.com/package/nexus-agents)

---

## Overview

Nexus Agents is an MCP (Model Context Protocol) server that coordinates multiple AI experts to handle software development tasks. It provides a unified interface for different AI models and enables multi-agent collaboration through a Tech Lead and specialized experts.

### Key Capabilities

- **Multi-Agent Orchestration** - Tech Lead coordinates specialized experts for complex tasks
- **Model Diversity** - Support for Claude, OpenAI, Gemini, and Ollama
- **Workflow Automation** - YAML-based templates for repeatable processes
- **Security-First Design** - Defense in depth with secrets vault and input validation

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
import {
  createServer,
  startStdioServer,
  TechLead,
  createClaudeAdapter,
  ExpertFactory,
} from 'nexus-agents';

// Start MCP server
const result = await startStdioServer({
  name: 'my-server',
  version: '1.0.0',
});

// Or use programmatically
const adapter = createClaudeAdapter({
  model: 'claude-sonnet-4-20250514',
});
const techLead = new TechLead({ adapter });

// Create experts dynamically
const factory = new ExpertFactory(adapter);
const codeExpert = factory.create({ type: 'code' });
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

The Tech Lead agent analyzes incoming tasks and delegates to specialized experts:

| Expert                   | Specialization                                         |
| ------------------------ | ------------------------------------------------------ |
| **Code Expert**          | Implementation, debugging, optimization, refactoring   |
| **Architecture Expert**  | System design, patterns, trade-offs, scalability       |
| **Security Expert**      | Vulnerability analysis, secure coding, threat modeling |
| **Documentation Expert** | Technical writing, API docs, code comments             |
| **Testing Expert**       | Test strategies, coverage analysis, test generation    |

Experts can collaborate on complex tasks. The Tech Lead combines their outputs into a single response.

### Model Adapters

Use different AI models through unified interfaces:

| Provider   | Models                  | Best For                   |
| ---------- | ----------------------- | -------------------------- |
| **Claude** | Haiku, Sonnet, Opus     | General coding, analysis   |
| **OpenAI** | GPT-4o, GPT-4o-mini, o1 | Reasoning, code generation |
| **Gemini** | Pro, Ultra              | Long context, multimodal   |
| **Ollama** | Llama, CodeLlama, etc.  | Local inference, privacy   |

Model selection uses semantic classification with tier escalation:

```
Fast (quick queries) -> Balanced (most tasks) -> Powerful (complex reasoning)
```

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

The server exposes these MCP tools for integration:

| Tool            | Description                                  |
| --------------- | -------------------------------------------- |
| `orchestrate`   | Analyze task and coordinate expert execution |
| `create_expert` | Dynamically create a specialized expert      |
| `run_workflow`  | Execute a predefined workflow template       |

---

## Architecture

```
nexus-agents/
├── packages/
│   └── nexus-agents/     # Main package (all modules consolidated)
│       └── src/
│           ├── core/         # Shared types, Result<T,E>, errors, logger
│           ├── config/       # Configuration loading and validation
│           ├── adapters/     # Model adapters (Claude, OpenAI, Gemini, Ollama)
│           ├── agents/       # Agent framework (TechLead, Experts)
│           ├── workflows/    # Workflow engine and templates
│           ├── mcp/          # MCP server and tool definitions
│           ├── index.ts      # Main exports
│           └── cli.ts        # CLI entry point
```

### Dependency Flow

```
MCP Server (external boundary)
    ↓
Workflow Engine (orchestrates execution)
    ↓
Agents Layer (TechLead, Experts)
    ↓
Adapters Layer (Claude, OpenAI, Gemini, Ollama)
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
const claude = createClaudeAdapter({ model: 'claude-sonnet-4-20250514' });
const openai = createOpenAIAdapter({ model: 'gpt-4o' });
const gemini = createGeminiAdapter({ model: 'gemini-1.5-pro' });
const ollama = createOllamaAdapter({ model: 'llama3:8b' });

// Or use the factory
const factory = new AdapterFactory();
const adapter = factory.create({ provider: 'anthropic', model: 'claude-sonnet-4-20250514' });
```

### Agents

```typescript
import { TechLead, ExpertFactory, Expert } from 'nexus-agents';

// Create TechLead for orchestration
const techLead = new TechLead({ adapter });

// Create experts
const factory = new ExpertFactory(adapter);
const codeExpert = factory.create({ type: 'code' });
const securityExpert = factory.create({ type: 'security' });
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
- TypeScript 5.8+

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

See [CODING_STANDARDS.md](./CODING_STANDARDS.md) for detailed guidelines.
See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution workflow.

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

MIT - See [LICENSE](./LICENSE) for details.

---

## Acknowledgments

This project is a clean-room rewrite inspired by [claude-team-mcp](https://github.com/original/claude-team-mcp), with attribution preserved per MIT license.

---

Built with Claude Code
