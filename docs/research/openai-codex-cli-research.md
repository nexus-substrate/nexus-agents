# OpenAI Codex CLI Research Report

**Research Date:** 2026-01-04 (ET)
**Purpose:** Planning hybrid swarm approach for nexus-agents multi-AI CLI orchestration
**Status:** Complete

---

## Executive Summary

OpenAI Codex CLI is a powerful, open-source coding agent that runs locally in the terminal. It supports MCP (Model Context Protocol), non-interactive execution mode, and can be orchestrated programmatically via its TypeScript SDK. For nexus-agents hybrid swarm integration, Codex CLI offers strong potential for delegation of focused implementation tasks, especially those benefiting from GPT-5 series reasoning capabilities.

**Key Integration Points:**

- Non-interactive mode (`codex exec`) with JSON output streaming
- Full MCP support (can consume MCP servers AND run as an MCP server)
- TypeScript SDK for programmatic control
- OAuth and API key authentication (no hardcoded secrets required)

---

## 1. Available Models

### Current Recommended Models (2025-2026)

| Model                | Description                              | Best For                                          | Command                       |
| -------------------- | ---------------------------------------- | ------------------------------------------------- | ----------------------------- |
| `gpt-5.2-codex`      | Most advanced agentic coding model       | Complex refactors, migrations, long-horizon tasks | `codex -m gpt-5.2-codex`      |
| `gpt-5.1-codex-max`  | Optimized for long-horizon agentic tasks | Extended coding sessions                          | `codex -m gpt-5.1-codex-max`  |
| `gpt-5.1-codex-mini` | Smaller, cost-effective version          | Quick Q&A, simple edits                           | `codex -m gpt-5.1-codex-mini` |
| `gpt-5-codex`        | Default on macOS/Linux                   | General coding tasks                              | `codex -m gpt-5-codex`        |
| `gpt-5`              | Default on Windows                       | General purpose                                   | `codex -m gpt-5`              |

### o-Series Reasoning Models (Legacy, integrated into GPT-5.x)

| Model     | Capabilities                              | Notes                         |
| --------- | ----------------------------------------- | ----------------------------- |
| `o3`      | Advanced reasoning, math, science, coding | Integrated into codex-1       |
| `o4-mini` | Fast reasoning, low latency               | Optimized for interactive Q&A |
| `o1`      | Original reasoning model                  | Superseded by o3/o4           |

**Note:** The o-series models have been largely absorbed into the GPT-5.x family, unifying reasoning capabilities with general intelligence and coding specialization.

### Model Selection Strategy

```toml
# ~/.codex/config.toml
model = "gpt-5.2-codex"  # Default model

# Or via CLI
# codex -m gpt-5.1-codex-mini  # For quick tasks
# codex -m gpt-5.2-codex       # For complex tasks
```

**Source:** [Codex Models Documentation](https://developers.openai.com/codex/models/)

---

## 2. Authentication

### Supported Authentication Methods

#### 1. ChatGPT OAuth Flow (Recommended)

```bash
# Interactive browser-based OAuth
codex login

# Sign in with ChatGPT account (Plus, Pro, Team, Edu, Enterprise)
```

#### 2. API Key via stdin (Automation-Friendly)

```bash
# Pipe API key from environment
printenv OPENAI_API_KEY | codex login --with-api-key

# Or from secret manager
vault read -field=api_key secret/openai | codex login --with-api-key
```

#### 3. Environment Variable (CI/CD)

```bash
# Set as environment variable for automation
export CODEX_API_KEY="your-api-key"
codex exec "your task"
```

### Authentication Status Check

```bash
# Check if logged in (useful for scripts)
codex login status
# Exit code 0 = logged in, non-zero = not logged in

# Logout
codex logout
```

### Security Considerations

- **No hardcoded API keys required** - OAuth flow preferred
- **CI/CD Integration** - Use `CODEX_API_KEY` environment variable
- **Credential storage** - Managed in `~/.codex/` directory
- **Session isolation** - Each thread has isolated credentials context

**Source:** [Codex CLI Reference](https://developers.openai.com/codex/cli/reference/)

---

## 3. MCP Compatibility

### MCP Support Status: Full Support

Codex CLI has comprehensive MCP support:

- **Consume MCP servers** (STDIO and Streamable HTTP)
- **Run AS an MCP server** (can be called by other agents)
- **Configuration** via `~/.codex/config.toml` or CLI commands

### Supported MCP Server Types

#### STDIO Servers (Local Processes)

```toml
# ~/.codex/config.toml
[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]
startup_timeout_sec = 15
tool_timeout_sec = 60
enabled = true
```

#### Streamable HTTP Servers (Remote)

```toml
[mcp_servers.remote-tools]
url = "https://mcp.example.com/v1"
bearer_token_env_var = "MCP_AUTH_TOKEN"
```

### CLI MCP Management

```bash
# Add MCP server
codex mcp add context7 -- npx -y @upstash/context7-mcp

# Add with environment variables
codex mcp add github --env GITHUB_TOKEN=$GITHUB_TOKEN -- npx @modelcontextprotocol/server-github

# List MCP servers
codex mcp list

# Remove MCP server
codex mcp remove context7
```

### Running Codex AS an MCP Server

```bash
# Expose Codex as MCP server for other tools
codex mcp serve

# Other agents can then connect to Codex via MCP
```

### Notable MCP Ecosystem Servers

| Server          | Purpose                            |
| --------------- | ---------------------------------- |
| Context7        | Up-to-date developer documentation |
| Figma           | Design access (local and remote)   |
| Playwright      | Browser automation                 |
| Chrome DevTools | Browser inspection                 |
| Sentry          | Error logs access                  |
| GitHub          | Repository management beyond git   |

**Source:** [Codex MCP Documentation](https://developers.openai.com/codex/mcp/)

---

## 4. CLI Interface

### Installation

```bash
# npm (recommended)
npm install -g @openai/codex

# Homebrew (macOS)
brew install --cask codex

# Manual binary download from GitHub releases
```

### Command Structure

```bash
# Main commands
codex                           # Interactive TUI mode
codex exec "task"               # Non-interactive execution (alias: codex e)
codex login                     # Authenticate
codex logout                    # Remove credentials
codex mcp <subcommand>          # MCP server management
codex resume                    # Resume previous session
codex completion                # Generate shell completions
codex execpolicy check          # Check execution policies
```

### Key CLI Flags

| Flag                     | Description                                  |
| ------------------------ | -------------------------------------------- |
| `-m, --model <model>`    | Override model (e.g., `gpt-5.2-codex`)       |
| `-c <key=value>`         | Override config values                       |
| `--cd <path>`            | Set working directory                        |
| `--add-dir <path>`       | Grant additional directory write access      |
| `-i, --image <path>`     | Attach image files to prompt                 |
| `--search`               | Enable web search tool                       |
| `--full-auto`            | Allow file edits without approval            |
| `--sandbox <policy>`     | Sandbox policy (danger-full-access for CI)   |
| `--json`                 | Output JSON Lines for automation             |
| `-o, --output <path>`    | Write final message to file                  |
| `--output-schema <path>` | Request structured JSON output               |
| `--yolo`                 | Bypass all approvals and sandbox (dangerous) |
| `--skip-git-repo-check`  | Run outside git repository                   |

### Approval Modes

| Mode                           | Behavior                                              |
| ------------------------------ | ----------------------------------------------------- |
| `auto` (default)               | Reads/edits files, runs commands in working directory |
| `read-only`                    | Browse only, manual approval required                 |
| `full-auto`                    | All file operations without approval                  |
| `--sandbox danger-full-access` | Unrestricted (CI/container only)                      |

**Source:** [Command Line Options](https://developers.openai.com/codex/cli/reference/)

---

## 5. Integration Potential

### Non-Interactive Execution (Key for Orchestration)

```bash
# Basic non-interactive execution
codex exec "analyze this codebase and suggest improvements"

# JSON Lines output for programmatic consumption
codex exec --json "summarize the repo structure" | jq

# Structured output with schema
codex exec --output-schema ./schema.json "generate release notes"

# Full automation mode for CI
codex exec --full-auto --sandbox danger-full-access "run tests and fix failures"
```

### JSON Event Stream

When using `--json`, stdout becomes a JSON Lines stream:

```json
{"type": "thread.started", "thread_id": "abc123"}
{"type": "turn.started", "turn_id": "xyz789"}
{"type": "item.message", "content": "Analyzing codebase..."}
{"type": "item.command", "command": "npm test", "status": "running"}
{"type": "turn.completed", "result": "success"}
```

**Event Types:**

- `thread.started`, `turn.started`, `turn.completed`, `turn.failed`
- `item.message`, `item.reasoning`, `item.command`, `item.file_change`
- `item.mcp_tool_call`, `item.web_search`, `item.plan_update`
- `error`

### TypeScript SDK (Programmatic Control)

```typescript
import { Codex } from '@openai/codex-sdk';

// Initialize Codex
const codex = new Codex();

// Start a new thread
const thread = codex.startThread();

// Run a task
const result = await thread.run('Refactor the authentication module');

// Resume a previous thread
const resumedThread = codex.resumeThread(threadId);
await resumedThread.run('Continue with the database layer');
```

**SDK Requirements:** Node.js 18+

### Subprocess Spawning Pattern

```typescript
import { spawn } from 'child_process';

// Spawn Codex as subprocess with JSON output
const codex = spawn('codex', ['exec', '--json', '--full-auto', 'your task description'], {
  env: {
    ...process.env,
    CODEX_API_KEY: process.env.OPENAI_API_KEY,
  },
});

// Stream JSON events
codex.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(Boolean);
  for (const line of lines) {
    const event = JSON.parse(line);
    handleCodexEvent(event);
  }
});
```

### Session Management

```bash
# Resume last session
codex exec resume --last "continue with next step"

# Resume specific session
codex exec resume <SESSION_ID> "add error handling"
```

### Known Limitations for Headless Orchestration

**GitHub Issue #4219:** Codex CLI has some limitations in non-TTY/headless environments:

- May panic or block in some edge cases
- JSON event stream may not be fully stable for all operations
- Claude Code reportedly handles headless mode more reliably

**Workaround:** Use the TypeScript SDK for more robust programmatic control.

**Source:** [Non-Interactive Mode](https://developers.openai.com/codex/noninteractive/), [Codex SDK](https://developers.openai.com/codex/sdk/)

---

## 6. Strengths for Capability Matching

### Best Use Cases for Codex CLI

| Task Category          | Suitability | Reason                                   |
| ---------------------- | ----------- | ---------------------------------------- |
| **Code Generation**    | Excellent   | Trained specifically for code generation |
| **Codebase Analysis**  | Excellent   | Can read and understand large codebases  |
| **Code Review**        | Excellent   | Built-in `/review` command               |
| **Bug Fixing**         | Excellent   | Can run tests and iterate                |
| **Refactoring**        | Excellent   | Long-horizon task handling               |
| **Test Writing**       | Very Good   | Can generate and run tests               |
| **PR Generation**      | Very Good   | Automated PR creation                    |
| **Documentation**      | Good        | Code-aware doc generation                |
| **Complex Reasoning**  | Excellent   | GPT-5.2 reasoning capabilities           |
| **Multi-file Changes** | Excellent   | Context compaction for large changes     |

### Model-Specific Strengths

| Model                 | Best For                                               |
| --------------------- | ------------------------------------------------------ |
| `gpt-5.2-codex`       | Complex refactors, large migrations, extended sessions |
| `gpt-5.1-codex-max`   | Long-running autonomous tasks                          |
| `gpt-5.1-codex-mini`  | Quick Q&A, simple edits, low latency                   |
| `o3/o4-mini` (legacy) | Deep mathematical/logical reasoning                    |

### Compared to Claude Code

| Aspect              | Codex CLI                               | Claude Code                                   |
| ------------------- | --------------------------------------- | --------------------------------------------- |
| **Philosophy**      | Autonomous agent ("employee to manage") | Interactive pair programmer ("tool to wield") |
| **Execution**       | Cloud-based parallel tasks              | Local execution                               |
| **Best For**        | Delegated implementation tasks          | Architecture design, deep investigation       |
| **MCP Support**     | STDIO + HTTP (HTTP limited)             | Full MCP support                              |
| **Headless Mode**   | Some limitations                        | More reliable                                 |
| **SWE-bench Score** | 69.1%                                   | 72.7%                                         |

### Recommended Hybrid Strategy

Based on research, the optimal hybrid approach for nexus-agents:

1. **Architecture & Investigation:** Use Claude Code for design decisions, codebase analysis, and complex multi-step reasoning
2. **Focused Implementation:** Delegate specific, well-defined coding tasks to Codex CLI
3. **Parallel Execution:** Use Codex for multiple independent tasks simultaneously
4. **MCP Bridge:** Codex can run as MCP server, allowing Claude Code to orchestrate it

**Source:** [Introducing GPT-5.2-Codex](https://openai.com/index/introducing-gpt-5-2-codex/), [OpenAI for Developers 2025](https://developers.openai.com/blog/openai-for-developers-2025/)

---

## 7. Configuration Reference

### Full config.toml Example

```toml
# ~/.codex/config.toml

# Model configuration
model = "gpt-5.2-codex"
model_provider = "openai"

# Approval settings
approval_mode = "auto"

# Features
[features]
web_search = true

# Shell environment
[shell_environment_policy]
inherit = "core"
excludes = ["AWS_SECRET_ACCESS_KEY", "GITHUB_TOKEN"]
includes = ["PATH", "HOME", "NODE_ENV"]

# MCP Servers
[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]
startup_timeout_sec = 15
tool_timeout_sec = 60
enabled = true

[mcp_servers.github]
command = "npx"
args = ["@modelcontextprotocol/server-github"]
env = { GITHUB_TOKEN = "$GITHUB_TOKEN" }
```

---

## 8. Integration Recommendations for nexus-agents

### Delegation Strategy

```yaml
# Suggested capability matching for hybrid swarm
tasks:
  # Route to Codex CLI
  codex_suited:
    - Well-defined implementation tasks
    - Test generation and fixing
    - Code review requests
    - PR creation
    - Parallel independent tasks
    - Codebase summarization

  # Route to Claude Code
  claude_suited:
    - Architecture decisions
    - Complex multi-step reasoning
    - Interactive debugging
    - Design discussions
    - Security analysis
```

### Implementation Pattern

```typescript
// nexus-agents Codex integration concept
interface CodexTask {
  prompt: string;
  model?: 'gpt-5.2-codex' | 'gpt-5.1-codex-mini';
  outputSchema?: JSONSchema;
  workingDirectory: string;
  timeout?: number;
}

async function delegateToCodex(task: CodexTask): Promise<CodexResult> {
  const args = ['exec', '--json'];

  if (task.model) args.push('-m', task.model);
  if (task.outputSchema) args.push('--output-schema', schemaPath);

  args.push(task.prompt);

  return spawnCodexProcess(args, {
    cwd: task.workingDirectory,
    env: { CODEX_API_KEY: getApiKey() },
  });
}
```

### MCP Server Bridge

```typescript
// Run Codex as MCP server for nexus-agents orchestration
// Then Claude Code or other agents can call it via MCP
// codex mcp serve
```

---

## Sources

- [Codex CLI Documentation](https://developers.openai.com/codex/cli/)
- [Codex CLI Reference](https://developers.openai.com/codex/cli/reference/)
- [Codex CLI Features](https://developers.openai.com/codex/cli/features/)
- [Codex Models](https://developers.openai.com/codex/models/)
- [Codex MCP](https://developers.openai.com/codex/mcp/)
- [Codex SDK](https://developers.openai.com/codex/sdk/)
- [Non-Interactive Mode](https://developers.openai.com/codex/noninteractive/)
- [GitHub Repository](https://github.com/openai/codex)
- [Introducing GPT-5.2-Codex](https://openai.com/index/introducing-gpt-5-2-codex/)
- [OpenAI for Developers 2025](https://developers.openai.com/blog/openai-for-developers-2025/)
- [Claude Code vs OpenAI Codex Comparisons](https://composio.dev/blog/claude-code-vs-openai-codex)

---

_Research compiled for nexus-agents hybrid swarm planning_
_Last updated: 2026-01-04 (ET)_
