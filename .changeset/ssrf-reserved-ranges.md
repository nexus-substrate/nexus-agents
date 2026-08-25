---
'nexus-agents': patch
---

close six more SSRF gaps in the custom-API address tables

The IPv4 rule table listed the four blocks everyone remembers — 10/8,
172.16/12, 192.168/16, 169.254/16 — and treated everything else as public.
Verified against the real guard, all of these passed:

- `100.64.0.0/10`, RFC6598 shared address space. Used for cloud NAT and
  container fabrics, and `100.100.100.200` serves Alibaba Cloud instance
  metadata, so this is a credential read on those providers.
- `192.0.0.0/24`, which carries a legacy Oracle Cloud metadata endpoint at
  `192.0.0.192`.
- `198.18.0.0/15` benchmarking, `224.0.0.0/4` multicast, `240.0.0.0/4`
  reserved, and `255.255.255.255` broadcast — local-segment reachable rather
  than internet-routable.

Because the IPv6 classifier delegates to the IPv4 table, each was reachable in
mapped form too (`[::ffff:6464:64c8]`).

Three IPv6 gaps alongside them. Link-local was matched as the string prefix
`fe80:`, which is one 64th of `fe80::/10` — `febf::1` is equally link-local and
was allowed. Site-local `fec0::/10` had no rule at all. And 6to4 `2002::/16`
was the one IPv4-carrying prefix `embeddedIPv4` did not reach, despite its
doc-comment claiming it covered every one, because 6to4 puts the payload in
hextets 1–2 rather than 6–7.

Prefix classification now reads the parsed first hextet instead of testing
string prefixes, which is what made the `fe80:` gap possible.
