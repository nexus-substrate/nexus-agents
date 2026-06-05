---
name: documentation-management
description: |
  Operating manual for documentation work in nexus-agents.
  Use when updating docs, adding new docs, changing doc pipeline, or troubleshooting doc issues.
  Triggers on "update docs", "add documentation", "doc pipeline".
allowed-tools: Read, Edit, Write, Bash, Grep, Glob, Task
---

# Documentation Management Skill

<!-- CANONICAL SOURCE: docs/ops/docops-spec.md -->
<!-- DOCOPS MANIFEST CHECKSUM: [auto-updated by CI] -->
<!-- PIPELINE NOTE: generate-repo-index.ts outputs MD060-compliant tables (2026-02-03) -->
<!-- PIPELINE NOTE: inject-governance.ts table formatting normalized; generate-docs.ts + generate-docs-full.ts removed in #1619 (llms.txt outputs deprecated) -->
<!-- PIPELINE NOTE: docs-check.yml docs-coverage job set continue-on-error:true for non-blocking (2026-02-03) -->
<!-- PIPELINE NOTE: docs-check.yml docs-coverage handles empty CHANGED_SRC to avoid GITHUB_OUTPUT format errors (2026-02-04) -->
<!-- PIPELINE NOTE: inject-governance.ts extended with ancillary-count injection for AGENTS.md, .claude-plugin/*.json, PLUGIN_INSTALL.md (#1837, 2026-04-12) -->
<!-- PIPELINE NOTE: inject-governance.ts syncs plugin.json version + validates category/license/keywords (#1839, 2026-04-12) -->
<!-- PIPELINE NOTE: link-check.yml + verify-review.yml bumped actions/github-script v8 → v9 (ESM-only @actions/github; our scripts use injected `github`/`core` so unaffected) (#1848, 2026-04-15) -->
<!-- PIPELINE NOTE: website removed (2026-02-22) — sync-docs.ts, check-frontmatter.ts, deploy-docs.yml deleted -->
<!-- PIPELINE NOTE: generate-repo-index.ts extractMCPTools() switched from register regex to tools array parsing (2026-04-10) -->
<!-- PIPELINE NOTE: docops-spec.md tagged with "last validated 2026-04-19" banner per #2004 audit; no functional pipeline change -->
<!-- PIPELINE NOTE: outdated-docs banner pattern documented for use when content drift exists but no immediate refresh is scheduled (2026-04-19) -->
<!-- PIPELINE NOTE: docops-spec.md skill file reference updated from `.claude/skills/documentation-management.md` to `skills/documentation-management/SKILL.md` (#2014, 2026-04-19) -->
<!-- PIPELINE NOTE: TypeDoc Verification CI job (docs-check.yml) downgraded from blocking failure to warning annotation (#2027, 2026-04-19) — drift was creating merge-round-trip noise without providing actionable signal -->
<!-- PIPELINE NOTE: link-check.yml bumped actions/cache v5.0.4 → v5.0.5 (patch-level bump; no behavioral change) (#2087, 2026-04-20) -->
<!-- PIPELINE NOTE: docs-check.yml link-check job removed; it invoked markdown-link-check with `|| true` so all failures were swallowed. lychee in link-check.yml is now the single canonical link-validation path (#2101, 2026-04-21) -->
<!-- PIPELINE NOTE: docs-check.yml docs-content-drift job extended with MCP_TOOL_COUNT cross-check — fails CI when site-data.ts MCP_TOOL_COUNT, server.json tools[], server.json description prose, or README.md prose disagree with the authoritative count in src/mcp/tools/index.ts registerTools() (#2107, 2026-04-22) -->
<!-- PIPELINE NOTE: .claude/rules/ moved to .rules/ for harness neutrality (#2121, 2026-04-22). setup-rules.ts now writes to .rules/nexus-agents.md; detectProjectInfo accepts both paths during migration. CLAUDE.md pointers updated. -->
<!-- PIPELINE NOTE: generate-repo-index.ts now imports cli-command-catalog.ts as single source of truth for CLI commands (#2156, 2026-04-22). Adds drift check warning when dispatch-table entries disagree with the catalog, in either direction. No output-format change. -->
<!-- PIPELINE NOTE: inject-governance.ts TOOL_DESCRIPTIONS map filled in for query_task_state, run_dev_pipeline, run_pipeline (#2231, 2026-04-26) — those three tools were previously rendering as "{name} tool" placeholders in the CLAUDE.md auto-generated tool table. buildAncillaryProbes() also split into per-target helpers (buildAgentsMdProbes, buildMarketplaceProbes, buildPluginInstallProbes) to clear a max-lines-per-function lint violation; no behavior change. -->
<!-- PIPELINE NOTE: inject-governance.ts TOOL_DESCRIPTIONS extended for pr_review (#2233, 2026-04-26). pr_review tool exposed via MCP wraps consensus_vote infra to run multi-voter (architect/security/devex/catfish/scope_steward) review on a PR diff; auto-generated tool table now reflects 32 tools (was 31). Workflow .github/workflows/pr-review-experiment.yml is opt-in via the `pr-review-experiment` PR label and posts a review summary as a PR comment. -->
<!-- PIPELINE NOTE: inject-governance.ts now also writes the README.md MCP tools table between `<!-- GOVERNANCE:README_TOOLS:START -->` / `<!-- GOVERNANCE:README_TOOLS:END -->` markers (#2269, 2026-04-27). Adds a second description map (`README_TOOL_DESCRIPTIONS`) for short, scannable entries (the README audience differs from CLAUDE.md), with fallback + warning when a new tool is missing a short variant. Soft-skips when README has no markers so the script remains drop-in compatible. `checkGovernance()` extended to fail when README markers exist but the table is stale; closes the recurring drift that needed three manual sync PRs in a month (#2217 / #2264 / #2268). -->
<!-- PIPELINE NOTE: inject-governance.ts TOOL_DESCRIPTIONS + README_TOOL_DESCRIPTIONS extended for verify_audit_chain (#2281 follow-up, 2026-04-28). 33rd MCP tool — wraps verifyChain() over a persisted FileAuditStorage log directory; reads audit-*.jsonl files, runs chain verification, returns hash_mismatch/previous_hash_mismatch/missing_hash signals if any. Auto-generated tool table now reflects 33 tools (was 32). Surfaced a clean shakedown of the v2.57.0 doc-gate pipeline — every drift check fired correctly. -->
<!-- PIPELINE NOTE: inject-governance.ts TOOL_DESCRIPTIONS + README_TOOL_DESCRIPTIONS extended for supply_chain_tradeoff_panel (#2294, child of #2293, 2026-04-30). 34th MCP tool — wraps consensus_vote infra with a structured per-axis tradeoff schema (default axes: build_time_determinism / supply_chain_risk / update_cadence). Voters answer EACH axis independently in a single round so legitimate tradeoffs aren't masked by a single approve/reject. Auto-generated tool table now reflects 34 tools (was 33). Also bumped MCP_TOOL_COUNT in website/src/data/site-data.ts and the tools[] array + description prose in packages/nexus-agents/server.json — those four lock-step counters fail docs-content-drift CI if drifted (#2107). -->
<!-- PIPELINE NOTE: inject-governance.ts now generates the CLAUDE.md "Workflows (via Skills)" table from skills/index.yaml between new GOVERNANCE:WORKFLOW_INDEX markers (#2317, child of #2320, 2026-05-02). Eliminates the previously-hand-maintained table that had drifted to omit `dev-pipeline` and `security-advisory-response`. Also added `checkCanonicalPaths()` so `scripts/inject-governance.ts check` validates every row of the (curated, not generated) CLAUDE.md "Canonical Paths" table resolves on disk; rows that no longer point at a real file fail CI. Bare `src/...` paths replaced with full `packages/nexus-agents/src/...` paths so the table actually navigates from repo root. The injectGovernance() function was refactored into `loadAllRegistries()` + `applyAllSectionInjections()` + small helpers (`injectWorkflowIndex`, `applyInlineCountRewrites`) to satisfy max-lines-per-function. -->
<!-- PIPELINE NOTE: inject-governance.ts now also auto-syncs packages/nexus-agents/server.json (#2326, child of #2327, 2026-05-02). syncServerJson() updates the top-level version, every packages[*].version, and the "N MCP tools" count in description; checkServerJson() fails governance:check on any drift. server.json was 10 minor versions behind (2.53.0 vs 2.63.1) before this sync. The changeset:version script already invokes pnpm governance:inject, so the sync runs automatically every release — no extra wiring needed. Same audit also removed hardcoded counts from packages/nexus-agents/README.md and llms-install.md (those now reference docs/ENTRYPOINTS.md as the canonical list) and replaced root CHANGELOG.md with a one-line redirect to the changesets-managed packages/nexus-agents/CHANGELOG.md. -->
<!-- PIPELINE NOTE: inject-governance.ts TOOL_DESCRIPTIONS + README_TOOL_DESCRIPTIONS extended for survey_oss_landscape (#2295, child of #2293, 2026-05-04). 35th MCP tool — transient OSS project search returning a ranked list of GitHub repos (license/SPDX, last-commit, stars, language, description). Differs from research_discover by NOT persisting to the registry; SSRF-safe by construction (user supplies a search query string, not a URL; outbound URL built from a fixed api.github.com base). Auto-generated tool table now reflects 35 tools (was 34). Also updated docs/design/components.md hardcoded counts (3 places: MCP module description, capability-gap-detector reference, tool-registration line). -->
<!-- PIPELINE NOTE: inject-governance.ts now auto-syncs the MCP tool count across ALL ancillary surfaces (#2358 follow-up, 2026-05-04). syncServerJson() now writes tools[] (was: version + description count only). New syncWebsiteToolCount writes MCP_TOOL_COUNT in website/src/data/site-data.ts. New syncDesignDocsToolCount writes 3 mentions in docs/design/components.md. New syncReadmeToolCount writes 2 mentions in README.md (arch diagram + capabilities table). Adding survey_oss_landscape required manual edits in 7 surfaces; the next tool addition will only require an inject run. Test files (tool-annotations.test.ts, index.test.ts, cli-server-tools.test.ts) keep their hardcoded counts intentionally — they're contract gates that caught the drift in #2358 and shouldn't become tautologies. -->
<!-- PIPELINE NOTE: extractMcpTools() in inject-governance.ts (and the same parsers in generate-docs-content.ts + generate-repo-index.ts + .github/workflows/docs-check.yml) now match `REGISTERED_TOOL_NAMES = [...]` first, falling back to the legacy `tools: [...]` shape (#2296 follow-up, 2026-05-04). The registerTools() function in mcp/tools/index.ts exceeded the 50-line max-lines-per-function gate when vendor_publishing_audit was added; the tool list was hoisted to a module-level REGISTERED_TOOL_NAMES const. All count-extracting parsers had to learn the new shape. Also vendor_publishing_audit (#2296, 36th MCP tool) shipped as a static lookup against vendor-publishing-seed.ts — v1 covers ubuntu/debian/fedora; alpine/arch/opensuse can land as data-only PRs. -->
<!-- PIPELINE NOTE: inject-governance.ts TOOL_DESCRIPTIONS + README_TOOL_DESCRIPTIONS extended for compare_data_feeds (#2297, child of #2293, 2026-05-04). 37th MCP tool — diffs two YAML/JSON feeds along coverage and per-field axes, given file paths and a key path (e.g. "id"). Output: which entries exist only in A, only in B, in both, plus optional field-level diffs across matched entries. v1 takes file paths only (no URL fetch — that needs a separate SSRF design pass; users curl the remote feed to a local file and pass the path). Closes the #2293 epic on engineering-decision tooling. Auto-generated tool table now reflects 37 tools. -->
<!-- PIPELINE NOTE: inject-governance.ts TOOL_DESCRIPTIONS + README_TOOL_DESCRIPTIONS extended for improvement_review (#2402 PR 2, 2026-05-05). 38th MCP tool — periodic threshold-gated observability-driven improvement loop. Reads OutcomeStore + fitness-audit; surfaces signals when CLI success < 60% with ≥ minSampleSize, single failure-category > 50% (n ≥ 10), fitness < floor (default 90), or critical findings present. fileIssues=false default → returns signals only; true → files candidate GitHub issues via gh CLI (rate-limited 5/run, dedup via embedded signal-key + literal-phrase search). execFile (no shell) on both create + dedup query — untrusted errorMessage from outcomes never reaches a shell parser. Replaces the deleted self-development engine (PR #2403, −7,700 LOC). Auto-generated tool table now reflects 38 tools. -->
<!-- PIPELINE NOTE: .github/workflows/docs-check.yml extended with new "Registry-Coverage Check" job (#2406, 2026-05-07). Implements the gate from design #2405 / PR #2418. Runs scripts/check-registry-coverage.ts on every PR to enforce wiring-completeness for behavioral registries declared in docs/ops/registry-coverage-manifest.json. Hard-fail mode in v1 (no escape hatch) — if a registry change genuinely doesn't need a peer-file update, the manifest is wrong; fix it in the same PR. Catches the class of bug from #2347 / #2344 / #2358 / #2315 (registry entry added but peer files miss the update). 3 seed registries: DEFAULT_EXPERTS, REGISTERED_TOOL_NAMES, NEXUS_ENV_VARS. -->
<!-- PIPELINE NOTE: .github/workflows/docs-check.yml extended with new "Schema-Fan-Out Check" job (#2408, 2026-05-07). Implements the gate from design #2407 / PR #2419. Runs scripts/check-schema-fanout.ts on every PR — warn-only in v1 (observability before enforcement, mirrors improvement_review pattern). When a tracked schema's source file changes in a way that touches the schema's marker, at least one consumer test file MUST also change in the same PR. Catches the cascade from #2253→#2254→#2255 (schema changes shipped without consumer-test updates). 3 bootstrap schemas: PrReviewInputSchema, TaskOutcomeSchema, ImprovementReviewInputSchema. Promote to --strict (hard fail) once false-positive rate is acceptable. -->
<!-- PIPELINE NOTE: .github/workflows/docs-check.yml extended with new "Orphan Detection" job (#2410, 2026-05-07). Implements design #2409 / PR #2420. Wraps knip (added as devDependency) with allowlist filtering at docs/ops/orphan-allowlist.json. Audit-only in v1 — never fails CI; surfaces orphan files for visibility. Counterfactual: would have caught the dead self-development engine (#2402, deleted ~7,700 LOC) at week 1 of orphan status instead of week 6. v2 = orphan count contributes to fitness score. v3 = fitness floor + threshold gates CI. Promotion gated on dry-run review. -->
<!-- PIPELINE NOTE: inject-governance.ts compacted the CLAUDE.md auto-generated tables to reduce context tax (PR #2555, 2026-05-10). generateToolIndex() now emits README_TOOL_DESCRIPTIONS (short clauses) in CLAUDE.md instead of the long TOOL_DESCRIPTIONS — full schemas live in docs/ENTRYPOINTS.md and the MCP tool definitions. generateWorkflowIndex() drops the trigger-keywords column (those live in each SKILL.md frontmatter; the harness routes from there). Same PR shrunk CLAUDE.md ~35% (591 → 409 lines) via .rules-pointer collapses for sections that auto-load anyway, and extracted the autonomous-loop ruleset to .rules/autonomous.md. New rule "Track All Work — Deferring is Fine; Untracked is Not" added to CLAUDE.md + AGENTS.md after epic #2540 shipped with 5 deferred follow-ups that lived only in memory until manually surfaced — issues #2546-#2550 now track them. -->
<!-- PIPELINE NOTE: inject-governance.ts version stamp is now deterministic (#2571, PR #2573, 2026-05-11). generateVersionSection() derives the date from the latest commit-date across canonical source files (TOOLS_INDEX + EXPERT_CONFIG + TEMPLATE_TYPES + SKILLS_INDEX + MODEL_CAPS) instead of new Date(). Eliminates the daily drift that turned every open PR red at midnight UTC when on-disk stamp diverged from CI's run. Falls back to today's ET date when git history is unavailable (shallow CI, fresh clone). docs-check.yml's governance-drift job now uses fetch-depth: 0 so the script has the history it needs. The release-validate-helpers staleness check at src/cli/release-validate-helpers.ts:222 still works — same regex, same format. -->
<!-- PIPELINE NOTE: inject-governance.ts MODEL_CAPS path updated from model-capabilities.ts → in-tree-data.ts (#2546 slice E, 2026-05-12). The legacy model-capabilities.ts file was deleted as the finale of the #2546 epic; data renamed to in-tree-data.ts, all helpers moved to registry-backed equivalents in model-config-helpers.ts. The injector's extractModels() still parses the same DEFAULT_MODEL_CAPABILITIES.models array shape; only the source path changed. CLAUDE.md canonical-paths row + prose paragraph + Source Code reference list also updated. -->
<!-- PIPELINE NOTE: inject-governance.ts wave-2 CLAUDE.md compaction (PR #2627, 2026-05-12). generateToolIndex() now emits a names-only comma-separated list in CLAUDE.md (no per-row descriptions); generateWorkflowIndex() does the same for skills. Full schemas live in docs/ENTRYPOINTS.md (tools) and each skills/<name>/SKILL.md (skills). generateReadmeToolTable() is untouched — README still gets the long form. Same PR moved "Track All Work" → .rules/track-deferred-work.md and "Development Disciplines" → .rules/development-disciplines.md (both auto-load), trimmed the Untrusted Input Policy invariants (canonical in .rules/untrusted-input.md), and consolidated the Canonical Paths prose around the still-CI-validated 13-row table. Net: CLAUDE.md 409 → 306 lines (-25%, -41% bytes). Test assertion updated: `'| Tool'` table-header check replaced with `'MCP tools registered'` + `'docs/ENTRYPOINTS.md'` to match the new lead-in. -->
<!-- PIPELINE NOTE: inject-governance.ts checkAdapterPrecedenceDocs validator added (#2655 PR #2668, Epic C, 2026-05-14). New `check:adapter-precedence-docs` CI gate verifies docs/guides/RULE_PRECEDENCE.md exists and contains `## Claude Code` / `## Codex CLI` / `## Gemini CLI` / `## OpenCode` section headers — exact-line match (Set of split lines), not substring, so corruption like `## OpenCodeXXX` still trips the gate. The doc itself (~250 lines) documents each adapter's rule-loading precedence model so operators on non-Claude harnesses don't silently miss rules. docs/README.md gains the new guide in the Guides table; AGENTS.md adds a one-paragraph cross-reference. -->
<!-- PIPELINE NOTE: inject-governance.ts checkRuleFrontmatter validator added (#2656 PR #2669, Epic C, 2026-05-14). New `check:rule-frontmatter` CI gate verifies every .rules/*.md has YAML frontmatter with `paths:` and `description:` fields between two `---` delimiters. 16 rule files updated: 4 had partial frontmatter (paths only) and got description added + normalized to list form; 12 had none and got both fields. Always-apply rules use `paths: ['**/*']`; topic-specific rules narrow (docs-rubric → md, test-secrets → test files). Prerequisite for the per-adapter rule-loader integration tracked separately as follow-up. -->
<!-- PIPELINE NOTE: inject-governance.ts checkToolAnnotations validator added (#2648 PR #2670, Epic A, 2026-05-14). New `check:tool-annotations` CI gate verifies every registered MCP tool has an entry in src/mcp/tool-annotations.ts TOOL_ANNOTATIONS map. Parses the map's top-level keys from disk and cross-references against extractMcpTools() — reports both missing entries (tool registered without annotations) AND stale entries (annotations defined for unregistered tool). All 38 tools now declare readOnlyHint/destructiveHint/idempotentHint/openWorldHint via `annotations: getToolAnnotations(name)` in their server.registerTool() calls. Three registration functions tipped past the 50-line cap (memory_write, research_add_source, research_discover) and got targeted eslint-disable-next-line. Taxonomy table added to docs/architecture/MCP_PROTOCOL.md. -->
<!-- PIPELINE NOTE: inject-governance.ts checkMcpErrorEnvelope validator added (#2649 final PR, Epic A, 2026-05-14). New `check:mcp-error-envelope` CI gate scans src/mcp/tools/**/*.ts (excluding tool-result.ts + tests) for raw `{ isError: true }` literals — after the #2649 migration every error return must go through `toolStructuredError` (or `toolError`, its back-compat alias). Match pattern is anchored to start-of-line or `{`/`,` so JSDoc prose mentions of `isError: true` don't trip it. The structured envelope (errorCategory + isRetryable + message + detail?) lives in src/mcp/error-envelope.ts; all 38 tools + secure-handler.ts + tool-error-handler.ts + middleware-chain.ts migrated across 5 PRs (#2671 helper, #2672 orchestration, #2673 research, #2674 voting, this final PR). -->
<!-- PIPELINE NOTE: inject-governance.ts checkToolDistinctness validator added + TOOL_DESCRIPTIONS extracted to scripts/tool-descriptions-data.ts (#2650, Epic A, 2026-05-14). The two curated description maps (TOOL_DESCRIPTIONS + README_TOOL_DESCRIPTIONS) moved to scripts/tool-descriptions-data.ts so the new check-tool-distinctness.ts lint imports the same corpus inject-governance renders into the CLAUDE.md/README tables (inject-governance.ts runs a CLI dispatch at module top level, so it cannot be imported). New `check:tool-distinctness` CI gate: scripts/check-tool-distinctness.ts computes pairwise TF-IDF + cosine similarity across the 38 tool descriptions, baseline-aware (docs/ops/tool-distinctness-baseline.json, mirrors orphan-allowlist pattern) — fails on a NEW pair >= threshold (0.23) or a baseline pair grown past tolerance (0.03). v1 report at docs/research/mcp-tool-distinctness-v1.md. Regenerate: `npx tsx scripts/check-tool-distinctness.ts baseline <threshold>` then `... report`. -->
<!-- PIPELINE NOTE: inject-governance.ts checkToolPrerequisites validator added (#2652, Epic B, 2026-05-14). New `check:tool-prerequisites` CI gate: every non-read-only MCP tool (annotation block lacking `readOnlyHint: true`) must appear in either TOOL_PREREQUISITES or NO_PREREQUISITE in src/mcp/middleware/tool-prerequisites.ts — so a newly added sensitive tool can't ship ungated by omission. The gate text-parses tool-annotations.ts (non-read-only set) + tool-prerequisites.ts (covered set) and diffs. Prerequisites are call-time WORLD-STATE predicates (gh-cli-available, data-dir-writable), not session-ordering; `withPrerequisite()` wrapper blocks with a `permission` error envelope carrying failedPrerequisite + remediation. Graph documented in .rules/tool-prerequisites.md. -->
<!-- PIPELINE NOTE: inject-governance.ts checkToolOutputConsistency validator added (#2653, Epic B, 2026-05-14). #2653 was reframed: codebase research refuted its premise (no timestamp/status/pagination heterogeneity exists across the 38 tools), so instead of a runtime PostToolUse normalization layer it ships a PREVENTIVE lint. New `check:tool-output-consistency` CI gate: scripts/check-tool-output-consistency.ts scans each src/mcp/tools/*.ts file's OUTPUT surface (outputSchema blocks + `*Response` types, tracked by brace depth — internal cache types are NOT flagged) for a timestamp-named field (`*At`/`*Date`/`timestamp`) typed as a bare `number`/`z.number()`. `.rules/hooks.md` documents the hook-vs-voter-rule-vs-prompt-rule layering decision + when a runtime normalization boundary WOULD be justified (the gateway proxying untrusted external MCP servers). -->
<!-- PIPELINE NOTE: inject-governance.ts now generates the AGENTS.md "Rules index" table from .rules/*.md frontmatter (#2657, Epic C, 2026-05-14). Closes the epic — #2655 (RULE_PRECEDENCE.md) + #2656 (paths:/description: frontmatter + checkRuleFrontmatter gate) had shipped, but the epic's "loader respects the frontmatter" criterion was unmet: no harness reads `paths:` natively and nexus-agents owns no runtime rule loader. A consensus vote (approved 85.7%) reframed it to the achievable equivalent. New extractRules()/generateRulesIndex()/injectAgentsRulesIndex() scan .rules/*.md and regenerate the AGENTS.md table between GOVERNANCE:RULES_INDEX markers, consuming BOTH `paths:` (rendered as the "Applies to" column — not dead metadata) and `description:` ("When to read"). Fixed-width columns keep it prettier-stable/idempotent. New checkRulesIndex() joins checkGovernance() — CI fails on drift. Replaces the hand-maintained 13-row table that had drifted to omit 6 of 19 rules; RULE_PRECEDENCE.md corrected (it had overclaimed "after #2656 every adapter glob-auto-loads", which never shipped). -->
<!-- PIPELINE NOTE: docs-check.yml TypeDoc job + npm-verify.yml verify-tarball job now build nexus-memory before nexus-agents (#2766 Phase 5+, 2026-05-16). The new nexus-memory workspace package is a build-time dep of nexus-agents (bundled by tsup into nexus-agents/dist); its dist/index.d.ts must exist when tsup's DTS step resolves `import { ... } from 'nexus-memory'`. Workflows prepend `pnpm --filter nexus-memory build` before the package-of-interest build. verify-tarball also switched from `npm pack` to `pnpm pack` because npm doesn't rewrite `workspace:*` deps and the resulting tarball was failing the smoke-install. -->
<!-- PIPELINE NOTE: inject-governance.ts checkMemoryContract validator added (#2774, #2766 Phase 8, 2026-05-16). New `check:memory-contract` CI gate: scripts/check-memory-contract.ts scans packages/nexus-agents/src/**/*.ts for direct memory access bypassing the unified MemoryRegistry contract (new Database, new MobiMem, outcomes.jsonl path refs). Baseline-aware (docs/ops/memory-contract-baseline.json, mirrors orphan-allowlist + tool-distinctness-baseline pattern) — fails CI on a new offender not in the baseline. Comments and tests excluded. Regenerate the baseline with `npx tsx scripts/check-memory-contract.ts baseline` if direct access is intentional and justified. -->
<!-- PIPELINE NOTE: docs-check.yml gains "Harness Alignment Drift" job (#2805 Phase 5, 2026-05-16). Runs scripts/check-harness-alignment.ts, which calls checkHarnessAlignment() from src/cli/doctor-harness-alignment.ts. Fails CI when any of the 5 known harness discovery files (.cursor/rules/agents.mdc, .windsurf/rules/agents.md, .aider.conf.yml, .continue/rules/agents.md, .clinerules/agents.md) exists but doesn't reference AGENTS.md. Enforces the federation invariant per docs/architecture/AGENT_COMPATIBILITY.md: harness configs MUST redirect to AGENTS.md, never duplicate content. Existing files: `nexus-agents doctor` reports per-harness alignment in its output (Phase 3 of #2805, the same module). -->
<!-- PIPELINE NOTE: release.yml migrated from NPM_TOKEN to OIDC trusted publishing (#2814, 2026-05-16). NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }} removed from changesets/action step, fallback-publish step, and manual-publish dry-run + publish steps. Auth now flows via the workflow's `id-token: write` permission and npm's trusted-publisher configuration (per-package, on npmjs.com → Settings → Trusted Publishers). NPM_CONFIG_PROVENANCE: true retained for Sigstore signing — the OIDC token covers both auth and provenance. Trusted-publisher config required on npm UI for: nexus-agents, nexus-memory. Once configured, NPM_TOKEN secret can be deleted from the GitHub repo (kept for now in case rollback is needed). Same OIDC pattern as the nexus-eval-* repos (chore/oidc-trusted-publishing PRs in nexus-eval-swebench/-atbench/-swebench-pro, 2026-05-16). -->
<!-- PIPELINE NOTE: docs-check.yml MCP_TOOL_COUNT-drift job extended to scan docs/**/*.md prose (#3052, 2026-05-25). Existing job only validated site-data.ts, server.json tools[] / description prose, and root README.md. UX walkthrough of the rendered docs site found 6 stale "38 MCP tools" mentions across 5 user-facing files (docs/README.md, distribution/LISTING_SUBMISSIONS.md — marketplace evaluator copy! — distribution/PUBLISHING_GUIDE.md, getting-started/FIRST_TASK.md, v2/00-executive-summary.md) after #3048 shipped get_job_result as the 39th tool. New grep over docs/**/*.md with --exclude-dir=research --exclude-dir=archive --exclude-dir=api — those dirs reference historical counts as snapshots (research/nexus-agents-multi-harness-alignment-audit.md cites "38 MCP tools" as the audit-time count; archive/design-v2/v2-proposal.md cites "21 MCP tools" as the pre-#1303 baseline). Each match line is checked individually; drifts report as `file:line ('N MCP tools')` so the failure points straight at the stale prose, not just "somewhere in docs." -->

<!-- PIPELINE NOTE: inject-governance.ts now generates BOTH of docs/ENTRYPOINTS.md's MCP-tool enumerations — the prose table (new GOVERNANCE:ENTRYPOINTS_TOOLS markers) and the machine-parseable YAML block (existing BEGIN/END:MCP_TOOLS markers) — from REGISTERED_TOOL_NAMES + TOOL_DESCRIPTIONS (#3334, 2026-06-05). ENTRYPOINTS is the canonical CLI/MCP reference but its two tool lists were hand-maintained and had drifted (42/42 on disk vs the live 45-tool registry; the audit's "38/20" figures were already stale). New entrypointsToolDescription()/generateEntrypointsToolTable()/generateEntrypointsYamlBlock()/injectEntrypoints()/checkEntrypoints() mirror the README/AGENTS injectors: count derives from REGISTERED_TOOL_NAMES.length (never hardcoded), a registered tool missing a TOOL_DESCRIPTIONS entry throws loudly (no blank rows), and checkEntrypoints() joins checkGovernance() so CI fails on drift. The prose table's column padding mirrors prettier so `inject` → zero-diff → `check` is idempotent. ENTRYPOINTS_TOOL_AUTH preserves the only non-default auth (run_dev_pipeline → optional). 3 tests added to inject-governance.test.ts. -->

**Full specification:** [docops-spec.md](../../docs/ops/docops-spec.md)

---

## Fast Path: Common Tasks

### Update Documentation Content

```bash
# 1. Edit canonical source
edit docs/architecture/MEMORY_SYSTEM.md  # or relevant file

# 2. Verify docs are indexed
npx tsx scripts/check-docs-indexed.ts
```

### Add New Document

1. Create file in appropriate `docs/` directory
2. **REQUIRED:** Add YAML frontmatter (`title`, `description`, `tier`, `keywords`, `related_files`)
3. **REQUIRED:** Add entry to `docs/README.md`
4. Commit and push

### Change Doc Pipeline

1. Edit pipeline script/config
2. **REQUIRED:** Update `docs/ops/docops-spec.md`
3. **REQUIRED:** Update this skill (`.claude/skills/documentation-management.md`)
4. Run all checks (see Verification below)
5. Commit and push

### Verify Pipeline Health

```bash
npx tsx scripts/check-docs-indexed.ts
npx tsx scripts/generate-repo-index.ts --check
npx tsx scripts/inject-governance.ts check
```

---

## Core Concepts

### Canonical Sources

| Source            | Purpose                                       |
| ----------------- | --------------------------------------------- |
| `docs/README.md`  | Human-readable index (SINGLE SOURCE OF TRUTH) |
| `docs/INDEX.yaml` | Machine-parseable index                       |
| `docs/**/*.md`    | Canonical documentation                       |
| Root `*.md`       | Project entry points                          |

### Generated Outputs

| Output                           | Generated By               | From                  |
| -------------------------------- | -------------------------- | --------------------- |
| `docs/interfaces/agent.md`       | `generate-docs-content.ts` | `core/types/agent.ts` |
| `docs/design/components.md`      | `generate-docs-content.ts` | `src/` module scan    |
| `docs/ops/docs-inventory.md`     | `generate-docs-content.ts` | ADR + MCP tool scan   |
| `docs/reference/capabilities.md` | `generate-repo-index.ts`   | Source code           |
| CLAUDE.md tool index             | `inject-governance.ts`     | MCP tool files        |

### Tier System

- **Tier 1 (Essential):** README, CLAUDE.md, QUICK_START, TROUBLESHOOTING
- **Tier 2 (Reference):** Hub documents (architecture/README.md, etc.)
- **Tier 3 (Detail):** Deep-dive documents, ADRs, proposals

---

## Pipeline Scripts

### generate-docs-content.ts

Auto-generates documentation sections that are derivable from source code:
the `AgentRole` interface, a module inventory, and the ADR / MCP tool counts.
Prevents drift by reading directly from the source of truth.

```bash
npx tsx scripts/generate-docs-content.ts       # Generate all
npx tsx scripts/generate-docs-content.ts --check # CI validation
```

### generate-repo-index.ts

Generates capability index from source code. MCP tools are discovered by parsing
the canonical `tools: [...]` return array in `mcp/tools/index.ts`.

```bash
npx tsx scripts/generate-repo-index.ts       # Generate index
npx tsx scripts/generate-repo-index.ts --check # CI validation
```

### inject-governance.ts

Injects MCP tool table into CLAUDE.md. Tool descriptions are defined in the
`TOOL_DESCRIPTIONS` map — add an entry there when registering a new MCP tool.

```bash
npx tsx scripts/inject-governance.ts inject  # Update CLAUDE.md
npx tsx scripts/inject-governance.ts check   # CI validation
```

---

## CI Validation

### docs-check.yml jobs

<!-- Count + job list intentionally not hardcoded here. See #1837 for
     the work to inject counts programmatically. Authoritative source:
     `.github/workflows/docs-check.yml` — grep for `^  [a-z-]+:` under
     `jobs:` for the current list. -->

The pipeline runs a family of jobs covering: TypeDoc freshness, `capabilities.md` regeneration, link validation, docs coverage, secrets scanning, DocOps skill sync, canonical-index enforcement, markdown lint, spell check, skills/index.yaml freshness, agents/index.yaml + gap-coverage check, and governance drift. Blocking-vs-warning status is declared per job in the workflow file.

---

## Enforcement Rules

### Rule 1: Canonical Index Required

All documentation MUST be indexed in `docs/README.md`.

### Rule 2: No Parallel Indexes

`docs/README.md` is the ONLY permitted documentation index.

### Rule 3: Generated Files Must Match Source

CI fails if generated files drift from canonical sources.

### Rule 4: DocOps Changes Require Skill Update

Changes to pipeline files require updating this skill and `docs/ops/docops-spec.md`.

**Pipeline files:**

- `scripts/generate-docs-content.ts`
- `scripts/generate-repo-index.ts`
- `scripts/inject-governance.ts`
- `.github/workflows/docs-check.yml`

---

## Troubleshooting

### "docs-content check failed"

```bash
npx tsx scripts/generate-docs-content.ts
git add docs/interfaces/agent.md docs/design/components.md docs/ops/docs-inventory.md
git commit -m "docs: regenerate source-derived docs"
```

### "Link check failed"

1. Run `npx lychee . --config lychee.toml` to identify broken links
2. Fix links in canonical source

### "CI keeps failing on docs"

```bash
# Run full validation suite locally
pnpm lint
pnpm typecheck
npx tsx scripts/generate-docs-content.ts --check
npx tsx scripts/generate-repo-index.ts --check
npx tsx scripts/inject-governance.ts check
```

---

## Quality Checklist

Before committing documentation changes:

- [ ] File indexed in `docs/README.md`
- [ ] `npx tsx scripts/generate-docs-content.ts --check` passes (if types/module structure changed)
- [ ] `npx tsx scripts/generate-repo-index.ts --check` passes (if MCP tools added/renamed)
- [ ] Links work: `npx lychee . --config lychee.toml`
- [ ] No secrets in content

---

## Periodic Drift Audit

Adapted from `paperclipai/paperclip` doc-maintenance skill. Triggers: weekly cadence, post-release, after a major merge, or on explicit request ("audit docs", "doc drift").

### Targets

User-facing docs that get stale fastest as the codebase moves:

- `README.md` — features table, quickstart, prerequisites
- `docs/README.md` — canonical doc index
- `docs/getting-started/INSTALLATION.md` — install commands, Node/pnpm versions
- `docs/getting-started/CONFIGURATION.md` — env var table, config schema
- `CLAUDE.md` — Canonical Paths table, MCP Tools table (auto-generated, but check the _non_-auto sections)

### Cursor Pattern (incremental review)

Store the last-reviewed commit SHA in `.doc-review-cursor` (gitignored — it's local audit state, not project state). On each audit run:

```bash
LAST_SHA=$(cat .doc-review-cursor 2>/dev/null || echo "HEAD~200")
git log "$LAST_SHA"..HEAD --oneline --no-merges > /tmp/audit-window.log
```

After committing the audit fixes:

```bash
git rev-parse HEAD > .doc-review-cursor
```

Without the cursor, every audit re-reads the whole history → audits get skipped. With it, audits stay incremental and cheap.

### Commit Classification

From the audit window, only these commit prefixes warrant a doc check:

| Prefix                                     | Action                                                   |
| ------------------------------------------ | -------------------------------------------------------- |
| `feat:` / `feat(...)`:                     | Check feature tables, README highlights, capability docs |
| `fix:` containing `breaking` / API-removal | Check API reference, migration notes                     |
| New top-level `src/` directory             | Check architecture overview, canonical paths             |
| `chore(deps):` major bumps                 | Check prerequisites + compat tables                      |

Ignore: `refactor`, `test`, `chore(ci)`, `docs`, `style` — they don't shift user-facing surface.

### What to Look For

Run the audit through this lens:

| Drift class             | Signal                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **False negative**      | Shipped capability missing from feature/MCP tool/expert tables. Resolved design questions still marked TBD. Removed adapters/skills still listed. |
| **False positive**      | "Coming soon" / "planned" features that have shipped. Cancelled items still on roadmap. Capability claims that contradict current implementation. |
| **Quickstart breakage** | `npx`/`pnpm` commands that don't work. Prerequisites pinning unsupported versions. Clone URL drift. Required env vars unmentioned.                |
| **Feature-table drift** | `## MCP Tools Reference` count mismatch. Adapter "Works with" table missing recently-added CLI. Skill index missing a new skill.                  |

For our auto-generated tables (CLAUDE.md MCP tools, `capabilities.md`, `docs/interfaces/agent.md`), drift is a generation-script bug, not a doc edit — file an issue against the script instead of editing the rendered output.

### Audit-PR Discipline

- Branch: `docs/audit-$(date +%Y%m%d)`
- Commit message lists fixes + the source PR/commit that triggered each
- **Factual fixes only** — do NOT bundle style refactors, link-checker autofixes, or formatting passes. Style/refactor PRs are separate; mixing them defeats the audit's signal-to-noise.
- If a doc needs _more_ than drift fixes (e.g., a section is structurally wrong), open a follow-up issue rather than expanding the audit PR

### Out of Scope

- Auto-generated tables (handled by `scripts/inject-governance.ts`, `scripts/generate-docs-content.ts`, `scripts/generate-repo-index.ts`, etc.) — see Pipeline section above
- Style/voice/markdown formatting — orthogonal, separate PRs
- Adding new docs — separate workflow; this audit only fixes drift in existing docs

---

## Architecture Decision Records (ADRs)

ADRs capture the _why_ behind significant technical decisions. Code shows _what_ was built; ADRs explain _why this way_ and _what alternatives were rejected_. They're the highest-leverage documentation in the repo for onboarding (humans and agents) and for evaluating future changes.

ADRs live in [`docs/adr/`](../../docs/adr/) with sequential numbering: `0001-foo.md`, `0002-bar.md`, …

### When to write an ADR

- Choosing a framework, library, or major dependency (consensus_vote candidate)
- Designing a data model or schema
- Selecting an authentication, voting, or routing strategy
- Deciding on a public-API shape (REST, MCP tool, CLI command)
- **Any decision expensive to reverse** — that's the threshold

### ADR template

```markdown
# ADR-NNNN: <decision in present tense>

## Status

Proposed | Accepted | Superseded by ADR-MMMM | Deprecated

## Date

YYYY-MM-DD

## Context

What problem are we solving? What constraints (technical, organizational, time-bound) apply?
Cite the issue, vote, or incident that prompted the decision.

## Decision

The chosen approach, in 1-3 sentences.

## Alternatives Considered

Each as its own subsection. Pros, cons, and **why rejected**. Don't skip — the rejected
alternatives are how future readers understand the trade-off space.

## Consequences

Positive AND negative outcomes. What new constraints does this create?
What follow-up work falls out of this decision?
```

### ADR lifecycle

```text
PROPOSED → ACCEPTED → (SUPERSEDED-BY-NNNN | DEPRECATED)
```

- **Don't delete old ADRs.** They're historical context. A superseded ADR + its replacement together tell the story of why the system evolved.
- **When a decision changes, write a new ADR** that references and supersedes the old one. Update the old one's `Status:` line to `Superseded by ADR-NNNN`.
- ADRs are **immutable after Accepted** in spirit — fix typos, but don't rewrite the substance. New thinking goes in a new ADR.

### When NOT to write an ADR

- Reversible decisions (small refactor choices, naming style nits)
- Mechanical changes (dependency bump, lockfile update)
- Decisions already captured in a higher-level doc (`CLAUDE.md`, `.rules/`) — reference, don't duplicate

## Anti-rationalization — Documentation

| Excuse                                      | Counter                                                                                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The code is self-documenting"              | Code says **how**, not **why**. The why-this-not-that lives nowhere if not in an ADR or doc comment.                                                                            |
| "I'll document it later"                    | Later never comes. The context decays within days; what felt obvious now will be a mystery to next-quarter-you. Document at decision time.                                      |
| "We'll update the docs in the next release" | Drift compounds. By the next release, the doc says one thing, the code does another, and the audit gate fires (see #2225 audit). Update docs in the same PR as the code change. |
| "Comments lie, only code is truth"          | Lies-in-comments is a culture problem, not a comments problem. Code can also lie (subtly broken implementations). Both need review.                                             |
| "Nobody reads the docs anyway"              | Future-you reads them. New contributors (human or agent) read them. The skill-tree of the project depends on them.                                                              |
| "It's just an internal API"                 | Internal APIs accumulate Hyrum's Law just like public ones (see `api-and-interface-design`). Internal docs prevent internal coupling.                                           |

## Verification — Documentation changes

- [ ] Every public-API change has a documentation update in the same PR
- [ ] Significant architectural decisions have an ADR (or reference an existing one)
- [ ] Auto-generated docs regenerated via the pipeline scripts after source changes
- [ ] Doc additions follow the Tier system (Tier 1 essential / Tier 2 reference / Tier 3 detail)
- [ ] No drift from canonical sources — `npx tsx scripts/check-docs-indexed.ts` passes
- [ ] Markdown lint clean: `npx markdownlint 'docs/**/*.md' '*.md'`

## Related Documents

- **DocOps Spec:** [docs/ops/docops-spec.md](../../docs/ops/docops-spec.md)
- **Documentation Index:** [docs/README.md](../../docs/README.md)
- **Inventory:** [docs/ops/docs-inventory.md](../../docs/ops/docs-inventory.md)
- **ADR directory:** [docs/adr/](../../docs/adr/)

## Red flags

- Public-API change PR with no doc update in the same diff
- Architectural decision merged without an ADR
- Auto-generated doc table broken (`inject-governance.ts check` fails)
- Stale `@deprecated` references in `docs/` after a removal
- Doc PR with markdown lint errors (line wraps, table formatting)
