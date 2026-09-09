/**
 * The governance marker set — a LEAF module, imported by both the injector and
 * the stamp exemption (#6022).
 *
 * It lives here, not in `inject-governance.ts`, because that module already
 * imports `GOVERNANCE_STAMP_DIGEST_LENGTH` from `governance-stamp-exemption.ts`.
 * Adding the reverse edge made a cycle, and under ESM a cycle leaves one side's
 * bindings in the temporal dead zone during module init — which silently
 * degraded the stamp pattern and made 29 injector checks stop being able to
 * FAIL. A gate that cannot fail is the defect this whole change exists to fix,
 * so it was not going to ship as its implementation.
 *
 * @module scripts/governance-markers
 */

export const MARKERS = {
  toolIndexStart: '<!-- GOVERNANCE:TOOL_INDEX:START -->',
  toolIndexEnd: '<!-- GOVERNANCE:TOOL_INDEX:END -->',
  modelListStart: '<!-- GOVERNANCE:MODEL_LIST:START -->',
  modelListEnd: '<!-- GOVERNANCE:MODEL_LIST:END -->',
  versionStart: '<!-- GOVERNANCE:VERSION:START -->',
  versionEnd: '<!-- GOVERNANCE:VERSION:END -->',
  readmeToolsStart: '<!-- GOVERNANCE:README_TOOLS:START -->',
  readmeToolsEnd: '<!-- GOVERNANCE:README_TOOLS:END -->',
  // #2317: Workflows table is now generated from skills/index.yaml so adding/
  // removing a skill cannot drift the CLAUDE.md table. Index covers the
  // canonical (#1828) skill→SKILL.md layout.
  workflowIndexStart: '<!-- GOVERNANCE:WORKFLOW_INDEX:START -->',
  workflowIndexEnd: '<!-- GOVERNANCE:WORKFLOW_INDEX:END -->',
  // #2657 (Epic C): AGENTS.md "Rules index" table is generated from the
  // `paths:` + `description:` frontmatter on every `.rules/*.md`. It is the
  // universal cross-adapter bridge — Codex / Gemini / OpenCode only see a
  // rule if AGENTS.md references it — so hand-maintaining it drifts.
  rulesIndexStart: '<!-- GOVERNANCE:RULES_INDEX:START -->',
  rulesIndexEnd: '<!-- GOVERNANCE:RULES_INDEX:END -->',
  // #3334: ENTRYPOINTS.md prose tool table. The YAML block keeps its own
  // pre-existing `BEGIN/END:MCP_TOOLS` markers (see ENTRYPOINTS_YAML_*).
  entrypointsToolsStart: '<!-- GOVERNANCE:ENTRYPOINTS_TOOLS:START -->',
  entrypointsToolsEnd: '<!-- GOVERNANCE:ENTRYPOINTS_TOOLS:END -->',
  // #5458: ENTRYPOINTS.md CLI command tables, one per catalog audience band.
  entrypointsCliStart: '<!-- GOVERNANCE:ENTRYPOINTS_CLI:START -->',
  entrypointsCliEnd: '<!-- GOVERNANCE:ENTRYPOINTS_CLI:END -->',
  // #3446 (Phase 2+3): CLAUDE.md's agnostic body is GENERATED from AGENTS.md's
  // `AGNOSTIC:BODY` slice so harness-neutral prose is authored exactly once.
  // The slice is injected between these markers; everything outside them
  // (authored header + Claude-specific overlay) stays hand-maintained.
  claudeAgnosticStart: '<!-- GENERATED:FROM_AGENTS:START -->',
  claudeAgnosticEnd: '<!-- GENERATED:FROM_AGENTS:END -->',
};

/**
 * Every generated span NAME, derived from {@link MARKERS} rather than listed
 * again (#6022).
 *
 * The stamp exemption names a SUBSET of these. Deriving both from one object is
 * what stops the subset naming a span that does not exist, or silently missing
 * one that appears later.
 */
export const GOVERNANCE_SPAN_NAMES: readonly string[] = [
  ...new Set(
    Object.values(MARKERS)
      .map((marker) => /<!-- GOVERNANCE:([A-Z_]+):(?:START|END) -->/.exec(marker)?.[1])
      .filter((name): name is string => name !== undefined)
  ),
];
