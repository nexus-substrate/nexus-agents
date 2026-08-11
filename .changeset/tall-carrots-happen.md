---
'nexus-agents': patch
---

Close 19 transitive dependency security alerts

All 19 open Dependabot alerts were transitive (`pnpm-lock.yaml`), resolved via `pnpm.overrides`:

- **undici 5.29.0 → 6.28.0** (10 alerts). Its only parent is `@ai-sdk/provider-utils`, which pins it. 5.x has no patch — every advisory lands first in 6.x. These are not the WebSocket-only issues they first appear to be: the set includes HTTP request/response smuggling, unbounded `Content-Encoding` decompression on the Node fetch path, keep-alive response-queue poisoning, and retry-interceptor desync — all on the ordinary fetch path.
- **postcss → 8.5.26**, **js-yaml → 3.15.1 / 4.3.1**, **svgo → 4.0.2**, **sharp → 0.35.3** (9 alerts).

Pinned undici to `>=6.28.0 <7` rather than an open range: an unbounded `>=6.28.0` floats to 8.x, three majors past what the advisories require.

Verified beyond the unit suite, which mocks the network and so cannot exercise undici at all: a probe reproduces `@ai-sdk/provider-utils`' exact usage — `require('undici')` resolved from its own module path, `new Agent({ connect: { lookup } })`, `fetch(url, { dispatcher })` — against a local server on the pinned version, and the website builds against the new `sharp`/`svgo`/`postcss`.
