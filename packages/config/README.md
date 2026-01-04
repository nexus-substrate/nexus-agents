# @nexus-agents/config

Configuration loading and Zod validation for Nexus Agents.

## Installation

```bash
npm install @nexus-agents/config
```

## Usage

```typescript
import { loadConfig, NexusConfigSchema } from '@nexus-agents/config';

const config = await loadConfig('./nexus-agents.yaml');
```

## License

MIT
