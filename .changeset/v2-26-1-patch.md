---
'nexus-agents': patch
---

Bug fixes, test performance, and documentation accuracy improvements.

### Bug Fixes

- **run_workflow MCP tool**: Falls back to mock executor when no model adapter is configured, preventing construction-time crash (#1338)
- **Workflow input defaults**: `applyInputDefaults()` merges template definition defaults before execution, fixing "Input not found" errors for optional inputs with defaults (#1339)
- **Error context**: Improved error messages in 5 silent catch blocks (stdin-lifecycle, step-executor, sdk-adapter, orchestrate-aorchestra, github-provider) (#1336)
- **Research registry**: Added multi-agent-worker-dispatch topic to generator helpers (#1335)
- **CI security**: Pinned all GitHub Actions to commit SHAs (CWE-829)
- **Input validation**: Added `.max()` bounds to 6 unbounded string inputs in MCP tool Zod schemas (CWE-20) (#1341)
- **Silent catches**: Fixed 2 additional silent catch blocks in outcome-store-persistence and recording modules (#1341)

### Performance

- **Test suite**: Optimized 3 slowest test files — combined execution reduced 55% (8.1s to 3.6s) (#1337)
  - template-registry: 3104ms to 877ms (72% reduction via shared beforeAll)
  - rest-server: 2968ms to 700ms (76% reduction via shared Fastify instances)
  - tool-memory: Deduplicated 6 beforeEach/afterEach blocks, fixed mock methods

### Test Coverage

- **117 new unit tests** for previously untested modules (#1340, #1342)
  - repo-analyze.ts: 80 tests (normalizeRepoId, detectPackageManager, detectCiProvider, detectSecurityTooling, detectFramework, getLanguageRecommendations, identifyGaps, analyzeRepo)
  - scanner-registry-fetcher.ts: 9 tests (extractScannerEntries, extractLanguageMatrix, clearRegistryCache, getRegistryManifest)
  - recording modules: 17 tests (consensus-vote, create-expert, execute-expert recording)
  - consensus engine branches: 11 tests (closed-proposal voting, agent performance, proof_of_learning, LRU eviction, ISP-over-OW, fallback paths) (#1342)
- Fixed 2 additional silent catch blocks in recording modules

### Documentation

- Fixed 5 documentation accuracy issues in README.md and ENTRYPOINTS.md
- Added 4 missing MCP tools to ENTRYPOINTS.md (now 24/24)
- Updated QUICK_START.md with Gemini/Codex MCP setup steps
