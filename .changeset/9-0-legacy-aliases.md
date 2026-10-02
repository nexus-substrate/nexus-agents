---
'nexus-agents': major
---

Remove the legacy `SwarmObserver` and `createSwarmObserver` aliases from the orchestration observer module and its agents/observability barrel. Use `OrchestrationObserver` and `createOrchestrationObserver` instead:

```diff
- import { SwarmObserver, createSwarmObserver } from './agents/observability/index.js';
+ import { OrchestrationObserver, createOrchestrationObserver } from './agents/observability/index.js';
```

The separate interaction observer in `observability/swarm-observer` remains available, including the public `InteractionSwarmObserver` and `createInteractionSwarmObserver` exports.
