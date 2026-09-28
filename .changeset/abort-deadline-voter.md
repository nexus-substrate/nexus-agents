---
'nexus-agents': patch
---

Signal an in-flight voter adapter to cancel when the overall consensus deadline wins its race, while recording the existing deadline error and preserving caller cancellation. Adapters that cannot cancel remote work still stop being awaited locally.
