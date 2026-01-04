# @nexus-agents/cli

CLI entry point for Nexus Agents MCP server.

## Installation

```bash
npm install -g @nexus-agents/cli
```

## Usage

```bash
# Start MCP server (for Claude Desktop integration)
nexus-agents
```

## Claude Desktop Integration

Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "nexus-agents": {
      "command": "nexus-agents",
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

## License

MIT
