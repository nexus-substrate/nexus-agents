# nexus-memory

## 1.0.0

### Major Changes

- [#5389](https://github.com/nexus-substrate/nexus-agents/pull/5389) [`1d04dc2`](https://github.com/nexus-substrate/nexus-agents/commit/1d04dc255c0acd4fd48b3c4876becb2288909c95) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(memory)!: migrate off better-sqlite3 to node:sqlite — install scripts broke end users ([#5388](https://github.com/nexus-substrate/nexus-agents/issues/5388))

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
  [#5163](https://github.com/nexus-substrate/nexus-agents/issues/5163) (Node 24 LTS) would retire the caveat.

## 0.1.4

### Patch Changes

- [#4026](https://github.com/nexus-substrate/nexus-agents/pull/4026) [`7df6cd8`](https://github.com/nexus-substrate/nexus-agents/commit/7df6cd81b0d9dc142024cbdf005a6e6cb0f9798e) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Reject `write(key, undefined)` uniformly across backends ([#4021](https://github.com/nexus-substrate/nexus-agents/issues/4021))

  `InMemoryBackend` and `SqliteBackend` diverged on `write(key, undefined)`: the in-memory backend stored a phantom row (a later `read` looked like a miss but `count`/`query` included it) while the SQLite backend threw a cryptic NOT NULL bind error. Both `validate()` methods now reject `undefined` up front (before the optional schema check) with a clear `MemoryValidationError` — `undefined` is the missing-key sentinel `read` returns; callers wanting an explicit absent value use `null`. The shared backend contract test now asserts uniform rejection. Found in the 2026-06-21 QA/security sweep.

## 0.1.3

### Patch Changes

- [#3996](https://github.com/nexus-substrate/nexus-agents/pull/3996) [`a25efac`](https://github.com/nexus-substrate/nexus-agents/commit/a25efac233802c657cf539291cbf9056a84f1eba) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(memory): route mobimem + nexus-memory default DB through the `.nexus-agents` resolver + auto-create the data dir ([#3995](https://github.com/nexus-substrate/nexus-agents/issues/3995))

  Two memory-subsystem stores bypassed the canonical `nexusDataPath` resolver by
  re-implementing `~/.nexus-agents` inline (same class of defect as [#3994](https://github.com/nexus-substrate/nexus-agents/issues/3994)):

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

## 0.1.2

### Patch Changes

- [#2835](https://github.com/nexus-substrate/nexus-agents/pull/2835) [`86ccc72`](https://github.com/nexus-substrate/nexus-agents/commit/86ccc7299d3867aa92f995d6e8a349c33af43715) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **Addresses [#2832](https://github.com/nexus-substrate/nexus-agents/issues/2832) (part of epic [#2831](https://github.com/nexus-substrate/nexus-agents/issues/2831)).** chore(migrate): pre-transfer sweep for nexus-substrate org

  Updates CI workflows, package.json repository fields, MCP server identity (`mcpName` + `server.json`), CLI URLs, docs, and the TypeDoc config to reference the new `nexus-substrate` org. CI workflow owner refs use `${{ github.repository_owner }}` so they follow the repo wherever it lives.

  No behavior changes — this is metadata + string sweep ahead of `gh api -X POST repos/williamzujkowski/nexus-agents/transfer -f new_owner=nexus-substrate`. After transfer, npm trusted publishers for `nexus-agents` and `nexus-memory` need to be reconfigured on npmjs.com under the new repo path.

  Intentional keeps documented in the PR body ([#2835](https://github.com/nexus-substrate/nexus-agents/issues/2835)): personal maintainer @handle, contact email, GitHub Sponsors profile, website deploy URL, design-system refs, security-test fixtures, vulnerability-scanner-registry refs, non-migrating ECOSYSTEM.md links, CHANGELOG history, TypeDoc HTML output.

## 0.1.1

### Patch Changes

- [#2812](https://github.com/williamzujkowski/nexus-agents/pull/2812) [`c07a383`](https://github.com/williamzujkowski/nexus-agents/commit/c07a38373f7efcdd0f4d1315df17016433824d0a) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Remove `publishConfig.provenance: true` from the manifest. Manifest-level provenance enforcement blocked local bootstrap publishes because Sigstore signing requires an OIDC token (only available in CI/GitHub Actions). The `nexus-agents` Release workflow already sets `NPM_CONFIG_PROVENANCE: true` env-var, so Sigstore provenance attestation is preserved on every CI-driven publish — the manifest setting was redundant + harmful for the v0.1.0 bootstrap.

  Refs [#2807](https://github.com/williamzujkowski/nexus-agents/issues/2807).
