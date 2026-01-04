# @nexus-agents/agents

Agent framework with TechLead orchestration and specialized experts.

## Installation

```bash
npm install @nexus-agents/agents
```

## Usage

```typescript
import { TechLead, createExpert } from '@nexus-agents/agents';

const techLead = new TechLead(adapter);
const result = await techLead.execute({
  id: 'task-1',
  description: 'Review this code for security issues',
});
```

## License

MIT
