---
'nexus-agents': patch
---

fix(consensus): retry voter completion without responseFormat on tool-use 404

Restores the 2/7 voters (OpenRouter-backed devex/catfish) that failed every vote with `404 "No endpoints found that support tool use"`. Root cause: the vote request asks for native structured output via `responseFormat: json_schema`, which OpenRouter implements through provider tool-use — a provider without tool-use endpoints returns a hard 404 instead of ignoring the field, silently shrinking a 7-role panel to 5. The fix retries the completion once without `responseFormat` on that specific error (the existing prose-JSON parse path handles a response without it), keeping the panel at full strength. Generic errors are unaffected (no retry). Fixes #3497.
