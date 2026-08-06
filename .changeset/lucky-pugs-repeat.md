---
'nexus-agents': patch
---

fix(core): keep BoundedLRUCache bounded when the oldest key is `undefined`

`set()` decided whether to evict by testing `keys().next().value !== undefined`,
which conflates "the iterator is exhausted" with "the oldest key is literally
`undefined`". Since `undefined` is a legal `Map` key, a cache instantiated with a
key type admitting it (e.g. `BoundedLRUCache<string | undefined, V>`) silently
skipped the eviction and grew past its capacity. Eviction now branches on the
iterator's `done` flag instead. Closes #4319.
