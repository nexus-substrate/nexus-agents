---
'nexus-agents': patch
---

Adapt internal outcome and tool-memory registry adapters to the JSON-only nexus-memory contract. Native Dates are explicitly serialized to ISO strings, unset object fields are omitted, and query results are independent JSON copies. Unsupported native values and non-string keys fail with typed validation errors. The nexus-agents public API surface is unchanged.
