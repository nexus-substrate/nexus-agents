---
'nexus-agents': minor
---

A config file carrying `memory.session`, `memory.graph`, or `memory.typed` copied from the old documentation now fails validation and names the unknown key; previously, these keys loaded successfully and were silently ignored.
