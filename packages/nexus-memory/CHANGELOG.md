# nexus-memory

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
