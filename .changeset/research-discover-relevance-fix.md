---
'nexus-agents': patch
---

fix(research): relevance scoring no longer filters out all results for long topics (#3541)

`computeRelevanceScore` normalized by `keywords.length * 3` (requiring every keyword
in both title AND description), so long/compound topics drove every candidate below
the 0.3 threshold — `research_discover` returned nothing on the default path, breaking
the loop's research stage. Now scores by keyword **coverage** (`0.8·matched/keywords +
0.2·titleHits/keywords`, distinct keywords), preserving title-weighting while keeping
clearly-relevant items above threshold. (The separate arXiv-returns-0 sub-finding in
#3541 needs live-API investigation and is not addressed here.)
