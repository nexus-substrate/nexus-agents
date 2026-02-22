# Skills Index

**Purpose:** Quick navigation for common tasks. Load this file first for context efficiency.

---

## Quick Task Navigation

### I want to...

| Task                     | Start Here                                                                   | Then Read                                                                          |
| ------------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Add a feature**        | [CONTRIBUTING.md](../CONTRIBUTING.md)                                        | [development/README.md](./development/README.md)                                   |
| **Fix a bug**            | [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)                                   | [guides/DEBUGGING_OBSERVABILITY.md](./guides/DEBUGGING_OBSERVABILITY.md)           |
| **Add an MCP tool**      | [development/TOOL_DEVELOPMENT.md](./development/TOOL_DEVELOPMENT.md)         | [architecture/MCP_PROTOCOL.md](./architecture/MCP_PROTOCOL.md)                     |
| **Add a CLI command**    | [development/CLI_DELEGATION_GUIDE.md](./development/CLI_DELEGATION_GUIDE.md) | [ENTRYPOINTS.md](./ENTRYPOINTS.md)                                                 |
| **Add a new agent**      | [development/AGENT_DEVELOPMENT.md](./development/AGENT_DEVELOPMENT.md)       | [architecture/AGENT_SYSTEM.md](./architecture/AGENT_SYSTEM.md)                     |
| **Add memory support**   | [development/MEMORY_DEVELOPMENT.md](./development/MEMORY_DEVELOPMENT.md)     | [architecture/MEMORY_SYSTEM.md](./architecture/MEMORY_SYSTEM.md)                   |
| **Create a workflow**    | [guides/WORKFLOW_TEMPLATES.md](./guides/WORKFLOW_TEMPLATES.md)               | Built-in templates in `src/workflows/templates/`                                   |
| **Understand routing**   | [architecture/ROUTING_SYSTEM.md](./architecture/ROUTING_SYSTEM.md)           | [architecture/CONTEXT_LOAD_BALANCING.md](./architecture/CONTEXT_LOAD_BALANCING.md) |
| **Understand consensus** | [architecture/CONSENSUS_PROTOCOLS.md](./architecture/CONSENSUS_PROTOCOLS.md) | [research/topics/consensus/](./research/topics/consensus/)                         |
| **Review security**      | [architecture/SECURITY.md](./architecture/SECURITY.md)                       | [SECURITY_AUDIT_2026-01-23.md](./SECURITY_AUDIT_2026-01-23.md)                     |
| **Make a release**       | [CHANGELOG.md](../CHANGELOG.md)                                              | [ALIGNMENT_ROADMAP.md](./ALIGNMENT_ROADMAP.md)                                     |
| **Set up MCP server**    | [guides/MCP_INTEGRATION.md](./guides/MCP_INTEGRATION.md)                     | [QUICK_START.md](../QUICK_START.md)                                                |

---

## Key Files by Category

### Entry Points

- **CLI binary:** `packages/nexus-agents/src/cli.ts`
- **Command dispatch:** `packages/nexus-agents/src/cli-commands.ts`
- **MCP server:** `packages/nexus-agents/src/cli-server.ts`
- **MCP tools:** `packages/nexus-agents/src/mcp/tools/index.ts`

### Core Systems

- **Agent system:** `packages/nexus-agents/src/agents/`
- **Memory system:** `packages/nexus-agents/src/memory/`
- **Routing system:** `packages/nexus-agents/src/routing/`
- **Consensus engine:** `packages/nexus-agents/src/consensus/`

### Configuration

- **Default config:** `nexus-agents.yaml`
- **Package.json:** `packages/nexus-agents/package.json`
- **TypeScript config:** `packages/nexus-agents/tsconfig.json`

### Tests

- **Test directory:** `packages/nexus-agents/test/`
- **Coverage reports:** `packages/nexus-agents/coverage/`

---

## Context Loading Strategy

### For Bug Fixes

1. Load: `TROUBLESHOOTING.md`
2. Load: Relevant architecture doc
3. Load: Source file
4. Load: Test file

### For New Features

1. Load: `CONTRIBUTING.md`
2. Load: Relevant development guide
3. Load: Interface spec
4. Load: Example implementation

### For Architecture Decisions

1. Load: `CLAUDE.md` (governance)
2. Load: `architecture/README.md`
3. Load: Relevant ADRs
4. Load: Research if applicable

### For Releases

1. Load: `CHANGELOG.md`
2. Load: `ALIGNMENT_ROADMAP.md`
3. Run: `pnpm build && pnpm test`
4. Run: `nexus-agents fitness-audit`

---

## Capability Quick Reference

**CLI Commands:** 25 total
**MCP Tools:** 8 total
**Workflow Templates:** 7 built-in

For full list: [reference/capabilities.md](./reference/capabilities.md)

---

## Common Commands

```bash
# Development
pnpm install && pnpm build && pnpm test

# Health check
nexus-agents doctor

# Run fitness audit
nexus-agents fitness-audit

# Generate docs index
npx tsx scripts/generate-repo-index.ts

# Generate llms.txt
npx tsx scripts/generate-docs.ts
```

---

_This index is for LLM context efficiency. Load it first, then load specific docs as needed._
