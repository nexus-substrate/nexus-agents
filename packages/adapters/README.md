# @nexus-agents/adapters

Model adapters for Claude, OpenAI, Gemini, and Ollama with streaming, retry, and rate limiting.

## Installation

```bash
npm install @nexus-agents/adapters
```

## Usage

```typescript
import { createAdapter } from '@nexus-agents/adapters';

const adapter = createAdapter({
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const result = await adapter.complete({
  messages: [{ role: 'user', content: 'Hello' }],
});
```

## License

MIT
