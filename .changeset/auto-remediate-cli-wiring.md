---
'nexus-agents': patch
---

fix(cli): route `nexus-agents auto-remediate` + register its env vars (#3713)

`auto-remediate` was in the command catalog + dispatch table but missing from
`cli-types` CliCommand/VALID_COMMANDS, so `isValidCommand` returned false and the
CLI silently fell through to starting the MCP server — the command never ran
end-to-end. Adds it to the allowlist; registers NEXUS_AUTO_REMEDIATE,
NEXUS_POLICY_GATE_MODE, and NEXUS_MODELS_OVERLAY_PATH in env-schema (they warned
as "unknown"); and adds a catalog↔VALID_COMMANDS consistency test that catches
this whole class going forward. Found via live e2e validation.
