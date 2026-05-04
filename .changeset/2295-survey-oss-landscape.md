---
'nexus-agents': minor
---

New MCP tool: `survey_oss_landscape` — transient OSS project search (#2295, child of #2293).

Returns a ranked list of GitHub repositories matching a free-text query, with license (SPDX), last-commit, star-count, language, and one-line description. **Does NOT persist** to the research registry — for one-off engineering decisions like "what tools exist in this space?" or "should we adopt cargo-nextest?". Use `research_add_source` if you want to add an entry to the registry.

SSRF-safe by construction: the user-supplied input is a search query string, not a URL. Outbound URL is constructed from a fixed base (`https://api.github.com/search/repositories`); an attacker cannot make us fetch arbitrary endpoints.

v1 is GitHub-only. Codeberg + GitLab providers can be added when there's demand. Authenticated calls (5000 req/hr) are used when `GITHUB_TOKEN` is available; otherwise falls back to the unauthenticated 60 req/hr quota.

Tool count: 34 → 35.
