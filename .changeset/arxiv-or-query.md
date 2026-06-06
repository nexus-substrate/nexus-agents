---
'nexus-agents': patch
---

fix(research): arXiv discovery OR-joins topic terms + sorts by relevance (#3543)

`buildArxivUrl` AND-joined every topic term (`(ti:w1 OR abs:w1) AND (ti:w2 OR abs:w2) …`),
requiring all terms to co-occur in one paper — so multi-word topics returned 0 arXiv
results. Now OR-joins terms (any may match) and sorts `sortBy=relevance` (so the fetched
set is on-topic rather than merely recent); the coverage-based relevance filter (#3542)
refines downstream. Completes the research_discover repair started in #3542 (the #3543
arXiv sub-finding split from #3541).
