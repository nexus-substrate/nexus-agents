---
'nexus-agents': patch
---

Fix npm package README accuracy + guard it against drift

The npm-rendered package README (`packages/nexus-agents/README.md`) had drifted: "42 MCP tools" (now 46), an "80% test coverage" claim (actual thresholds 60%/50%), an expert table listing 10 of the 12 types, a dated `gemini-1.5-pro` example, and several `../../` cross-links that 404 on the npm package page (npm renders the README standalone). All corrected; cross-links are now absolute GitHub URLs. A new `npm-readme-tool-count` claim in the claims registry now guards the npm README's tool count via `claims:check`, so this drift can't recur silently (chosen over symlinking to the root README, whose repo-relative links would break on npm). Docs/metadata only — no code or API change. A patch release is cut so the corrected README reaches the npm package page.
