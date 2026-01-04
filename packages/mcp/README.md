# @nexus-agents/mcp

MCP server with orchestrate, create_expert, and run_workflow tools.

## Installation

```bash
npm install @nexus-agents/mcp
```

## Usage

```typescript
import { createMcpServer, startStdioServer } from '@nexus-agents/mcp';

const server = createMcpServer();
await startStdioServer(server);
```

## License

MIT
