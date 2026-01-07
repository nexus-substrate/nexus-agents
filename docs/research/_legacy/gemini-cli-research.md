# Gemini CLI Research Report

**Prepared for:** nexus-agents hybrid swarm integration planning
**Research Date:** 2026-01-04 (ET)
**Status:** Complete

---

## Executive Summary

Gemini CLI is Google's open-source AI agent that provides terminal-based access to Gemini models. It offers significant advantages for a hybrid swarm approach: massive context windows (1M tokens), full MCP support, generous free tier, and headless/non-interactive modes for subprocess orchestration. However, native multi-agent orchestration is not yet supported, requiring external coordination.

---

## 1. Available Models

### Current Model Lineup (2025-2026)

| Model                     | Context Window        | Output Limit | Best For                               |
| ------------------------- | --------------------- | ------------ | -------------------------------------- |
| **Gemini 3 Pro**          | 1M tokens             | 64K tokens   | Complex reasoning, multimodal          |
| **Gemini 3 Flash**        | 200K tokens           | Lower        | Fast responses, agents, streaming      |
| **Gemini 2.5 Pro**        | 1M tokens (2M coming) | 64K tokens   | Thinking/reasoning, code, long context |
| **Gemini 2.5 Flash**      | 1M tokens             | 8-32K tokens | High volume, low latency, agentic      |
| **Gemini 2.5 Flash-Lite** | 1M tokens             | -            | Speed and cost optimization            |
| **Gemini 2.0 Flash**      | 1M tokens             | -            | Legacy, native tool use                |

### Gemini CLI Default

Gemini CLI provides access to **Gemini 2.5 Pro** by default with 1M token context window.

### Model Selection

```bash
# Specify model via flag
gemini -m gemini-2.5-flash
gemini -m gemini-3-flash-preview

# Or in settings.json
{
  "model": "gemini-2.5-pro"
}
```

### Multimodal Capabilities

All Gemini models support **native multimodal input**:

- **Text**: Standard prompt/response
- **Images**: Visual pattern extraction, diagram analysis, OCR
- **Video**: Scene segmentation, object tracking, timeline-specific Q&A
- **Audio**: Speech recognition, emotion detection, transcription

**Input Methods:**

- File API upload for files >20MB or videos >1 minute
- Inline data for smaller files (<20MB)
- YouTube URL references
- Real-time streaming via Live API (10 FPS video, 1Kbps audio)

**Sources:**

- [Gemini Models Documentation](https://ai.google.dev/gemini-api/docs/models)
- [Gemini 3 Developer Guide](https://ai.google.dev/gemini-api/docs/gemini-3)
- [Video Understanding](https://ai.google.dev/gemini-api/docs/video-understanding)

---

## 2. Authentication

### Authentication Methods

| Method                   | Configuration                                       | Use Case                      |
| ------------------------ | --------------------------------------------------- | ----------------------------- |
| **Google OAuth**         | Interactive login prompt                            | Personal use, free tier       |
| **Gemini API Key**       | `GEMINI_API_KEY` env var                            | Development, scripting        |
| **Vertex AI ADC**        | `gcloud auth application-default login`             | Enterprise, Cloud integration |
| **Service Account**      | `GOOGLE_APPLICATION_CREDENTIALS`                    | CI/CD, automation             |
| **Google Cloud API Key** | `GOOGLE_API_KEY` + `GOOGLE_GENAI_USE_VERTEXAI=true` | Vertex AI access              |
| **Automatic ADC**        | None (auto-detected)                                | Cloud Shell, Compute Engine   |

### OAuth Flow

```bash
# First run triggers OAuth in browser
gemini

# Select "Login with Google" when prompted
# Credentials cached locally at ~/.gemini/
```

### API Key Authentication

```bash
# Set environment variable
export GEMINI_API_KEY="your-api-key-here"

# Or use .env file (loaded automatically)
echo "GEMINI_API_KEY=your-key" > .env
```

### Vertex AI / Enterprise

```bash
# ADC authentication
gcloud auth application-default login

# Required environment variables
export GOOGLE_CLOUD_PROJECT="your-project-id"
export GOOGLE_GENAI_USE_VERTEXAI=true

# For service accounts
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
```

### Rate Limits

| Auth Method         | Requests/Min     | Requests/Day | Model          |
| ------------------- | ---------------- | ------------ | -------------- |
| Google OAuth (Free) | 60               | 1,000        | Gemini 2.5 Pro |
| Gemini API Key      | -                | 100 (free)   | Gemini 2.5 Pro |
| Vertex AI           | Based on billing | Scalable     | All models     |

**Key Finding:** Gemini CLI **does support OAuth** and can use Google Cloud credentials without explicit API keys through Application Default Credentials (ADC).

**Sources:**

- [Gemini CLI Authentication](https://github.com/google-gemini/gemini-cli/blob/main/docs/get-started/authentication.md)
- [Configuration Guide](https://geminicli.com/docs/get-started/configuration/)

---

## 3. MCP Compatibility

### MCP Support Status

**Full MCP Support**: Gemini CLI fully implements the Model Context Protocol for extending capabilities.

### Configuration

MCP servers are configured in `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "serverName": {
      "command": "path/to/executable",
      "args": ["--arg1", "--arg2"],
      "env": {
        "API_KEY": "$MY_TOKEN"
      },
      "timeout": 30000,
      "trust": false
    }
  }
}
```

### Supported Transport Methods

| Transport          | Configuration      | Use Case                  |
| ------------------ | ------------------ | ------------------------- |
| **Stdio**          | `command` + `args` | Local processes           |
| **SSE**            | `url`              | Remote Server-Sent Events |
| **HTTP Streaming** | `httpUrl`          | HTTP endpoints            |

### MCP Features

- **Tools**: Auto-discovered, filterable via `includeTools`/`excludeTools`
- **Resources**: Referenced via `@server://resource/path` syntax
- **Prompts**: Exposed as slash commands (e.g., `/prompt-name --arg=value`)
- **Rich Content**: Tools can return text, images, audio, binary data

### Example Configurations

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "$GITHUB_TOKEN"
      }
    },
    "firebase": {
      "command": "npx",
      "args": ["-y", "firebase-tools@latest", "mcp"]
    },
    "pythonTools": {
      "command": "python",
      "args": ["-m", "my_mcp_server"],
      "cwd": "/path/to/server"
    },
    "remoteServer": {
      "url": "https://my-server.com/sse",
      "headers": {
        "Authorization": "Bearer $TOKEN"
      }
    }
  }
}
```

### MCP Management Commands

```bash
gemini mcp add <name> <command>    # Add server
gemini mcp list                     # List servers
gemini mcp remove <name>            # Remove server
/mcp                                # Show loaded tools
/mcp desc                           # Full tool descriptions
```

### OAuth for MCP Servers

```json
{
  "mcpServers": {
    "secureServer": {
      "url": "https://service.run.app/sse",
      "authProviderType": "service_account_impersonation",
      "targetAudience": "CLIENT_ID.apps.googleusercontent.com",
      "targetServiceAccount": "sa@project.iam.gserviceaccount.com"
    }
  }
}
```

**Sources:**

- [MCP Server Documentation](https://geminicli.com/docs/tools/mcp-server/)
- [FastMCP Integration](https://developers.googleblog.com/en/gemini-cli-fastmcp-simplifying-mcp-server-development/)

---

## 4. CLI Interface

### Installation

```bash
# npm (recommended)
npm install -g @google/gemini-cli

# Homebrew
brew install gemini-cli

# npx (no install)
npx https://github.com/google-gemini/gemini-cli

# Release channels
npm install -g @google/gemini-cli@latest   # Stable (Tuesdays UTC 2000)
npm install -g @google/gemini-cli@preview  # Preview (Tuesdays UTC 2359)
npm install -g @google/gemini-cli@nightly  # Daily builds
```

### Command Structure

```bash
# Interactive mode
gemini

# Non-interactive with prompt
gemini -p "What is the gcloud command to deploy to Cloud Run"
gemini --prompt "Summarize this file" < file.txt

# Model selection
gemini -m gemini-2.5-flash
gemini --model gemini-3-flash-preview

# Directory inclusion
gemini --include-directories ../lib,../docs

# Output formats
gemini -p "query" --output-format json
gemini -p "query" --output-format stream-json

# Auto-approve modes
gemini --yolo
gemini -y
gemini --approval-mode=yolo
gemini --approval-mode=auto_edit

# Debug mode
gemini -d
gemini --debug
```

### Headless/Non-Interactive Mode

**Critical for orchestration**: Gemini CLI supports full headless operation.

```bash
# Basic headless execution
gemini -p "Analyze this codebase and list all functions"

# With stdin piping
cat file.txt | gemini -p "Summarize this"
echo "Fix the bug in main.py" | gemini

# JSON output for parsing
gemini -p "List dependencies" --output-format json

# Streaming JSON for real-time monitoring
gemini -p "Long running task" --output-format stream-json
```

### Output Formats

**Text** (default): Human-readable response

**JSON**: Structured response

```json
{
  "response": "string",
  "stats": {
    "models": {},
    "tools": {},
    "files": {}
  },
  "error": {}
}
```

**Stream-JSON**: Newline-delimited events

```json
{"type": "init", ...}
{"type": "message", "content": "..."}
{"type": "tool_use", "name": "...", "input": {...}}
{"type": "tool_result", "output": "..."}
{"type": "result", "response": "..."}
```

### Interactive Commands

| Command              | Description            |
| -------------------- | ---------------------- |
| `/help`              | Show all commands      |
| `/chat`              | Start new conversation |
| `/bug`               | Report bug             |
| `/mcp`               | List MCP tools         |
| `/memory show`       | Display loaded context |
| `/memory refresh`    | Reload GEMINI.md files |
| `/memory add <text>` | Add to global memory   |

**Sources:**

- [CLI Reference](https://geminicli.com/docs/cli/)
- [Headless Mode](https://geminicli.com/docs/cli/headless/)

---

## 5. Integration Potential

### Subprocess Spawning

Gemini CLI is **fully compatible with subprocess orchestration**:

```bash
# Spawn as subprocess
gemini -p "Task description" --output-format json

# Pipe input
echo "instructions" | gemini -p "Execute these"

# Capture output
result=$(gemini -p "Generate code" --output-format json)

# With auto-approve for autonomous operation
gemini -p "Refactor this module" --yolo --output-format json
```

### Non-Interactive Batch Processing

```bash
#!/bin/bash
# Batch processing script
for file in src/*.ts; do
  result=$(gemini -p "Review this code: $(cat $file)" --output-format json)
  echo "$result" >> reviews.json
done
```

### Process Management

```bash
# Run with timeout
timeout 300 gemini -p "Complex task" --yolo

# Background execution
gemini -p "Long task" --output-format stream-json > output.json &

# Capture exit code
gemini -p "Task" --output-format json
if [ $? -eq 0 ]; then
  echo "Success"
fi
```

### YOLO Mode for Autonomous Operation

```bash
# Full auto-approve
gemini --yolo -p "Fix all linting errors in this project"

# With sandbox (default with yolo)
gemini --yolo -p "Refactor database module"

# Approval modes
gemini --approval-mode=auto_edit  # Auto-approve edits only
gemini --approval-mode=yolo       # Auto-approve all
```

### Sandbox Security

When using `--yolo`, sandbox is enabled by default:

```bash
# Uses Docker sandbox
gemini --yolo -p "Task"

# Custom sandbox via .gemini/sandbox.Dockerfile
# Isolates file system access to project directory
```

### Current Limitations

1. **No native subagent support**: Cannot spawn child agents internally
2. **Custom commands not available in headless**: `.toml` commands don't work non-interactively
3. **Shell tool issues**: `run_shell_command` may not be available in non-interactive mode

### Workarounds for Multi-Agent

Community-built orchestration patterns:

```bash
# File-system-as-state pattern
# Each agent writes to/reads from shared files

# Orchestrator spawns specialized agents
gemini -e coder-agent --yolo -p "Implement feature X"
gemini -e reviewer-agent --yolo -p "Review changes in /tmp/changes.diff"
```

**Sources:**

- [Headless Mode](https://geminicli.com/docs/cli/headless/)
- [Multi-Agent Discussion](https://github.com/google-gemini/gemini-cli/discussions/7637)
- [SubAgent Feature Request](https://github.com/google-gemini/gemini-cli/issues/3132)

---

## 6. Strengths for Capability Matching

### Where Gemini CLI Excels

| Capability             | Strength  | Details                              |
| ---------------------- | --------- | ------------------------------------ |
| **Long Context**       | Excellent | 1M tokens (vs Claude's ~200K)        |
| **Multimodal**         | Excellent | Native image, video, audio           |
| **Speed**              | Excellent | Flash models for rapid prototyping   |
| **Cost**               | Excellent | Generous free tier (1000 req/day)    |
| **Google Integration** | Excellent | Vertex AI, BigQuery, Cloud Functions |
| **MCP Support**        | Excellent | Full protocol implementation         |
| **Open Source**        | Excellent | Apache 2.0, community contributions  |

### Where Claude Code Excels

| Capability               | Strength  | Details                             |
| ------------------------ | --------- | ----------------------------------- |
| **Reasoning Quality**    | Excellent | Better for complex logic            |
| **Code Quality**         | Excellent | Fewer bugs, better structure        |
| **Token Efficiency**     | Good      | Auto-compaction                     |
| **Autonomous Execution** | Good      | More reliable without intervention  |
| **Privacy**              | Excellent | Direct API, no intermediate servers |

### Recommended Task Delegation

**Assign to Gemini CLI:**

- Large codebase analysis (leverage 1M context)
- Multimodal tasks (image/video/audio processing)
- Rapid prototyping and iteration
- Google Cloud integrations
- High-volume, parallelizable tasks
- Cost-sensitive bulk operations

**Assign to Claude Code:**

- Complex reasoning and architecture decisions
- Production code generation
- Security-critical implementations
- Tasks requiring careful planning
- Final code review and quality checks

### Hybrid Swarm Strategy

```
nexus-agents orchestrator
    |
    +-- Gemini CLI (research agent)
    |       - Analyze large codebases
    |       - Process documentation
    |       - Gather context
    |
    +-- Claude Code (implementation agent)
    |       - Write production code
    |       - Complex reasoning
    |       - Architecture decisions
    |
    +-- Gemini CLI (review agent)
            - Fast iteration reviews
            - Bulk file processing
            - Test generation
```

**Sources:**

- [Gemini CLI vs Claude Code Comparison](https://composio.dev/blog/gemini-cli-vs-claude-code-the-better-coding-agent)
- [Claude Code vs Gemini CLI Analysis](https://shipyard.build/blog/claude-code-vs-gemini-cli/)

---

## 7. Configuration Reference

### GEMINI.md Context Files

Hierarchical context system (similar to Claude's CLAUDE.md):

```
~/.gemini/GEMINI.md          # Global context
project/.gemini/GEMINI.md    # Project context (preferred)
project/GEMINI.md            # Project context (alternative)
project/subdir/GEMINI.md     # Subdirectory context
```

**Features:**

- Auto-loaded on startup
- Supports imports: `@path/to/file.md`
- Concatenated in order with separators

### settings.json Reference

```json
{
  "model": "gemini-2.5-pro",
  "approvalMode": "default",
  "sandbox": true,
  "security": {
    "folderTrust": {
      "enabled": true
    }
  },
  "mcp": {
    "allowed": ["github", "firebase"],
    "excluded": []
  },
  "mcpServers": {
    "serverName": {
      "command": "...",
      "args": [],
      "env": {},
      "timeout": 30000,
      "trust": false
    }
  },
  "context": {
    "fileName": "GEMINI.md",
    "includeDirectories": true
  }
}
```

### Environment Variables

| Variable                         | Purpose                   |
| -------------------------------- | ------------------------- |
| `GEMINI_API_KEY`                 | Gemini API authentication |
| `GOOGLE_API_KEY`                 | Google Cloud API key      |
| `GOOGLE_APPLICATION_CREDENTIALS` | Service account JSON path |
| `GOOGLE_CLOUD_PROJECT`           | GCP project ID            |
| `GOOGLE_GENAI_USE_VERTEXAI`      | Enable Vertex AI          |

---

## 8. Implementation Recommendations

### For nexus-agents Integration

1. **Subprocess Communication**

   ```typescript
   // Spawn Gemini CLI as subprocess
   const child = spawn('gemini', ['-p', task, '--output-format', 'stream-json', '--yolo']);

   // Parse streaming JSON events
   child.stdout.on('data', (data) => {
     const events = data.toString().split('\n').filter(Boolean);
     for (const event of events) {
       const parsed = JSON.parse(event);
       handleEvent(parsed);
     }
   });
   ```

2. **MCP Server Bridge**
   - Configure nexus-agents as MCP server for Gemini CLI
   - Enable bidirectional tool calling

3. **Context Sharing**
   - Use shared GEMINI.md files for project context
   - Pass context via stdin for task-specific instructions

4. **Authentication Strategy**
   - Use ADC for production deployments
   - Service accounts for CI/CD pipelines
   - API keys for development/testing

### Risk Mitigation

- **Rate Limits**: Monitor usage against free tier limits
- **Sandbox**: Always use sandbox with yolo mode
- **Trust**: Enable folder trust for security
- **Timeouts**: Set appropriate timeouts for long tasks

---

## Sources

- [Gemini CLI GitHub Repository](https://github.com/google-gemini/gemini-cli)
- [Official Documentation](https://geminicli.com/docs/)
- [Google Cloud Documentation](https://docs.cloud.google.com/gemini/docs/codeassist/gemini-cli)
- [MCP Server Integration](https://geminicli.com/docs/tools/mcp-server/)
- [Authentication Guide](https://github.com/google-gemini/gemini-cli/blob/main/docs/get-started/authentication.md)
- [Headless Mode](https://geminicli.com/docs/cli/headless/)
- [Gemini Models API](https://ai.google.dev/gemini-api/docs/models)
- [Multi-Agent Architecture Discussion](https://github.com/google-gemini/gemini-cli/discussions/7637)
- [Gemini CLI vs Claude Code Comparison](https://composio.dev/blog/gemini-cli-vs-claude-code-the-better-coding-agent)
- [Trusted Folders](https://geminicli.com/docs/cli/trusted-folders/)
- [Sandbox Documentation](https://geminicli.com/docs/cli/sandbox/)
- [GEMINI.md Context Files](https://geminicli.com/docs/cli/gemini-md/)

---

_Report generated: 2026-01-04 ET_
_Last verified: 2026-01-04_
