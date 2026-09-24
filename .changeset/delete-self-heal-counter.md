---
'nexus-agents': patch
---

Remove the unread would-have-self-healed counter from the adapter layer. It counted proactive temperature drops and param-naming 400s to gate a reactive self-heal spike (#4071), which closed as superseded, and nothing in production ever read the counts. The temperature-drop warning, the `dropped[]` metadata and the `MODEL_PARAMETER_UNSUPPORTED` error with its `param` context are unchanged. The removed functions were internal and not part of the public API.
