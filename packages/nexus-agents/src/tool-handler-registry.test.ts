/**
 * Parity + negative guards for the table-driven MCP tool registry (#3266).
 *
 * The registry in `cli-server-tools.ts` is SEEDED FROM `TOOL_MANIFEST` (the
 * single source of truth) via a `Record<RegisteredToolName, ToolHandler>`. These
 * tests lock the behaviour-preserving invariant the refactor must keep:
 *
 *  - PARITY: the handler table resolves EXACTLY the manifest tool set — count
 *    === 46, no extras, no omissions, one handler per entry.
 *  - NEGATIVE: `assertHandlerManifestParity` FAILS LOUDLY when the table and the
 *    manifest disagree (a manifest entry with no handler, or a handler with no
 *    manifest entry). We simulate both directions against the manifest set.
 *  - SNAPSHOT: the resolved tool set (names, in manifest order) is locked so an
 *    accidental reorder/rename is caught.
 */

import { describe, it, expect } from 'vitest';

import { HANDLER_TABLE_TOOL_NAMES, assertHandlerManifestParity } from './cli-server-tools.js';
import { TOOL_MANIFEST, type RegisteredToolName } from './mcp/tools/tool-manifest.js';

const MANIFEST_NAMES: readonly RegisteredToolName[] = TOOL_MANIFEST.map((t) => t.name);

describe('table-driven tool registry parity vs TOOL_MANIFEST (#3266)', () => {
  it('handler table resolves exactly the manifest tool set (count + membership)', () => {
    // Count: the MCP_TOOL_COUNT guard pins this at 46; assert against the
    // manifest rather than a literal so the two move together.
    expect(HANDLER_TABLE_TOOL_NAMES.length).toBe(MANIFEST_NAMES.length);
    expect(MANIFEST_NAMES.length).toBe(46);
    // No extras, no omissions.
    expect([...HANDLER_TABLE_TOOL_NAMES].sort()).toEqual([...MANIFEST_NAMES].sort());
  });

  it('every manifest entry resolves to exactly one handler (no dupes)', () => {
    const handlerSet = new Set(HANDLER_TABLE_TOOL_NAMES);
    expect(handlerSet.size).toBe(HANDLER_TABLE_TOOL_NAMES.length);
    for (const name of MANIFEST_NAMES) {
      expect(handlerSet.has(name)).toBe(true);
    }
  });

  it('assertHandlerManifestParity passes for the real table', () => {
    expect(() => {
      assertHandlerManifestParity();
    }).not.toThrow();
  });
});

describe('negative guard — table/manifest drift fails loudly (#3266)', () => {
  // assertHandlerManifestParity reads the module-private HANDLER_TABLE +
  // REGISTERED_TOOL_NAMES, so we cannot mutate them here. Instead we re-derive
  // the same set-difference logic the guard uses and prove it would flag both
  // drift directions — the contract the guard enforces.
  function parityErrors(
    manifest: readonly string[],
    handlers: readonly string[]
  ): { missing: string[]; orphan: string[] } {
    const m = new Set(manifest);
    const h = new Set(handlers);
    return {
      missing: [...m].filter((n) => !h.has(n)).sort(),
      orphan: [...h].filter((n) => !m.has(n)).sort(),
    };
  }

  it('flags a manifest entry with no handler', () => {
    const { missing, orphan } = parityErrors(
      [...HANDLER_TABLE_TOOL_NAMES, 'newly_added_tool'],
      HANDLER_TABLE_TOOL_NAMES
    );
    expect(missing).toEqual(['newly_added_tool']);
    expect(orphan).toEqual([]);
  });

  it('flags a handler with no manifest entry', () => {
    const { missing, orphan } = parityErrors(HANDLER_TABLE_TOOL_NAMES, [
      ...HANDLER_TABLE_TOOL_NAMES,
      'orphan_handler',
    ]);
    expect(missing).toEqual([]);
    expect(orphan).toEqual(['orphan_handler']);
  });

  it('the real table has neither missing nor orphan entries', () => {
    const { missing, orphan } = parityErrors(MANIFEST_NAMES, HANDLER_TABLE_TOOL_NAMES);
    expect(missing).toEqual([]);
    expect(orphan).toEqual([]);
  });
});

describe('resolved tool set snapshot (#3266 — lock equivalence)', () => {
  it('resolves the manifest tools in manifest order', () => {
    // The driver registers in REGISTERED_TOOL_NAMES order (== manifest order ==
    // server.json order). HANDLER_TABLE_TOOL_NAMES is the object-key order,
    // which we author in manifest order; assert the SET matches and snapshot
    // the manifest-ordered list the driver actually walks.
    expect([...MANIFEST_NAMES]).toMatchInlineSnapshot(`
      [
        "orchestrate",
        "create_expert",
        "execute_expert",
        "run_workflow",
        "delegate_to_model",
        "list_experts",
        "list_workflows",
        "consensus_vote",
        "research_query",
        "research_add",
        "research_add_source",
        "research_discover",
        "research_analyze",
        "research_catalog_review",
        "research_synthesize",
        "survey_oss_landscape",
        "vendor_publishing_audit",
        "compare_data_feeds",
        "memory_query",
        "memory_stats",
        "memory_write",
        "weather_report",
        "issue_triage",
        "run_graph_workflow",
        "execute_spec",
        "registry_import",
        "query_trace",
        "query_task_state",
        "get_job_result",
        "list_jobs",
        "cancel_job",
        "ci_health_check",
        "verify_audit_chain",
        "repo_analyze",
        "repo_security_plan",
        "extract_symbols",
        "search_codebase",
        "run_dev_pipeline",
        "run_pipeline",
        "pr_review",
        "supply_chain_tradeoff_panel",
        "improvement_review",
        "run_quality_gate",
        "suggest_research_tasks",
        "list_available_models",
        "run",
      ]
    `);
  });
});
