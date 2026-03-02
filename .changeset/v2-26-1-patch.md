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
- **Input validation**: Added `.max()` bounds to 6 remaining unbounded inputs — repo-security-plan categories, memory-write metadata, run-workflow inputs, delegate-to-model/consensus-vote output strings, scanner-registry language matrix (CWE-20) (#1348)
- **Silent catches**: Fixed 12 silent catch blocks across outcome-store-persistence, recording modules (#1341), CLI parsers, MCP tools, and swe-bench (#1343)
- **Unbounded collection**: Added MAX_OUTCOMES=10000 FIFO eviction to `ValidationDashboard.outcomes` (#1344)
- **Env schema gaps**: Added `NEXUS_AORCHESTRA_DISPATCH` and `NEXUS_WORKER_MAX_CALLS` to env-schema.ts (#1344)
- **Error message sanitization**: Added `sanitizeErrorMessage()` at SQLite INSERT point — truncates to 200 chars, redacts API key/token patterns (#1345)
- **Error message wiring**: `RecordOutcomeParams.errorMessage` now flows through to SQLite persistence (#1346)
- **Untyped catches**: Added `: unknown` to 16 catch bindings across outcome-storage, trace-writer, outcome-feedback, sandbox-executor, docker-sandbox-executor (#1350)
- **Silent catches**: Added debug/warn logging to 10 catch paths — docker-sandbox-helpers, correlation-persistence, strategy-distiller-persistence, outcome-storage query methods (#1350)
- **Fetch timeout**: Added 10s `AbortSignal.timeout` to models.dev API fetch call

### Features

- **Learning persistence default**: `NEXUS_PERSIST_LEARNING` now defaults to true — LinUCB routing data persists across sessions. Only routing metadata stored (no user prompts/keys/outputs). Opt out with `NEXUS_PERSIST_LEARNING=false` (#1345)
- **Audit logging default**: `config.security.audit.enabled` now defaults to true — SIEM-compatible JSON-L audit logs enabled out of the box. Bounded: 10 files × 10MB max. (#1347)
- **Audit hash-chain default**: `enableHashChain` now defaults to true — SHA-256 tamper-evident chain enabled at negligible cost. (#1350)
- **Routing memory default**: `routingMemory` and `strategyDistillation` now auto-enable when persistence is on — learned CLI performance and auto-extracted routing rules activate without explicit config. (#1347)
- **Async routing pipeline**: 5 fire-and-forget routing stages (confidence-cascade, capability-match, quality-constraint, resource-strategy, distilled-rules) now properly await results and capture scores into `PipelineResult.stageScores`. Pipeline converted from sync to async. (#1351)

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
  - MCP resources: 10 tests (research-resource, experts-resource, models-resource payload building, error handling, JSON structure) (#1349)
- Fixed 2 additional silent catch blocks in recording modules

### Documentation

- Fixed 5 documentation accuracy issues in README.md and ENTRYPOINTS.md
- Added 4 missing MCP tools to ENTRYPOINTS.md (now 24/24)
- Updated QUICK_START.md with Gemini/Codex MCP setup steps
