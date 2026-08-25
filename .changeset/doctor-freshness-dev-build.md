---
'nexus-agents': patch
---

stop the install-freshness check reporting false drift from a source checkout

`VERSION` is `'dev'` when `__NEXUS_VERSION__` was not injected — i.e. the CLI is
running from source rather than a build. Comparing a real global version
against that string reported drift on every developer checkout:

```
✗ Global install is 4.18.1, this build is dev — the MCP server runs the global one.
```

There is no version to compare, so the check now reports `unknown` with that as
its reason. A check that cries wolf in the commonest context is one people
learn to skip past, which is the failure mode it exists to prevent.
