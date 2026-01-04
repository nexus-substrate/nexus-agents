# @nexus-agents/workflows

Workflow engine with YAML templates and parallel execution.

## Installation

```bash
npm install @nexus-agents/workflows
```

## Usage

```typescript
import { WorkflowEngine } from '@nexus-agents/workflows';

const engine = new WorkflowEngine();
const workflow = await engine.loadTemplate('./code-review.yaml');
const result = await engine.execute(workflow, { files: ['src/index.ts'] });
```

## License

MIT
