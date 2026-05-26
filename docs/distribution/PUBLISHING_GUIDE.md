# Publishing nexus-agents to Registries & Directories

Step-by-step guide for listing nexus-agents on all major platforms.

## 1. Official MCP Registry (requires interactive login)

```bash
# Install mcp-publisher CLI
curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" | tar xz mcp-publisher && sudo mv mcp-publisher /usr/local/bin/

# Authenticate with GitHub
mcp-publisher login github
# Follow the browser prompt to authorize

# Publish (from packages/nexus-agents/)
cd packages/nexus-agents
mcp-publisher publish

# Verify
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.nexus-substrate/nexus-agents"
```

**Prerequisites:** npm package must be published first (`npm publish --access public`).

## 2. Claude Code Community Plugin (requires web form)

Visit: https://clau.de/plugin-directory-submission

Fill in:

- **Name:** nexus-agents
- **Repository:** https://github.com/nexus-substrate/nexus-agents
- **Description:** Intelligent orchestration platform for AI coding tools — routes tasks to the best model, learns from outcomes, and enforces quality through multi-model consensus. 41 MCP tools for agent management, research, memory, consensus voting, codebase intelligence, and a full dev pipeline.

The `.claude-plugin/plugin.json` is already in the repo root.

## 3. Smithery (requires API key)

```bash
# Get API key from https://smithery.ai
# Then publish:
npx smithery mcp publish "https://github.com/nexus-substrate/nexus-agents" -n nexus-agents
```

## 4. PulseMCP (web submission)

Visit: https://www.pulsemcp.com/use-cases/submit

Fill in the GitHub URL: https://github.com/nexus-substrate/nexus-agents

## 5. Glama (web submission)

Visit: https://glama.ai/mcp/servers and look for "Add Server" or submit option.

## 6. mcpservers.org (web form — wong2/awesome-mcp-servers uses this)

Visit: https://mcpservers.org/submit

Fill in:

- **Server Name:** nexus-agents
- **Short Description:** Intelligent orchestration platform that routes tasks to the best AI model using LinUCB bandits, validates through consensus voting, and learns from outcomes. 41 MCP tools, dev pipeline, 8 memory backends.
- **Link:** https://github.com/nexus-substrate/nexus-agents
- **Category:** Development
- **Contact Email:** williamzujkowski@gmail.com

## Already Submitted (automated)

| Platform                            | Status     | Link                       |
| ----------------------------------- | ---------- | -------------------------- |
| Cline MCP Marketplace               | Submitted  | cline/mcp-marketplace#1293 |
| mcp.so                              | Submitted  | chatmcp/mcpso#1 comment    |
| rohitg00/awesome-devops-mcp-servers | Submitted  | Issue #155                 |
| appcypher/awesome-mcp-servers       | PR pending |                            |
