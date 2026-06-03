/**
 * Canonical capability counts for the nexus-agents website.
 *
 * Update these when adding new tools, experts, backends, etc.
 * Single source of truth for all numbers displayed on the website.
 *
 * Source files for each count are documented inline.
 * Run `pnpm --filter nexus-agents test` to verify these stay in sync
 * with the codebase (export contract tests catch drift).
 */

import pkg from '../../../packages/nexus-agents/package.json' with { type: 'json' };

/**
 * Released nexus-agents version, read at build time from
 * `packages/nexus-agents/package.json`. Rendered in the hero metadata
 * pill and the footer colophon. Avoids the hardcoded `v2.79.3` lag
 * that drifted four releases ahead of the website (#3049).
 *
 * The `v` prefix is added here so call sites don't have to remember.
 */
export const NEXUS_AGENTS_VERSION: string = `v${pkg.version}`;

/** MCP tools registered in src/mcp/tools/index.ts registerTools() */
export const MCP_TOOL_COUNT = 44;

/**
 * Built-in expert types in src/agents/experts/expert-config.ts BUILT_IN_EXPERTS.
 * code, architecture, security, documentation, testing, devops, research, pm, ux, infrastructure, qa
 */
export const EXPERT_TYPE_COUNT = 11;

/** CLI adapters in src/cli-adapters/adapters/ (claude, codex, codex-mcp, gemini, opencode) */
export const CLI_ADAPTER_COUNT = 5;

/** Routing pipeline stages in src/cli-adapters/routing/stages/index.ts */
export const ROUTING_STAGE_COUNT = 12;

/** Consensus algorithms in src/consensus/types-core.ts ConsensusAlgorithmSchema */
export const CONSENSUS_ALGORITHM_COUNT = 5;

/** Memory backend implementations in src/context/ */
export const MEMORY_BACKEND_COUNT = 8;

/** Research discovery sources in src/mcp/tools/research-discover.ts DiscoverySource */
export const DISCOVERY_SOURCE_COUNT = 9;

/** Papers tracked in docs/research/registry/papers.yaml */
export const PAPER_COUNT = 176;

/** Agent coordination classes (BaseAgent, SimpleAgent, TechLead, Orchestrator, SicaAgent) */
export const AGENT_CLASS_COUNT = 5;

/** Pipeline execution modes (autonomous, harness, dryRun) */
export const PIPELINE_MODE_COUNT = 3;
