---
'nexus-memory': major
---

Memory backend keys must now be strings and values must be JSON data. Existing `IMemoryBackend<string, Value>` syntax remains, but both generics are constrained. Convert object/numeric keys explicitly, use JSON-shaped value types, serialize Dates to ISO strings, and omit undefined fields (or use null). Writes reject lossy values such as Date, Map, Set, non-finite numbers, negative zero, functions, symbols, bigint, cycles, sparse arrays, custom prototypes, proxies, any own or inherited `toJSON` property, accessors, and hidden properties with a `MemoryValidationError` identifying the offending path.

Both backends validate and build a fresh plain JSON copy in a single descriptor walk, then deep-freeze it before schema validation. Stored values are immutable snapshots: only that frozen copy is stored or serialized, and schema callbacks cannot attach serialization hooks or mutate it through retained references. Reads and queries return fresh mutable copies; persist changes with an explicit write instead of mutating returned objects. SQLite reads and queries validate stored JSON and optional schemas, rejecting invalid rows with `MemoryReadError` identifying the domain and key. Repair or remove invalid legacy rows before reading them. Schema transformations are not applied to persisted or returned data.
