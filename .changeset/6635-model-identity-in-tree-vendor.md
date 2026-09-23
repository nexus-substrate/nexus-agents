---
'nexus-agents': patch
---

Model identity: fall back to in-tree provider when modelId regex matches no vendor (#6635).

- In-tree aliases whose IDs do not contain vendor tokens (such as `codex-5.3`, `codex-5.2`, `codex-5.1-mini`, `opencode-default`) now resolve to their in-tree provider (`openai`, `anthropic`).
- Enables panel diversity calculations to classify CLI seats using in-tree aliases into their respective vendor families instead of marking them unclassified.
