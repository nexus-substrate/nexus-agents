---
'nexus-agents': patch
---

**`run_dev_pipeline`'s expert stage now finds a gateway that was down at startup.** The stage routes through a router built once per process. Before, a router built while the gateway was down kept its gateway-less arm set for the life of the process, and the stage never triggered re-discovery itself, so on a gateway-only host it stayed without the gateway's family models. Now each expert call triggers the same lazy re-discovery the other adapter paths use (at most one attempt per 60 s, bounded by the discovery request's timeout; a no-op with no gateway configured), and the router is rebuilt once after a late discovery lands. The router's arms are still plain adapters, not resilient-wrapped. With no gateway configured, behaviour is unchanged.
