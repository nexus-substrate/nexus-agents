---
'nexus-agents': patch
---

Add a DNS-resolve-time SSRF guard for the custom-openai gateway (#3426). A public
DNS name that resolves to a private/loopback/link-local/metadata IP is now rejected
before the first outbound request, closing the documented gap in the string-level
`classifyPrivateHost` check. Fail-open on transient DNS errors; bypassed by
`NEXUS_CUSTOM_API_ALLOW_PRIVATE=1`. Resolve-time only — a TOCTOU/DNS-rebinding
window remains pending a socket-layer `lookup` hook.
