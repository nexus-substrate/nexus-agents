---
'nexus-memory': major
---

Memory backend keys must now be strings and values must be JSON data. Existing `IMemoryBackend<string, Value>` syntax remains, but both generics are constrained. Convert object/numeric keys explicitly, use JSON-shaped value types, serialize Dates to ISO strings, and omit undefined fields (or use null). Writes reject lossy values such as Date, Map, Set, non-finite numbers, negative zero, functions, symbols, bigint, cycles, sparse arrays, custom prototypes, accessors, and hidden properties with a `MemoryValidationError` identifying the offending path.

In-memory writes, reads, and queries now copy values; persist changes with an explicit write instead of mutating returned objects. SQLite reads and queries validate stored JSON and optional schemas, rejecting invalid rows with `MemoryReadError` identifying the domain and key. Repair or remove invalid legacy rows before reading them. Schema transformations are not applied to persisted or returned data.
