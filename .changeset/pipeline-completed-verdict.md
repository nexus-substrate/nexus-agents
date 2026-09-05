---
'nexus-agents': minor
---

Fix dev-pipeline completion verdict to require all planned tasks to complete with status 'done' in addition to security gate passing, and expose `taskStatus` ('all_done' | 'partial' | 'none') (#5645).
