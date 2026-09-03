---
'nexus-agents': major
'nexus-memory': major
---

fix(memory)!: migrate off better-sqlite3 to node:sqlite — install scripts broke end users (#5388)

`better-sqlite3` was a **runtime** dependency of both published packages, and it
builds its native binding in an `install` lifecycle script. Where install scripts
are blocked, the failure took the worst available shape — reproduced, not
theorised:

```
$ npm install --ignore-scripts better-sqlite3@12.11.1
INSTALL_EXIT=0                      # SUCCEEDS
$ node -e "new (require('better-sqlite3'))(':memory:')"
Could not locate the bindings file. Tried: ...
```

A clean install and a broken CLI, with an error naming a bindings path rather
than the cause.

**`node:sqlite` removes the failure mode instead of handling it**: a builtin has
no install script and no native build to skip. After this change the runtime
dependency graph of `nexus-agents` contains **zero** packages with install
scripts.

## Why not just make it optional

That looks smaller and is not. `MobiMem`'s constructor is synchronous
(`mobimem.ts`) and is reached from `RoutingMemory.constructor`, so a lazy
`await import()` would have forced `async` outward through a synchronous
production entry point. `DatabaseSync` is synchronous _and_ builtin, so the
static import stays static and the constructor stays sync.

## Verified before committing, not assumed

The used API surface is only `prepare` / `exec` / `close` / `pragma`, plus
`run` / `get` / `all` and `.changes`. None of `iterate`, `pluck`, `raw`,
`columns`, `transaction`, `function`, `aggregate`, `backup` or `loadExtension`
appears anywhere, so the known `node:sqlite` gaps are all unreachable. WAL,
`{lastInsertRowid, changes}` shape, and `@`/`:` named parameters with bare-key
objects were each executed against Node 22.22.3 first.

`ISQLiteDatabase` already insulated ~30 helper signatures and ~12 test doubles,
so the engine swap did not ripple outward.

## Three defects this surfaced, each fixed at its seam

- **`close()` is not idempotent in `node:sqlite`.** better-sqlite3's is a no-op
  when already closed; `DatabaseSync` throws `database is not open`. Shutdown
  here is legitimately reentrant (`shutdownToolMemory` → `endSession` →
  `MobiMem.close`), which failed 16 tests immediately. Fixed once in the opener
  via `isOpen` rather than by adding a flag to each of ~9 callers, because the
  tree was written against better-sqlite3's contract.
- **tsup strips `node:` prefixes** (`removeNodeProtocol`, default true).
  Harmless for legacy builtins — bare `fs` still resolves — but **fatal** for
  `node:sqlite`, which Node exposes _only_ under the prefixed specifier. The
  stripped bundle built cleanly and died at import with
  `Cannot find package 'sqlite'`. Caught by importing the built dist, after an
  earlier comment in this very config asserted the opposite.
- **`nexus-memory` had no `@types/node`.** It inherited them transitively from
  `@types/better-sqlite3`; removing that broke typecheck in files the migration
  never touched. Now declared explicitly, which it always should have been.

## The gate that should have caught this

`scripts/verify-npm-install.sh` **already installed with `--ignore-scripts`** —
the exact broken condition — and passed anyway, because none of its six phases
touched a SQLite-backed path and Phase 5 explicitly tolerates a failing
`doctor`. Phase 7 now asserts SQLite is genuinely usable, and carries its own
guard: if `doctor` ever stops reporting SQLite availability, Phase 7 fails
rather than silently becoming unfalsifiable.

`checkSqlite` was kept rather than deleted for the same reason — it can still
fail honestly, on a runtime below 22.5.0.

## BREAKING

- **`engines` moves to `>=22.5.0`** in both packages. `node:sqlite` does not
  exist before 22.5.0, so shipping without this would trade one broken install
  for another.
- **`better-sqlite3` is no longer a dependency.** A consumer passing their own
  better-sqlite3 handle into a memory backend still works — `ISQLiteDatabase` is
  structural — but the package no longer installs it for you.
- `nexus-memory` exports `SqliteDatabase` / `SqliteStatement` / `SqliteRunResult`
  in place of the re-exported better-sqlite3 types.

`node:sqlite` is **experimental** on Node 22 and warns on first use. The CLI
filters that one warning by name and message (never the whole
`ExperimentalWarning` category, and never for library consumers). Coupling with
#5163 (Node 24 LTS) would retire the caveat.
