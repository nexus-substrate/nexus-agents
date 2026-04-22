---
'nexus-agents': patch
---

**feat(setup): nexus-agents setup --custom-api — guided gateway configuration (#2124)**

Closes the last deferred child of epic #2119. The runtime adapter shipped in v2.55.0 (#2125) reads custom-openai config from env vars — this command now walks you through obtaining them:

```bash
nexus-agents setup --custom-api https://your-gateway.example.com/v1 \
  --custom-api-key $YOUR_KEY --custom-model claude-opus-4-5
```

Validates the URL through the same SSRF guard (blocks loopback, RFC 1918, AWS IMDS, IPv6 equivalents, non-http/https), probes `GET /models` with Bearer auth to confirm connectivity, and prints a POSIX shell fragment to paste into `~/.bashrc` / `~/.zshrc`. Non-interactive mode supported for CI.
