---
'nexus-agents': patch
---

Fix `nexus-agents setup --custom-api <url>` to configure the custom endpoint instead of silently running the normal setup wizard. Forward `--custom-api-key` and `--custom-model` to custom endpoint setup when supplied.
