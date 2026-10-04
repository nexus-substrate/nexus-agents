---
'nexus-agents': patch
---

Adapt internal outcome and tool-memory registry adapters to the JSON-only nexus-memory contract. Native Dates are explicitly serialized to ISO strings, unset object fields are omitted, and query results are independent JSON copies. Proxies are rejected before projection, and JSON-shaped objects and arrays exposing own or inherited `toJSON` properties fail validation. Unsupported native values and non-string keys fail with typed validation errors. The nexus-agents public API surface is unchanged.
