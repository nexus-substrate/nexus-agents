---
'nexus-agents': patch
---

Memory search no longer fails on queries containing `.`, `-`, `/`, `:` or other FTS5 operator characters. The hybrid and agentic backends (and the typed and adaptive backends that search through them) threw `fts5: syntax error` for any such query, so `memory_query` reported them as `errored` and a search for a version number or file name such as `8.104.8` or `foo.ts` silently fell back to the non-FTS backends. Each query term is now passed to FTS5 as a quoted string literal, so punctuation is matched as text and cannot alter the query. Terms are still combined with AND; bare `AND`/`OR`/`NOT`/`NEAR` and terms without a letter or digit are ignored, and a query with no usable terms returns no results instead of an error (#6731).
