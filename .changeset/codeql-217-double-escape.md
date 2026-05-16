---
'nexus-agents': patch
---

Fix CodeQL alert #217 (`js/double-escaping`) in `research-helpers-arxiv.ts`.

The pre-fix `decodeXmlEntities` chained `.replace(/&amp;/g, '&')` followed by `.replace(/&lt;/g, '<')`. Order-sensitive: input `&amp;lt;` (the XML encoding of literal `&lt;`) became `<` instead of `&lt;`. Replaced with a single-pass regex + entity map so each entity is decoded atomically.

Two regression tests pin both behaviors: `Paper &amp;lt;tag&amp;gt; Title` now decodes to `Paper &lt;tag&gt; Title` (one pass), and standard single-encoded input (`&amp; Co.`, `&quot;quoted&quot;`) still decodes correctly. Verified to fail on pre-fix logic.
