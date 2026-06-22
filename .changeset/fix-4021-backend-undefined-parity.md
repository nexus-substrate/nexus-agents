---
'nexus-memory': patch
---

Reject `write(key, undefined)` uniformly across backends (#4021)

`InMemoryBackend` and `SqliteBackend` diverged on `write(key, undefined)`: the in-memory backend stored a phantom row (a later `read` looked like a miss but `count`/`query` included it) while the SQLite backend threw a cryptic NOT NULL bind error. Both `validate()` methods now reject `undefined` up front (before the optional schema check) with a clear `MemoryValidationError` — `undefined` is the missing-key sentinel `read` returns; callers wanting an explicit absent value use `null`. The shared backend contract test now asserts uniform rejection. Found in the 2026-06-21 QA/security sweep.
