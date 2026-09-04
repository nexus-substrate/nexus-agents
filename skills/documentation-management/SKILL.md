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
<!-- PIPELINE NOTE: .github/workflows/docs-check.yml extended with new "Schema-Fan-Out Check" job (#2408, 2026-05-07). Implements the gate from design #2407 / PR #2419. Runs scripts/check-schema-fanout.ts on every PR — warn-only in v1 (observability before enforcement, mirrors improvement_review pattern). When a tracked schema's source file changes in a way that touches the schema's marker, at least one consumer test file MUST also change in the same PR. Catches the cascade from #2253→#2254→#2255 (schema changes shipped without consumer-test updates). 3 bootstrap schemas: PrReviewInputSchema, TaskOutcomeSchema, ImprovementReviewInputSchema. Promote to --strict (hard fail) once false-positive rate is acceptable. CORRECTION (2026-08-22): this note recorded the job as added on 2026-05-07, and it was not — the design, script, tests and docs all landed in #2408/#2419 but no workflow ever invoked check-schema-fanout.ts, so the gate did not run for over three months while this note and docs/architecture/SCHEMA_FANOUT_COVERAGE.md both asserted it did. The job is now actually present in docs-check.yml. Found by an audit for gates whose output nothing consumes. -->
<!-- PIPELINE NOTE: .github/workflows/docs-check.yml extended with new "Orphan Detection" job (#2410, 2026-05-07). Implements design #2409 / PR #2420. Wraps knip (added as devDependency) with allowlist filtering at docs/ops/orphan-allowlist.json. Audit-only in v1 — never fails CI; surfaces orphan files for visibility. Counterfactual: would have caught the dead self-development engine (#2402, deleted ~7,700 LOC) at week 1 of orphan status instead of week 6. v2 = orphan count contributes to fitness score. v3 = fitness floor + threshold gates CI. Promotion gated on dry-run review. -->
<!-- PIPELINE NOTE: inject-governance.ts compacted the CLAUDE.md auto-generated tables to reduce context tax (PR #2555, 2026-05-10). generateToolIndex() now emits README_TOOL_DESCRIPTIONS (short clauses) in CLAUDE.md instead of the long TOOL_DESCRIPTIONS — full schemas live in docs/ENTRYPOINTS.md and the MCP tool definitions. generateWorkflowIndex() drops the trigger-keywords column (those live in each SKILL.md frontmatter; the harness routes from there). Same PR shrunk CLAUDE.md ~35% (591 → 409 lines) via .rules-pointer collapses for sections that auto-load anyway, and extracted the autonomous-loop ruleset to .rules/autonomous.md. New rule "Track All Work — Deferring is Fine; Untracked is Not" added to CLAUDE.md + AGENTS.md after epic #2540 shipped with 5 deferred follow-ups that lived only in memory until manually surfaced — issues #2546-#2550 now track them. -->
<!-- PIPELINE NOTE: docs-check.yml `typedoc-check` job gains a `check-typedoc-layout.ts` step (#4523, 2026-08-23), run immediately after `pnpm --filter nexus-agents docs:api:md`. Pins which generated API pages are nested and which are flat: three barrels (`exports/pipeline`, `exports/benchmarks`, `exports/agents-ictm`) carry a slash-bearing `@module` tag and publish under `/api/exports/`; the other sixteen carry no tag and land flat. A 7-voter panel resolved that published doc URLs are a stable interface and declined to normalise the three (5 of 6 approvers, 0.833) — so the gate exists because every voter, including the dissenter, said a comment would not survive the next tidy-up. It derives each entry point's required path from `typedoc.markdown.json` rather than hardcoding names, so a twentieth entry point is covered on arrival, and it fails on any unpinned nested page. NOT redundant with `check-typedoc-coverage.ts`, which passed under the same mutation because it compares on basename. It asserts against freshly GENERATED output — `docs/api/` is gitignored and derived since #4449, so there is no committed tree — and therefore cannot detect a stale local tree, nor page content, nor in-page anchors. Same PR fixed `src/exports/scm.ts`, whose `@module exports/scm` tag had been inert for two years because a trailing `(Source: …)` line inside the doc block silenced it; the tag is now `@module scm` with the attribution moved to a line comment, so the flat URL is a decision rather than an accident. Regeneration diff byte-identical. -->

<!-- PIPELINE NOTE: docs-check.yml — 11 `if [ $? -eq 0 ]` / `-ne 0` blocks converted to `if cmd; then` (#4582, 2026-08-23). GitHub Actions runs `run:` under `bash -e`, so a non-zero exit aborted the step BEFORE the `$?` test, making every `else` branch unreachable: the `::error::` annotation and the remediation hint were dead code in 9 sites, and in the skills-index and agents-index freshness jobs (`-ne 0`) the unreachable branch was the entire error handler. Observability only — no gate was passing that should have failed; `-e` still aborted with the script's status, so operators got a bare failure instead of the line naming what to re-run. Demonstrated live: the DocOps job on PR #4611 failed with `⚠ Pipeline files changed: 1` and printed NO `::error::` line. Verified by extracting each converted block from the parsed YAML and executing it under `bash -e -o pipefail` with stub commands exiting 0 and 1, asserting the failure path both annotates and exits non-zero; the original blocks were run through the same harness as a control and produced no annotation. shellcheck clean on all 11. actionlint was NOT run — not installed. -->

<!-- PIPELINE NOTE: docs-check.yml "Orphan Detection" job promoted from audit-only to BLOCKING (#4583, 2026-08-23). The v1 note above (#2410) promised "v2 = orphan count contributes to fitness score, v3 = fitness floor + threshold gates CI" and nothing tracked it; the gate stayed audit-only. Promoted directly to blocking instead of via the fitness-score route, because measurement made that route unnecessary: 22 orphans, all 22 allowlisted, 0 flagged, so the flip lands green and gets more expensive as the count drifts. Verified able to fire rather than assumed — an unreferenced non-exempt module is flagged and the gate exits 1; before this it printed the orphan and returned true anyway (`main()` already did `process.exit(success ? 0 : 1)`, so one unconditional `return true` was the whole pin). Two guards stop the allowlist becoming the loophole: each `specific_files` entry must declare exactly one of `expires` (dated debt) or `permanent: true` (structurally unimportable) — an undeclared exemption fails by name before knip runs — and a passed `expires` stops exempting. The 7 `patterns` are permanent structural facts (tests, scripts, configs, examples, migrations, barrels) and are untouched. Scope unchanged: knip's unused-FILES category only; unused-exports is the #4561 ratchet's job. -->

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

<!-- PIPELINE NOTE: checkToolPrerequisites in inject-governance.ts was reading the wrong annotations file (#3444, 2026-06-05). The TOOL_ANNOTATIONS map moved to src/mcp/tools/tool-annotations.ts (#3358) but the #2652 prerequisite-coverage gate still read the src/mcp/tool-annotations.ts wrapper (0 annotation blocks), so its non-read-only set was always empty and the gate silently no-op-ed — a new non-read-only MCP tool could ship without a TOOL_PREREQUISITES/NO_PREREQUISITE decision and the gate would never catch it. Fixed the path; gate passes on current code (maps were maintained, only enforcement was broken). Two gate-meta-tests in inject-governance.test.ts had the same stale wrapper path (so their mutate-restore drop-checks were no-ops): the #2652 drop-test now mutates `orchestrate` (issue_triage became readOnlyHint:true) and the #2648 annotations drop-test points ANNOTATIONS_PATH at the tools/ file. -->

<!-- PIPELINE NOTE: inject-governance.ts now GENERATES CLAUDE.md from AGENTS.md (#3446 Phases 2+3, 2026-06-05). extractAgnosticBody() slices AGENTS.md between AGNOSTIC:BODY:START/END markers; injectClaudeAgnosticBlock() injects that slice into CLAUDE.md between GENERATED:FROM_AGENTS markers; checkClaudeAgnosticBlock() (added to checkGovernance()) fails CI when the block is hand-edited or AGENTS.md was edited without re-inject. AGENTS.md is now the single canonical source for the ~75% harness-neutral guidance (mechanism C, generation — picked over  because it reuses this inject infra + is CI-drift-gated); CLAUDE.md = authored header + GENERATED:FROM_AGENTS block + a Claude-specific overlay (Agent/subagent_type table, plugin skills, the existing GOVERNANCE:* tool/model/version markers). checkCanonicalPaths() repointed from CLAUDE.md to AGENTS.md (its authoritative table now) and canonicalPathCandidates() checks EVERY backticked path in a row (was: last only). extractAgnosticBody fails loud on reordered/duplicate markers so a malformed AGENTS.md can never silently erase CLAUDE.md (#3446 QA). Phase 4 (GEMINI.md redirect) pending. -->

<!-- PIPELINE NOTE: entrypointsToolDescription in inject-governance.ts now escapes backslashes before pipes (\\ then \|), resolving a HIGH js/incomplete-sanitization CodeQL alert from #3334 (2026-06-05). Escaping | for markdown-cell safety without escaping \ first let a backslash-bearing tool description smuggle a half-escaped pipe past the sanitization. Behavior-preserving — the curated TOOL_DESCRIPTIONS corpus has no backslashes, so inject output is unchanged + idempotent. -->

<!-- PIPELINE NOTE: the canonical MCP tool-name list is now the leaf `TOOL_MANIFEST` array in src/mcp/tools/tool-manifest.ts (#3566, 2026-06-07). `REGISTERED_TOOL_NAMES` is a derived re-export; capability-gap-detector's AVAILABLE_TOOLS derives from the manifest (was a hand-copy + freshness test). ALL four tool-list parsers were retargeted to match `TOOL_MANIFEST = [...]` first (REGISTERED_TOOL_NAMES + legacy `tools:` kept as fallbacks): inject-governance.ts extractMcpTools(), generate-docs-content.ts extractMcpToolCount(), generate-repo-index.ts extractMCPTools(), and the docs-check.yml MCP_TOOL_COUNT awk guard. The registry-coverage manifest's REGISTERED_TOOL_NAMES entry repointed source→tool-manifest.ts/marker→TOOL_MANIFEST and gained a `moved_from` affordance so the structural-equivalence exemption recognizes a no-op registry relocation (new check-registry-coverage.ts feature). Annotation-data fold (#3597) + AST parser upgrade (#3596) are follow-ups. -->

<!-- PIPELINE NOTE: new docs-check job "MCP Description Drift" (#3528, 2026-06-07) runs scripts/check-mcp-description-drift.ts. Each tool's RUNTIME server.registerTool description (the agent-facing truth) is statically extracted from source and compared to the TOOL_DESCRIPTIONS doc-table (the inject-governance source) via an overlap-coefficient similarity threshold (0.5) — catching the #3527 class where the two long-form sources silently disagree. FAIL-LOUD: a tool whose runtime description can't be statically parsed (const/inline/template-literal/registerToolTask forms handled) is a hard failure, not a silent skip. README_TOOL_DESCRIPTIONS (intentional short-form) is out of scope. Reconcile drift by editing the doc-table entry to match the runtime description. -->

<!-- PIPELINE NOTE: scripts/generate-tool-reference.ts (#3687, 2026-06-08) generates the per-tool MCP reference (one markdown page per tool + an index) into docs/reference/tools/, the Astro `docs` content collection base path established by the #3686 typedoc→Astro spike. Data sources are single-source-of-truth surfaces — TOOL_MANIFEST (canonical tool list, #3566), TOOL_DESCRIPTIONS/README_TOOL_DESCRIPTIONS, and each tool's exported `*InputSchema` Zod object (params parsed statically from source; runtime import is blocked by the ci-health circular import #3756). `pnpm docs:tools` writes; `pnpm docs:tools:check` is the drift gate (#3689 will wire it into CI). The generated dir is added to check-docs-indexed.ts's exclusion + .prettierignore (mirroring docs/api/). Cut-over of ENTRYPOINTS/README API sections to this output is #3688 (vote-gated). -->

<!-- PIPELINE NOTE: link-check.yml gained a Rule-of-Two secret-gating guard (#3778, 2026-06-08) — its `link-check` job now skips pull_request runs from `auto-remediation/*` head refs (the auto-remediation plan doc is markdown and matches the job's path filter, and the job carries GITHUB_TOKEN). No change to push/schedule/dispatch link validation. Mirrors the existing ci.yml/pr-review.yml guards; kept in sync with AUTO_REMEDIATION_BRANCH_PREFIX. A regression test (auto-remediation-branch.test.ts) asserts all four secret-bearing PR-triggered workflows carry the guard. -->
<!-- PIPELINE NOTE: inject-governance.ts extractMcpTools() switched from a line-oriented regex to an AST walk (#3596, 2026-06-09) — the new pure module scripts/parse-tool-manifest.ts parses the canonical TOOL_MANIFEST array (then REGISTERED_TOOL_NAMES, then a legacy `tools:` property) via the TypeScript compiler API, returning string-literal elements in source order. Formatting-agnostic (comments between elements, single-line arrays, quote style) and the seam that lets the list become a fully *derived* value later (a regex over a literal cannot read a derived value — the #3566 5/5 vote). Output is byte-identical: governance:check unchanged at 46 tools. Parser carries 9 fixture unit tests (scripts/parse-tool-manifest.test.ts). -->
<!-- PIPELINE NOTE: docs-check.yml gained a "Tool Reference Drift" job (#3689, 2026-06-09) that runs `scripts/generate-tool-reference.ts --check` (= `pnpm docs:tools:check`) and fails when the committed docs/reference/tools/ output is stale. Closes the doc-drift loop for the #3687 generated per-tool MCP reference, mirroring the repo-index/governance --check gates (regenerate in memory, fail on diff). The push trigger's paths filter now also lists scripts/generate-tool-reference.ts. Regenerate + commit via `pnpm docs:tools`. -->
<!-- PIPELINE NOTE: TOOL_MANIFEST folded annotation/side-effect data in (#3597, 2026-06-09) — entries are now `{ name, annotations, sideEffects }` objects, not bare name strings, and TOOL_ANNOTATIONS derives from the manifest. The pipeline scripts that read tool names from the manifest all moved to the shared AST parser scripts/parse-tool-manifest.ts (which now also extracts `name` from object-literal elements): inject-governance.ts (checkToolAnnotations now reads the manifest, not tool-annotations.ts), generate-repo-index.ts and generate-docs-content.ts (replaced their line-regex with parseRegisteredToolNames), generate-tool-reference.ts + check-mcp-description-drift.ts (iterate `.name`). All counts byte-identical (governance:check 46 tools, docs:tools:check 47 files). Adding/removing a tool = edit the manifest array. -->

<!-- PIPELINE NOTE: docs-check.yml gains "Claims Registry Drift" job (#3825/#3826, Epic A, 2026-06-16) — blocking, sibling to governance-drift. Runs `pnpm claims:check` (scripts/claims-check.ts), which loads + Zod-validates governance/claims-registry.yaml (schema/loader at src/governance/claims-registry.ts) and verifies each curated claim against live source via its declared method (file-exists, file-contains, enum-member-count, manifest-tool-count, roadmap-status); fails the build on any drift. Seeds 8 claims (mcp-tool-count=46, consensus-strategy-count=6-names/5-strategies caveat, expert-type-count=12, hash-chained-audit, verify-audit-chain-tool, closed-loop-routing, standalone-cli-roadmap, rest-gateway-roadmap). Gates the CURATED registry, not arbitrary prose — the "new undeclared doc claim" heuristic detector (#3826 remainder) is deferred. Add a claim = edit the YAML. -->
<!-- PIPELINE NOTE: claims-check hardened (#3877/#3878/#3879/#3882, 2026-06-16). (1) The verifier now ALSO checks the claim's `subject` doc, not just the source-of-truth `path`: a `verification.subjectContains` literal must appear in `subject` (README.md/ARCHITECTURE.md), so README drift (e.g. "200 MCP tools" while source has 46) now FAILS the gate — closes #3877. (2) docs-check.yml push `paths:` filter extended with README.md + ARCHITECTURE.md (the `subject` of every current claim) so the job actually fires on the docs it polices — closes #3878; keep this list in sync with the distinct `subject` values in the registry. (3) `file-contains` now strips line/block comments before matching (a commented-out `// verify_audit_chain` no longer "verifies"), and a new `source-contains-all` method requires ALL comma-separated needles in real code; `closed-loop-routing` re-pointed from `file-exists` on a dir to `source-contains-all: LinUCB,TOPSIS` on composite-router.ts — closes #3879. (4) `hash-chained-audit` downgraded verified→partial, "immutable" removed in favor of "tamper-evident" with a caveat linking docs/security/audit-hash-chain-threat-model.md §7; README "immutable" prose softened to "tamper-evident" to stay consistent — closes #3882. Still 8 claims, 8/8 green. -->
<!-- PIPELINE NOTE: claims-check gained anti-gaming reverse coverage (#3880, maps to #3826 deferred undeclared-claim detector, 2026-06-16). `pnpm claims:check` now also runs src/governance/claims-coverage.ts: it scans README.md + ARCHITECTURE.md for a CLOSED, high-precision set of quantified-capability sentinels ("N MCP tools", "N built-in expert types", "N strategies" — CLAIM_PATTERNS) and FAILS when a matched claim has no covering registry entry. "Covered" = some entry whose `subject` is that doc declares a `verification.subjectContains` literal the matched prose contains (the inverse of the #3877 subject check). This closes the author-controlled-allowlist gap: silent registry shrink (entry deleted, doc claim remains) and mask-by-addition now fail CI. No workflow YAML structure change — the existing "Claims Registry Drift" job runs the same `pnpm claims:check`, which now enforces coverage too. Adding a NEW sentinel capability to a doc requires a registry entry (intended); generic numeric prose (versions, step/file counts, percentages) is never flagged. Extend CLAIM_PATTERNS only with deliberate, narrowly-anchored `<count> <capability-noun>` regexes to keep false positives near zero. Still 8 claims, 8/8 green. -->
<!-- PIPELINE NOTE: inject-governance.ts checkGovernance gains checkStrategyManifestRegistry (#3837, Epic C, 2026-06-16). New `strategy-manifest:check` gate (scripts/check-strategy-manifest-drift.ts, pure analyzeManifestDrift core) runs under `governance:check` (and the docs-check governance-drift job) as a sibling to the other registry drift gates: it fails CI when (a) governance/strategy-manifests.yaml drifts from the embedded STRATEGY_MANIFEST_REGISTRY constant (YAML↔TS deep-equal, both via the #3834 Zod schema), (b) the ExecutionStrategy union (read from meta-orchestrator.ts source) and the manifest set aren't a bijection (missing-manifest/extra-manifest/duplicate-strategy), or (c) the YAML fails schema validation. Regenerate intent: edit the manifests in lockstep (YAML + STRATEGY_MANIFEST_REGISTRY) when adding/removing a strategy. -->
<!-- PIPELINE NOTE: inject-governance.ts checkGovernance gains checkAuthorityTierDeclarations (#3841, Epic D / ADR-0017, 2026-06-16). New `authority-tier:check` gate (scripts/check-authority-tier-drift.ts, pure analyzeTierDeclarations core) runs under `governance:check` as a sibling to the #3837 manifest drift-gate: it fails CI when (a) any registered manifest has no declared authorityTier (every loop must declare a tier), or (b) a manifest is declared `authorityTier: enforce` without a floor-meeting promotion-evidence record in governance/authority-tier-evidence.yaml — evalN ≥ 100, soak ≥ P30D, precision ≥ 0.90, recall ≥ 0.80, ratification vote present (ADR-0017 advisory→enforce floor) — or (c) the evidence ledger fails PromotionEvidenceLedgerSchema. `enforce` is "never a default": an enforce declaration without evidence + ratification is a default flip and is rejected. Companion runtime guard (src/orchestration/authority-tier-guard.ts) refuses an above-tier action at the MetaOrchestrator router. Deferred to #3842: tier-transition audit events + the linked-ratification-vote gate over the hash-chained log. -->
<!-- PIPELINE NOTE: docs-check.yml gains "Strategy Reference Drift" job (#3838, Epic C / M2, 2026-06-16) — blocking, sibling to the #3687 "Tool Reference Drift" job. Runs `pnpm docs:strategies:check` (scripts/generate-strategy-reference.ts --check), which regenerates docs/reference/strategies/index.md FROM the strategy-manifest registry (STRATEGY_MANIFEST_REGISTRY, src/orchestration/strategy-manifest-registry.ts — the single source of truth the router reads) and fails CI if the committed output drifts. Each routable strategy row carries: entrypoint tool, when-to-force guidance, maturity/authority tier, executor availability (wired vs fail-closed). Completes the canonical-`run` story: the run PROSE landed via #3548, this supplies the manifest-DERIVED force-strategy tables so they can't drift. Regenerate intent: run `pnpm docs:strategies` after editing the manifests. The generated dir is excluded from check-docs-indexed.ts (entry page reference/strategies/index.md is indexed in docs/README.md) and .prettierignore, mirroring reference/tools. docs-check.yml push `paths:` filter also extended with scripts/generate-strategy-reference.ts. -->

<!-- PIPELINE NOTE: docs-check.yml claims-check push `paths:` filter extended with docs/governance/loop-promotion-criteria.md (#3844, Epic D / ADR-0017, 2026-06-16). That doc is the `subject` of five new per-loop promotion-criterion claims in governance/claims-registry.yaml (tune-loop-demotion-criterion verified; auto-remediation/knn-weighting/learned-selection/clawguard promotion criteria aspirational — the criteria are documented, the promotions themselves are not yet earned). Per the #3878 convention the claims-check job must fire when a claim's subject doc changes, so the new subject is added to the push paths filter (pull_request already runs path-independent). The claims use `method: file-exists` + `subjectContains` (plain substring, no comment-stripping — robust over Markdown) so editing the criterion prose out of the doc fails the gate. No change to inject-governance.ts itself; the loop-tier declaration gate (#3843) extends check-authority-tier-drift.ts (already wired under governance:check) to also validate governance/loop-tiers.yaml ↔ the embedded LOOP_TIER_REGISTRY constant. -->

<!-- PIPELINE NOTE: generate-tool-reference.ts re-sourced from static regex parsing to Zod v4 native introspection (#3688, Option C cutover, 2026-06-18). The per-tool `## Parameters` table now derives each field from `z.toJSONSchema(InputSchema, { io: 'input' })` instead of regex-scraping the `z.object({...})` source, and gains a **Constraints** column carrying the full input contract: enum members (previously surfaced only as the opaque `*Schema` ref name), minLength/maxLength, min/max (incl. exclusive), pattern, format, and `.default()` values. The live schema is read by dynamically importing each tool's defining module; `zod` is resolved through the package's own module graph via `createRequire` anchored at src/mcp/tools/tool-manifest.ts (a bare `import 'zod'` does not resolve from repo-root scripts under pnpm's isolated store). Array item types render as `array of <T>` (NOT `array<T>` — angle brackets trip markdownlint MD033). No workflow YAML change: the existing #3687 "Tool Reference Drift" job (`pnpm docs:tools:check`) already covers the enriched output. Same 47 files, same frontmatter. Companion: the hand-maintained `### Tool Schemas` JSON block in docs/ENTRYPOINTS.md (~590 lines) was deleted and replaced with a link to the generated reference (the vote-decided single-sourcing). Regenerate intent: `pnpm docs:tools`. New scripts/generate-tool-reference.test.ts asserts the constraint extraction + drift contract. -->

<!-- PIPELINE NOTE: inject-governance.ts made in-process testable (#3954, 2026-06-19) — NON-SEMANTIC, CLI behavior identical (same governance blocks injected in the same places). (1) `checkGovernance` and `injectGovernance` are now exported. (2) The CLI dispatch (`process.argv` parse + `switch` on the `check`/`inject` command) is guarded by an `import.meta.url === pathToFileURL(process.argv[1]).href` entrypoint check, so importing the module runs no command and calls no `process.exit` — only direct invocation (`npx tsx scripts/inject-governance.ts ...`) executes. (3) Path resolution honors a `NEXUS_SCRIPT_ROOT` env override via scripts/script-paths.ts `ROOT` (the seam every path-deriving helper reads from), letting the new scripts/inject-governance.test.ts drive check/inject against an isolated temp sandbox instead of shelling out and mutating the real tree. Unset = identical production behavior; `governance:check` output unchanged. -->
<!-- PIPELINE NOTE: check-docops-skill.ts input hardening (#4171, 2026-07-02) — NON-SEMANTIC for well-formed refs. GITHUB_BASE_REF (external input: PR target branch name) is now validated against a plain ref-character pattern via safeBaseRef(), and the per-file diff + commit-message-walk git calls use execFileSync array args instead of shell template literals (PR file paths are author-controlled). Malformed refs fall back to the existing HEAD~1 semantics; gate decisions unchanged. -->
<!-- PIPELINE NOTE: TypeDoc API reference is no longer committed (#4449, PR #4503, 2026-08-19) — SEMANTIC. Two generated trees existed: docs/api (20 markdown files, 126,712 lines, rendered by the website /api route) and packages/nexus-agents/docs/api (1,931 HTML files, 153,130 lines, consumed by NOTHING — it existed only to be drift-checked, while changeset:version regenerated it every release and pushed 5,886 lines of pure version-string churn into every version PR). Both are now gitignored and removed from the index; changeset:version no longer regenerates the HTML tree. Generation moved into the turbo graph: nexus-agents-website#build dependsOn nexus-agents#docs:api:md dependsOn nexus-memory#build (an npm prebuild hook was tried first and raced turbo, breaking the nexus-agents dts build). RCA of the ~40k-line regeneration churn, measured rather than assumed: Prettier reformatting TypeDoc output 43%, commit-SHA permalinks 38%, node_modules paths carrying dependency versions, and genuine staleness — both leading causes were asymmetries between the two typedoc configs (.prettierignore and gitRevision were set for the HTML tree only). Aligning them makes generation idempotent (two consecutive runs, zero diff). The #2027 warning-only 'TypeDoc Verification' job (see the 2026-04-19 note above) is REPLACED by a blocking 'TypeDoc Generation' job: a warning-only gate is a check that cannot fail, which is why the committed docs rotted until they documented getCapacityDashboard() months after its deletion. The new job fails when TypeDoc errors or emits zero pages, so a missing published reference is loud rather than silently empty. Also fixed pre-existing dead config: turbo.json overrode 'website#build' but the package is named nexus-agents-website, so that entry never matched. -->
<!-- PIPELINE NOTE: TypeDoc entry-point coverage gate (#4504, PR #4513, 2026-08-21) — SEMANTIC. docs-check.yml's generation job previously asserted only that SOME pages were produced, which a silently-vanishing module passes trivially. It now runs scripts/check-typedoc-coverage.ts, comparing generated pages against the entryPoints DECLARED in typedoc.markdown.json. Motivation: the config declares 19 entry points and generation emits 16 — pipeline, benchmarks and agents-ictm produce no page at all, so PipelineRunner (a CLAUDE.md canonical path) and BenchmarkAdapter have no published API reference. That was masked for months by stale committed pages from an older config and only surfaced when #4449 stopped committing the docs tree. Chosen by a 7-voter higher_order panel 4-2 (one reject) over fixing the barrels (cause unconfirmed — the re-export theory is falsified by benchmarks.ts at 20 exports) or deleting the entry points (edits the measurement to match the defect). KNOWN_MISSING enumerates exactly the three failing entry points; the panel's distinction is that stale committed pages were an invisible default reading as a pass, while an enumerated allowlist is partial coverage honestly labelled. Verified the gate still exits 1 on a FOURTH regression, and a stale allowlist entry (one that starts generating) reports itself so the list shrinks rather than rotting — that last part addresses the contrarian's reject-vote objection. Diagnosing the three barrels remains open under #4504. -->
<!-- PIPELINE NOTE: docs-check.yml gains a `docs-success` aggregator job, "Docs Success" (#4809, 2026-08-25) — SEMANTIC for the workflow's verdict, NOT yet for merges. The workflow defined 20 jobs and had no aggregate job, and none of them appear in ci.yml's `ci-success.needs`; branch protection requires named contexts, so there was no single context expressing "the documentation gate passed" and every one of the 20 could go red on a mergeable PR. Demonstrated rather than assumed: #4808 drifted docs/reference/tools/run.md, `Tool Reference Drift` went red, and the merge was stopped only by scripts/generate-tool-reference.test.ts asserting the same invariant inside the required `Script Tests` job — caught by duplication, not by the gate built for it. The new job `needs` all 18 non-advisory jobs and tests each one's `.result`; a `needs` entry alone only makes the aggregator WAIT, so an unchecked dependency is awaited and then ignored (that inverse shape is mutation-tested). docs-coverage and spell-check are excluded deliberately — both carry continue-on-error, so requiring them would be a gate that cannot fail. ADDING "Docs Success" TO BRANCH PROTECTION IS STILL OPEN (#4802, owner decision): until then this collapses 20 scattered results into one honest verdict but does not block. What IS enforced today is completeness — scripts/ci-required-jobs.test.ts was extended from ci.yml to cover this workflow too, and it runs inside the required `Script Tests` job, so a new docs job must declare itself required or advisory instead of defaulting to invisible. First live effect: the aggregator immediately turned this very PR red via `DocOps Skill Sync`, because docs-check.yml is itself a tracked pipeline file in docs/ops/docops-manifest.json — the gate correctly demanded this note. -->

<!-- PIPELINE NOTE: docs/INDEX.yaml RETIRED (#4810, 2026-08-25) — SEMANTIC. Measured before acting: it indexed 17 of 208 tracked docs (~8%), its header claimed `Generated: 2026-02-22` while NO generator ever existed (grep -rln 'INDEX.yaml' scripts/*.ts returned only the skiplist entry in check-docs-indexed.ts, and docs/ops/docs-inventory.md listed the generator as a PLANNED #630 item), and it was skiplisted out of the Canonical Index Check that gates docs/README.md — so the repo carried two indexes for one concern and gated only the complete one. docs/README.md:480 told readers to use it 'for programmatic access', which handed a caller 8% of the corpus with no coverage statement; a retrieval gap reads as documentation absence, not index incompleteness. Retired by a 7-voter higher_order panel, unanimous among approvers (6/6 selected retire-and-repoint). Options rejected: building the generator failed capability-bias (machine_index was declared in docops-manifest.json and exercised by nothing, and #630 sat unbuilt), and keeping it hand-curated preserved a second ungated index competing with the gated one. Consumers repointed: docops-manifest.json (machine_index key removed entirely rather than left dangling), docs/README.md (structure listing + the programmatic-access section, which now states why there is no machine index), docs/TROUBLESHOOTING.md (2 refs), docs/skills-index.md (related_files), docops-spec.md (4 refs incl. the add-a-doc procedure step), docs-inventory.md (#630 row marked moot), and the now-dead 'INDEX.yaml' entry in check-docs-indexed.ts's EXCLUDED_FILES. The dissenting voter agreed retirement is the correct end state but objected to immediate deletion over unknown EXTERNAL consumers, since the README advertised it publicly; weighed and proceeded because package.json `files` does not ship docs/, so the artifact existed only in the GitHub tree, and the advertised entry point (README) now carries the explanation rather than 404ing. docs/archive/ references left untouched — a frozen historical record should not be rewritten. -->
<!-- PIPELINE NOTE: inject-governance.ts `checkToolOutputConsistency()` now FAILS when it scanned zero tool files (#5298, 2026-08-30) — SEMANTIC. It returned `true` on `violations.length === 0` over `scanToolFiles()`, which yields `[]` when packages/nexus-agents/src/mcp/tools does not resolve. A moved or mis-rooted tools path therefore produced a clean GOVERNANCE verdict from a run that inspected zero files, with no count, path, or log distinguishing it from a genuine pass — the 'a check that cannot fail is not a check' shape, on the governor path. Now calls `scanToolFilesWithCoverage()` (added in #5297) and returns false with an explicit message when `dirMissing` or `scanned === 0`. Landed alongside the same fix in src/governance/claims-coverage.ts, whose `checkCoverage()` skipped declared docs that did not exist and so could be defeated by renaming README.md; CoverageReport now carries `docsScanned`/`docsMissing`, a missing declared doc fails, and scripts/claims-check.ts prints the scanned count next to the (forward-facing, independent) `registry.claims.length`. Governance-path change: ratified by consensus_vote per the owner's standing instruction, not self-merged. -->

<!-- PIPELINE NOTE: docs-check.yml — three gates that reported a pass without measuring, fixed; a fourth removed (#5302, 2026-08-31) — SEMANTIC. Verified by EXECUTING each shell construct, not by reading it. Structural precondition established first: no workflow here sets defaults.shell or a global pipefail, so every run: block is GitHub's default `bash -e {0}` — -e on, pipefail OFF, which is what makes the pipe cases real. (1) The `[skip-docs]` escape-hatch RATE LIMIT is REMOVED, not repaired. It claimed "2 per author per 7 days" and could never fire: it read docs/.audit/escape-hatch.log, but `git ls-files docs/.audit/` returns only .gitkeep and .gitignore:29 is `*.log`, so the file is absent from every checkout and the `if [ -f ]` guard was a provable no-op; the `>>` append beneath it wrote to the runner workspace, discarded at job end, so no run could observe another's usage; and `tail -14 | wc -l` counted lines, not days. Removed because a limit that is advertised and unenforced is worse than none — it invites reliance on a control that does not exist. The ::warning:: recording each use, attributed to its author, remains, so usage stays OBSERVABLE while no longer being falsely described as LIMITED. Rebuilding it needs cross-run state (a gh API search over the author's past PRs); tracked at #5352, which also argues option 1 (deliberately no limit) is defensible for a single-author repo. (2) The MCP tool-count drift check's README leg ran ZERO assertions when the prose was reworded: `while IFS= read -r n; do [ -n "$n" ] && check ...; done <<< ""` runs its body once with an empty $n, the guard is false, no check executes, and under bash -e a failing AND-list does NOT exit — so the step still printed "✅ MCP_TOOL_COUNT agrees everywhere". Verified empirically: 0 checks over empty input, then continued. Absence of the count is now itself reported as drift. The sibling docs_mentions loop is deliberately NOT changed: docs may legitimately mention no count, so empty there is not evidence. (3) spell-check's `pnpm spell | tee` took tee's status, so a cspell CRASH left a file with no "Unknown word" and the step printed "✅ No spelling issues found" for a check that never ran; the job is continue-on-error and excluded from docs-success, so this was a false log line rather than a merge bypass, and "no findings" is now distinct from "the tool failed". The fifth item in #5302 (semgrep.yml SARIF) is NOT a defect and was left alone — a plain redirect, not a pipe, so a crashed scanner does redden the step, and upload-only-to-code-scanning is the documented advisory pattern under #4802. -->
<!-- PIPELINE NOTE: inject-governance.ts now writes AGENTS.md's `_Governance Version:` stamp from the same computed value it writes into CLAUDE.md (#5218, 2026-09-02) — SEMANTIC, and it was breaking main. The stamp had TWO writers: `generateVersionSection` computes it from `getGovernanceSourceDate()` into CLAUDE.md's own GOVERNANCE:VERSION markers, while AGENTS.md carried a hand-held copy INSIDE the AGNOSTIC:BODY slice that `injectClaudeAgnosticBlock` copies verbatim into CLAUDE.md. Same line, two writers, no reconciliation. Editing any of the five sources `getGovernanceSourceDate()` reads moves the computed date; CLAUDE.md took the new one, AGENTS.md kept the old, and the #3446 staleness check then reported the generated block stale on whatever PR happened to touch a governance source next — with a message telling the author to "edit the agnostic prose in AGENTS.md" when nothing about the prose was wrong. The diagnostic tell is that the WRITER is a no-op while the CHECKER keeps failing: `check` regenerates the block from AGENTS.md and sees the old date, whereas the full writer regenerates from AGENTS.md and THEN re-stamps CLAUDE.md, netting zero. That is what two writers fighting looks like from the outside. It fired for real when #5216 annotated BUILT_IN_EXPERTS, moving expert-config.ts's commit date to 2026-09-01 while AGENTS.md stayed at 2026-08-30; Script Tests (18 failures), Governance Drift Check and Docs Success all went red on main and both open PRs inherited it. Fixed by adding the stamp to `buildAncillaryReplacements` for AGENTS_MD_PATH, so both files are written from one value — chosen over teaching the checker to ignore the stamp region, which would have left two writers and blinded the check to real drift. NO FEEDBACK LOOP, verified before writing it: AGENTS.md is not among the five paths getGovernanceSourceDate() reads, so stamping it cannot move the stamp; a naive fix here makes the check permanently unstable. Two regression tests in scripts/inject-governance.test.ts, both mutation-verified — one asserts the two stamps are equal after inject, the other plants an older stamp in AGENTS.md (reproducing the exact state that broke main) and asserts `check` passes afterwards. Injection idempotency re-verified across three consecutive runs. -->

<!-- PIPELINE NOTE: docs-check.yml job timeout-minutes raised 5 → 10 on nine install-bound gates (#5396, 2026-09-04) — NON-SEMANTIC: no job's steps, conditions, or verdict changed, only its runaway-guard cap. These gates are ~90% `setup-node`; the check itself takes seconds (`check:model-drift` measured at 17.3s over 1443 files), so a 5-minute cap budgeted almost nothing for a cold pnpm store. Three distinct jobs exhausted it in one session. The reason this is worth a note rather than a silent bump is the FAILURE MODE: GitHub reports a timed-out job as CANCELLED, which is indistinguishable at a glance from this workflow's `concurrency: cancel-in-progress` superseding a run — so the natural operator response is to re-run, which reproduces it. Distinguish the two by comparing a job's duration to ITS OWN configured cap, not to an assumed uniform 5: on PR #5397 `Consolidation E2E` ran 8m12s, which reads as proof it did NOT hit a 5-minute cap and so as evidence of supersession — but that job's cap was 8, and it was a genuine timeout. It is raised to 20 (not the house-default 10) in ci.yml because it runs a full `pnpm build` plus two `docker compose` container runs; 10 would have left two minutes of headroom on a job that had just exhausted its budget. `docs-success` stays at 5: it is an aggregator with no install step. Same bump applied to ci.yml, parameter-drift.yml, pricing-drift.yml and system-review.yml. DELIBERATELY EXCLUDED: governor-review.yml, a governor-owned path per CODEOWNERS — the governor's own timing is not something the governed process adjusts unratified. These caps are runaway-guards, not SLAs. This note exists because the DocOps gate correctly demanded it: docs-check.yml is a tracked pipeline file in docops-manifest.json, and the #3363 mechanical-bump exemption covers only `uses:` action-version lines, not timeout-minutes — see #5401. -->

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

| Source           | Purpose                                       |
| ---------------- | --------------------------------------------- |
| `docs/README.md` | Human-readable index (SINGLE SOURCE OF TRUTH) |
| `docs/**/*.md`   | Canonical documentation                       |
| Root `*.md`      | Project entry points                          |

### Generated Outputs

| Output                           | Generated By                 | From                           |
| -------------------------------- | ---------------------------- | ------------------------------ |
| `docs/interfaces/agent.md`       | `generate-docs-content.ts`   | `core/types/agent.ts`          |
| `docs/design/components.md`      | `generate-docs-content.ts`   | `src/` module scan             |
| `docs/ops/docs-inventory.md`     | `generate-docs-content.ts`   | ADR + MCP tool scan            |
| `docs/reference/capabilities.md` | `generate-repo-index.ts`     | Source code                    |
| `docs/reference/tools/*.md`      | `generate-tool-reference.ts` | TOOL_MANIFEST + `*InputSchema` |
| CLAUDE.md tool index             | `inject-governance.ts`       | MCP tool files                 |

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
