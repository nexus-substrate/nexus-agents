---
'nexus-agents': patch
---

Fix the main belief-pollution path: `parseArxivXml` no longer falls back to feed-level XML when no `<entry>` is present ([#2719](https://github.com/williamzujkowski/nexus-agents/issues/2719)).

`extractEntryXml` used to return the full feed XML when the arXiv API response contained no `<entry>` tags (paper not found / API miss). The feed's outer `<title>` is something like `arXiv Query: search_query=&id_list=X&start=0&max_results=10` — which then got persisted as the paper's "title" and recorded as a belief-memory learning. `memory_query` audit found 1671 belief rows, a substantial fraction shaped like:

```
topic=routing, priority=P2 learned-pattern Added paper: arXiv Query: search_query=&amp;id_list=2602.03814&amp;...
```

— including HTML-encoded ampersands because XML entities weren't decoded.

`extractEntryXml` now returns `null` when no `<entry>` is found; `parseArxivXml` returns `null` instead of inventing data. `decodeXmlEntities` runs over the title + summary so persisted text is plain.

The other #2719 sub-findings (typed/mobimem backends 0 entries despite "available"; decay 100 runs / 0 evictions) are separate; they need a "where are the writers, do they fire" audit and aren't blocked by this fix.
