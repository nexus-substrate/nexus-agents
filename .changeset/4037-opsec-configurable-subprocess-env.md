---
'nexus-agents': patch
---

Operator-configurable opsec: stop hardcoding organization-specific references in source

Two changes that move org-specific values out of the (public) source tree and into operator
config, so a deployment's sensitive references never ship in the repo:

- **`NEXUS_SUBPROCESS_EXTRA_ENV` ([#4037](https://github.com/nexus-substrate/nexus-agents/issues/4037)):**
  a comma/space-separated list of additional env-var _names_ to forward to spawned voter CLIs.
  Custom-gateway users whose auth key is neither `NEXUS_`-prefixed nor a known vendor key can
  now forward just that key (e.g. `NEXUS_SUBPROCESS_EXTRA_ENV=MY_GATEWAY_KEY`) and keep full
  cross-vendor key isolation — instead of reaching for `NEXUS_SUBPROCESS_ENV_ALLOWLIST=0`,
  which disables the #2865 allowlist entirely and re-leaks every key to every CLI.

- **`NEXUS_SENSITIVE_REFS`:** the auto-file issue scrubber (#3382) no longer hardcodes a
  specific org/gov reference term. The terms are now read from this operator-configured env
  var (comma/space-separated); unset ⇒ no scrubbing. **Action for operators who auto-file
  from a sensitive context:** set `NEXUS_SENSITIVE_REFS` to your org's terms, since the
  previous built-in default has been removed (a hardcoded denylist literal is itself a
  disclosure in a public repo).
