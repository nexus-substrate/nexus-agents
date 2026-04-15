---
'nexus-agents': patch
---

fix(pipeline): replace ReDoS-prone regex in pipeline task parser

`parseTasksFromResponse` in `pipeline/agent-executor.ts` used `/\[[\s\S]*\]/` to extract JSON arrays from LLM responses. This regex exhibits polynomial backtracking on pathological input (many leading `[` with no closing `]`) — flagged by CodeQL as `js/polynomial-redos`. Since LLM output is library-controlled input, this is a real DoS risk.

Replaced with index-based slicing (`indexOf` + `lastIndexOf`), which is O(n) regardless of input shape. Extracted as exported `extractJsonArray` helper with 7 regression tests including 100k-character pathological inputs that complete in <100ms.
