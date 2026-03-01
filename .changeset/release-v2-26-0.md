---
'nexus-agents': minor
---

## v2.26.0

### Features

- **MCP Tasks async execution** (#1298): `execute_expert` now uses MCP Tasks primitive for non-blocking background execution with progress heartbeats
- **MCP Prompt Templates & Resources** (#1286): 4 prompt templates and 3 resource URIs for enhanced MCP integration
- **Worker Dispatch Pipeline** (#1299, #1307, #1312-#1315, #1318-#1321): Multi-agent worker dispatch with prompt composition, wave execution, conflict detection, dependency-aware scheduling, adaptive wave sizing, and closed-loop learning
- **Closed-Loop Learning** (#1322): `recordRoutingOutcome()` feeds execution results back to LinUCB bandit for improved model routing
- **Observability** (#1326): Reliability filtering and wave failure logging for dispatch diagnostics
- **Code Quality Hardening** (#1290): 56 `any` eliminations, 130 catch blocks with proper logging

### Fixes

- **Rate-limit handling** (#1319, #1320): Stagger consensus votes with inter-agent delay, detect and surface rate-limit errors from subprocess adapters
- **Synthesis safety** (#1311, #1312, #1327): Sanitize worker outputs, cap synthesis input, guard against division-by-zero in prompt composition
- **Consensus vote no_quorum** (#1329): Return `no_quorum` status when all votes fail instead of misleading `rejected`
- **Expert timeout alignment** (#1330): Zod schema min now matches runtime floor (120s) — prevents client-side validation accepting values the server rejects
- **NaN guard** (#1331): Protect `approvalPercentage` in higher-order voting from NaN propagation
- **Unhandled promise catches** (#1331): Add `.catch()` handlers to fire-and-forget promises in composite router

### Documentation

- Updated README accuracy: correct tool count (24), workflow count (11), expert count (10), memory backend names
- Removed vestigial content and outdated references
