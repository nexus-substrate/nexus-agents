---
'nexus-agents': patch
---

Correct the arXiv citation for `KnnRoutingStage` (#2776). 7 sites cited arXiv:2507.05370, which is a general-relativity paper on Schwarzschild-de Sitter spacetimes — not KNN routing. The intended source is arXiv:2505.12601 — "Rethinking Predictive Modeling for LLM Routing: When Simple kNN Beats Complex Learned Routers" (May 2025) — which matches `KnnRoutingStage`'s actual implementation (cosine similarity over keyword vectors, K-nearest experience patterns, weighted by success rate).

Discovered during Phase 1 of the memory unification epic (#2766, #2767) when the survey agent fetched arXiv:2507.05370 to verify prior-art citations. Companion PR registers the correct paper in the research registry.

Pure documentation/citation fix; no behavior change.
