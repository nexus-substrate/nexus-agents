---
'nexus-agents': patch
---

The security-layer sanitizer strips every HTML comment rather than only keyword-bearing ones, matching the MCP-layer sanitizer, and raises the `hidden_content` flag when it does — the flag the reputation model already acts on but nothing produced.
