---
'nexus-agents': patch
---

close two compounding SSRF bypasses in the custom-API host guard

**IPv4-mapped IPv6.** `isIPv6('::ffff:169.254.169.254')` is true and `isIPv4` is
false, so mapped addresses were dispatched to the IPv6 classifier, which knew
only `::1`, `fe80:` and `fc00::/7`. Every IPv4 rule — AWS IMDS, loopback,
RFC1918 — was unreachable in mapped form. The URL parser normalises the dotted
spelling to hex (`::ffff:a9fe:a9fe`), so the hex form is the one that actually
arrives and a dotted-only fix would still have missed every real request.

`classifyIPv6` now expands the literal and delegates any embedded IPv4 to the
IPv4 rules, covering IPv4-mapped, IPv4-translated, the NAT64 well-known prefix
`64:ff9b::/96`, and the deprecated IPv4-compatible form. The unspecified
address `::`, which routes to localhost, is also rejected.

**Mutual deference.** `assertCustomApiHostResolvesPublic` returned `ok` for any
IP literal, on the stated grounds that the sync guard had classified it at
construction. `discoverModels` never calls the sync guard — only this one — so
on that path each guard deferred to the other and neither ran. It now
classifies literals itself. That path matters because its base URL can come
from a file (`opencode.json`), not only from operator intent.

The two compound: a mapped IMDS literal passed both.
