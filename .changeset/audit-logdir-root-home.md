---
'nexus-agents': patch
---

Audit logging no longer stops the MCP server from starting when it runs as root. With `security.audit.enabled: true`, `nexus-agents --mode=server` exited at startup with `SecurityError: logDir cannot be a system directory` whenever the audit directory was under `/root`, which is the default for root (the Docker default user): the audit dir resolves to `/root/.nexus-agents/audit`. An audit `logDir` inside the running user's own home directory is now accepted, including a home under `/root` or `/var`. `/etc`, `/usr`, `/bin`, `/sbin`, `/proc` and `/sys` are still refused even when the home is inside them. `/root` and `/var` are still refused outside the user's home, and a home of `/` grants nothing. Path-traversal checks are unchanged. A service data directory under `/var` that is not inside the user's home, for example `NEXUS_DATA_DIR=/var/lib/nexus`, is still refused; point `security.audit.logDir` at another path in that case.
