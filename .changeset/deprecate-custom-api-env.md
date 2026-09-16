---
'nexus-agents': minor
---

`NEXUS_CUSTOM_API_BASE_URL` and `NEXUS_CUSTOM_API_KEY` are now deprecated aliases of `NEXUS_OPENAI_COMPAT_URL` and `NEXUS_OPENAI_COMPAT_KEY` (#4392 increment 3). Each resolves `new ?? old`, trimmed, empty meaning unset; both stay accepted by the env-schema and are dropped in the next major (#6291). `NEXUS_CUSTOM_MODEL` is not deprecated.

The aliases feed only the single-model `custom-openai` path (the `SdkAdapter` behind `createAutoAdapter`, the `api:custom-openai` arm under `NEXUS_BILLING_MODE=api`). They do not enable the gateway path — model discovery, in-process voter transport, the `api:<endpoint>` arm — which is reached through the new names only, so renaming is what opts an operator in. One startup warning names each deprecated variable in use, whether it is honoured or shadowed by its replacement, and the rename; never a value. `nexus-agents doctor` prints the same per variable as a warning (`allHealthy` unchanged), `validateNexusEnv` returns them in the new optional `deprecatedVars` field, and `nexus-agents setup --custom-api` now writes the new names.

Logging no longer carries gateway secrets on three paths: `opencode.json` parse failures log the error name only (Node 22's `JSON.parse` message quotes the file, so an unquoted key leaked), model-discovery failures redact the configured key from the gateway's error body (a 401 that echoes the bearer no longer reaches the probe-failed warning), and the gateway wiring, the `opencode.json` bridge and the `custom-openai` adapter selection log the gateway hostname instead of the full base URL (which can carry userinfo). Discovery error messages now name the host rather than the URL for the same reason.

New exports: `OPENAI_COMPAT_URL_ENV`, `OPENAI_COMPAT_KEY_ENV` and `DEPRECATED_GATEWAY_ENV_ALIASES` (`adapters/sdk/types`), the `DeprecatedVar` type and `EnvValidationResult.deprecatedVars?`, and `VoterTransportCheck.deprecatedEnv?`. `readOpencodeGateway` takes an optional logger.
