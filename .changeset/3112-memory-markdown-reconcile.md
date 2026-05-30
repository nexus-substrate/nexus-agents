---
'nexus-agents': patch
---

**fix(memory):** reconcile Markdown sidecars on prune/expire — no more orphaned-file disk growth (#3112).

Only the explicit `delete(key)` path removed a memory's `.md` sidecar; `prune`, `expireAll`, and auto-expire deleted SQLite rows but left the Markdown files behind. With `MemoryDecayManager` running prune on a timer, the markdown dir grew without bound. Added `MemoryMarkdownHelper.reconcile(liveKeys)` (forward-maps every live key to its filename and removes any `.md` not in that set) and call it from the backend's `prune`/`expireAll`, covering every row-deletion path uniformly. Best-effort, never throws. Found via a proactive audit.
