---
'nexus-agents': minor
---

OpenAI-compatible gateway (`NEXUS_OPENAI_COMPAT_URL`): support for gateways behind a corporate network. These apply to model discovery and every in-process gateway call.

- `NEXUS_OPENAI_COMPAT_AUTH_HEADER` names the header that carries the key, for example `api-key` for Azure-style gateways. `Authorization: Bearer` is then not sent. Unset keeps the bearer default.
- `NEXUS_OPENAI_COMPAT_EXTRA_HEADERS` adds static headers to every request, as `Name=value,Name2=value2`. The whole value is refused and warned if it contains a newline or other control character, an entry without `=`, an illegal or duplicate name, `Authorization`, or the auth header. Header values and the key are never logged.
- Gateway calls now go through `HTTPS_PROXY` (or `HTTP_PROXY` for an `http://` gateway) and honour `NO_PROXY`. Before, they went direct: on Node 22 the global `fetch` ignores these variables unless the process starts with `NODE_USE_ENV_PROXY=1`. `NODE_EXTRA_CA_CERTS` was checked and applies to gateway calls, including through the proxy.
- When the private-address guard refuses the gateway host, the startup warning now names `NEXUS_CUSTOM_API_ALLOW_PRIVATE=1` and says the gateway is not in use. Before, it was a generic probe-failure line.
- A gateway that was unreachable at startup, returned an error or listed no models is retried on the first vote or `pr_review` panel at least 60 s after the last attempt. Before, the process stayed on CLI subprocesses until restart. Retries happen only on such a call, never on a timer, and stop once the gateway is wired. A private-address refusal is not retried.
- `OpenAIAdapterConfig` gains optional `defaultHeaders` and `fetchOptions` fields.
- Adds `undici` (major 6, the version Node 22 bundles) as a dependency, for the proxy agent.
