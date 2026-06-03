/**
 * Central per-tool MCP annotations accessors (#2648, Epic A; consolidated #3358).
 *
 * The MCP 2025-11-25 spec defines four boolean hints clients use to reason
 * about each tool's safety, retry semantics, and permission UX:
 *
 *   - `readOnlyHint`     — tool does not modify persistent state
 *   - `destructiveHint`  — tool can perform destructive operations
 *   - `idempotentHint`   — calling with the same input is safe to repeat
 *   - `openWorldHint`    — tool interacts with systems outside the server's control
 *
 * Per the MCP spec these are **hints**, not enforcement primitives — clients
 * should never trust them from an untrusted server. But for nexus-agents (a
 * governance substrate) the hints are load-bearing for:
 *
 *   - Programmatic prerequisite gates (Epic B / #2652) — uses
 *     `destructiveHint` and `openWorldHint` to decide what to gate.
 *   - Retry policy decisions in pipeline runners — only retry tools where
 *     `idempotentHint === true`.
 *   - Permission-prompt UX consistency across Claude / Codex / Gemini /
 *     OpenCode harnesses.
 *
 * The audit (#2648 / docs/research/nexus-agents-multi-harness-alignment-audit.md
 * §6 T14) requires **every** registered tool declare all four hints
 * explicitly — no defaults.
 *
 * **Single source of truth (#3358):** the per-tool annotation DATA lives in
 * the side-effects superset registry at `./tools/tool-annotations.ts`, where
 * each entry pairs the MCP hints (`.annotations`) with curated side-effects
 * metadata (#993). This file is the LIVE ACCESSOR path: each tool's
 * `registerTool()` call site reads its annotations via `getToolAnnotations(name)`.
 * Data flows data-file → accessor-file only (no circular import).
 *
 * @module mcp/tool-annotations
 */

import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { TOOL_ANNOTATIONS as TOOL_SIDE_EFFECTS } from './tools/tool-annotations.js';

/**
 * Look up the MCP annotations for a registered MCP tool. Throws if the tool
 * name isn't in the central registry — this enforces "every tool declares its
 * hints explicitly" rather than silently falling back to MCP's defaults
 * (which assume destructive + non-idempotent + open-world).
 *
 * The data is derived from the side-effects superset registry
 * (`./tools/tool-annotations.ts`, #993); only the four MCP hint booleans are
 * returned here — side-effects metadata is reached via that module's
 * `getSideEffectsByCategory`.
 */
export function getToolAnnotations(name: string): ToolAnnotations {
  const entry = TOOL_SIDE_EFFECTS[name];
  if (entry === undefined) {
    throw new Error(
      `getToolAnnotations: no entry for tool "${name}". Add it to TOOL_ANNOTATIONS in src/mcp/tools/tool-annotations.ts (#2648/#3358).`
    );
  }
  return entry.annotations;
}
