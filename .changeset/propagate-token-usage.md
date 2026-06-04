---
'nexus-agents': patch
---

Propagate adapter token usage through the expert bridge (#3396). `CliResponse.usage` was produced upstream (SDK adapters report `TokenUsage`; CLI adapters extract it best-effort) but silently dropped across `expert-bridge.ts`'s result-mapping hops, so `agent-executor` recorded `tokensUsed: 0`. Now `ExpertBridgeResult` carries an optional `tokensUsed` (total tokens, preferring the reported `totalTokens`, falling back to input+output, left undefined when no usage was reported), and the routing-experience metric records the real value instead of zero. This is the shared prerequisite for token-based budget enforcement (#3395), `model.called` attribution (#3387), and routing-time cost scoring (#3394).
