---
'nexus-agents': patch
'nexus-memory': patch
---

fix(memory): route mobimem + nexus-memory default DB through the `.nexus-agents` resolver + auto-create the data dir (#3995)

Two memory-subsystem stores bypassed the canonical `nexusDataPath` resolver by
re-implementing `~/.nexus-agents` inline (same class of defect as #3994):

- **MobiMem** (`context/mobimem.ts`): `defaultSharedDbPath()` now resolves via
  `nexusDataPath('memory', 'mobimem.db')`, gaining sandbox detection, the
  per-repo/cross-repo split, the homedir-unwritable fallback, and `.gitignore`
  auto-wiring instead of a hardcoded `NEXUS_DATA_DIR ?? $HOME/.nexus-agents`.
- **nexus-memory default DB**: nexus-agents now injects the canonical
  `nexusDataPath('memory', 'memory.db')` into the shared `MemoryRegistry`
  before first use (`ensureSharedMemoryRegistry()`), so the resolver — not
  nexus-memory's inline fallback — supplies the production path. nexus-memory
  stays dep-free: the path is resolved on the nexus-agents side and passed as a
  plain string; `resolveDefaultDbPath()` remains the dep-free fallback for
  `nexus-eval-*` reuse.

Also fixes a fresh-install regression: opening a SQLite store whose parent
directory does not exist threw `SQLITE_CANTOPEN`. A shared dep-free
`openSqliteDatabase()` helper now `mkdirSync(dirname, { recursive: true })`
before `new Database()` at every on-disk open site in nexus-memory (the
registry connection and the `SqliteBackend`); `:memory:` is unaffected.

`core/trace-exporter.ts` gains a code comment noting that if trace persistence
is ever wired into production, the path should come from
`nexusDataPath('traces', ...)` (currently test-only / param-driven — no
behavior change).
