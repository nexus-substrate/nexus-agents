---
'nexus-agents': patch
---

An empty LLM synthesis answer is recorded as a failed tier-2 attempt and escalated to reimagine, then falls back with `synthesisSource: 'fallback'`; it was recorded as a tier-2 success labelled `'llm'` while returning the fallback concatenation (#5642).
