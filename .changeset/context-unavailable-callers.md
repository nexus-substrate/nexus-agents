---
'nexus-agents': patch
---

fix(observability): context-retrieval failures at execute_expert/orchestrate/CompositeRouter are observable WARNs (#3699)

Applies the #3180-adopted best-effort failure policy to the 3 remaining `getContextForTask` callers: a retrieval failure now logs a structured WARN (sanitized error + task category) and continues with empty context, instead of a swallowed debug line. No behavioral change to the best-effort contract — execution never blocks on a memory read failure. (These sites have no event-listener channel, so the structured warn is the observable; the graph boundary's `context_unavailable` event remains graph-specific.)
