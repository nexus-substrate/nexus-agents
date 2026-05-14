/**
 * nexus-agents/mcp - Tool Prerequisite Gates
 *
 * Blocks sensitive MCP tools from running unless a **world-state
 * precondition** holds at call time (Issue #2652, Epic B).
 *
 * DESIGN — predicate, not session-ordering. A prerequisite is a predicate
 * over observable world state (is `gh` installed? is the data dir
 * writable?), evaluated on every invocation. It is NOT "tool A must have
 * been called before tool B" — MCP `tools/call` invocations are
 * independent, and a session-ordering gate is satisfied by an LLM calling
 * the prior tool pointlessly without making the precondition true. If a
 * requirement can only be expressed as "call X first," it is not a
 * prerequisite — it is the tool's own internal responsibility (e.g.
 * untrusted-input trust-tier classification stays inside `issue_triage`
 * per `.rules/untrusted-input.md`, it is not gated here).
 *
 * Fail-closed: a predicate that throws blocks the tool.
 *
 * @module mcp/middleware/tool-prerequisites
 * @see Issue #2652
 */

import { execFile } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import { getErrorMessage } from '../../core/index.js';
import { getNexusDataDir } from '../../config/nexus-data-dir.js';
import { toolStructuredError, type ToolResult } from '../tools/tool-result.js';
import type { ContextAwareToolHandler, ToolHandler } from './middleware-chain.js';

const execFileAsync = promisify(execFile);

/** Outcome of evaluating a prerequisite predicate. */
export interface PrerequisiteResult {
  ok: boolean;
  /** When `!ok`: what would make the predicate pass. Surfaced to the caller. */
  remediation?: string;
}

/** A world-state precondition a guarded tool requires at call time. */
export interface ToolPrerequisite {
  /** Stable identifier, e.g. `data-dir-writable`. */
  name: string;
  /** Why the tool needs it — for `.rules/tool-prerequisites.md` + the block envelope. */
  rationale: string;
  /** World-state predicate. MUST be cheap and side-effect-free. */
  check: () => Promise<PrerequisiteResult> | PrerequisiteResult;
}

// ============================================================================
// Predicates
// ============================================================================

/** The `gh` CLI is on PATH — required by tools that file/read GitHub state. */
async function ghCliAvailable(): Promise<PrerequisiteResult> {
  try {
    await execFileAsync('gh', ['--version'], { timeout: 5000 });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      remediation: `the 'gh' CLI is not available (${getErrorMessage(err)}) — install GitHub CLI and authenticate (\`gh auth login\`)`,
    };
  }
}

/**
 * The runtime data directory is writable, or — if it does not exist yet —
 * creatable (its parent is writable). Memory/registry backends create the
 * dir on demand, so "not yet created" is not a failure; an unwritable
 * parent is.
 */
async function dataDirWritable(): Promise<PrerequisiteResult> {
  const dir = getNexusDataDir();
  try {
    await access(dir, constants.W_OK);
    return { ok: true };
  } catch {
    // Dir may not exist yet — backends create it on demand. Treat a
    // writable parent (creatable) as satisfying the precondition.
    try {
      await access(dirname(dir), constants.W_OK);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        remediation: `NEXUS_DATA_DIR (${dir}) is not writable or creatable (${getErrorMessage(err)}) — fix its permissions; run \`nexus-agents doctor\` to diagnose`,
      };
    }
  }
}

// ============================================================================
// Registry
// ============================================================================

/**
 * Tools guarded by a call-time prerequisite. Keep this in sync with
 * `.rules/tool-prerequisites.md` — the `check:tool-prerequisites` CI gate
 * verifies every non-read-only tool is either listed here or in
 * `NO_PREREQUISITE` with a reason.
 */
export const TOOL_PREREQUISITES: Record<string, ToolPrerequisite> = {
  improvement_review: {
    name: 'gh-cli-available',
    rationale:
      "improvement_review's fileIssues mode shells out to `gh` to file candidate issues; without it the write path fails mid-operation",
    check: ghCliAvailable,
  },
  memory_write: {
    name: 'data-dir-writable',
    rationale:
      'memory_write persists entries under NEXUS_DATA_DIR — an unwritable data dir fails the write confusingly mid-operation',
    check: dataDirWritable,
  },
  registry_import: {
    name: 'data-dir-writable',
    rationale:
      'registry_import persists a draft registry entry under NEXUS_DATA_DIR when not in dryRun mode',
    check: dataDirWritable,
  },
};

/**
 * Non-read-only tools that deliberately have NO call-time prerequisite,
 * with the reason. The `check:tool-prerequisites` gate requires every
 * non-read-only tool to appear here or in `TOOL_PREREQUISITES`, so a newly
 * added sensitive tool can't ship ungated by omission.
 */
export const NO_PREREQUISITE: Record<string, string> = {
  orchestrate: 'orchestration is self-contained; sub-tool calls carry their own gates',
  create_expert: 'in-memory expert creation; no external precondition',
  execute_expert:
    'adapter availability is handled by the resilient-adapter circuit breaker, not a pre-gate',
  run_workflow: 'workflow execution is self-contained; step tools carry their own gates',
  run_graph_workflow: 'graph execution is self-contained; node tools carry their own gates',
  run_pipeline: 'pipeline execution is self-contained; stage tools carry their own gates',
  run_dev_pipeline: 'pipeline execution is self-contained; stage tools carry their own gates',
  execute_spec: 'spec execution is self-contained; stage tools carry their own gates',
  consensus_vote: 'voter-CLI availability is handled by per-voter fallback, not a pre-gate',
  supply_chain_tradeoff_panel: 'wraps consensus_vote; same per-voter fallback applies',
  pr_review: 'wraps consensus_vote; same per-voter fallback applies',
  research_add:
    'arXiv fetch failures surface as a transient envelope from the handler; no useful pre-gate',
  research_add_source:
    'GitHub metadata fetch is best-effort with graceful fallback; no useful pre-gate',
  research_catalog_review: 'operates on local catalog state already loaded by the handler',
  issue_triage:
    'untrusted-input safety (trust-tier classification, Rule of Two) is internal-handler logic per .rules/untrusted-input.md — not a call-time world-state predicate',
};

// ============================================================================
// Middleware
// ============================================================================

/** Either MCP handler shape, both structurally callable with `(args, ctx?)`. */
type AnyToolHandler = ContextAwareToolHandler | ToolHandler;
/** Concrete callable accepting an optional context — what the gate produces. */
type GuardedHandler = (args: unknown, ctx?: unknown) => Promise<ToolResult>;

/**
 * Wrap `handler` so `prereq` is evaluated before it runs. A failing or
 * throwing predicate returns a structured `permission` error envelope
 * (#2649) carrying the failed prerequisite + a remediation hint in
 * `detail` — so the caller knows how to recover, not just that it was
 * blocked. Exported for testing; production code uses `withPrerequisite`.
 */
export function applyPrerequisite(
  toolName: string,
  prereq: ToolPrerequisite,
  handler: AnyToolHandler
): GuardedHandler {
  return async (args: unknown, ctx?: unknown): Promise<ToolResult> => {
    let result: PrerequisiteResult;
    try {
      result = await prereq.check();
    } catch (err) {
      // Fail closed — a predicate that throws blocks the tool.
      result = { ok: false, remediation: `prerequisite check threw: ${getErrorMessage(err)}` };
    }
    if (!result.ok) {
      return toolStructuredError({
        errorCategory: 'permission',
        message: `${toolName} blocked: prerequisite '${prereq.name}' not satisfied`,
        detail: {
          failedPrerequisite: prereq.name,
          rationale: prereq.rationale,
          remediation: result.remediation ?? 'see .rules/tool-prerequisites.md',
        },
      });
    }
    return (handler as GuardedHandler)(args, ctx);
  };
}

/**
 * Wrap a handler so its tool's prerequisite (if any) is evaluated before
 * the handler runs. Tools with no entry in `TOOL_PREREQUISITES` pass
 * through untouched.
 */
export function withPrerequisite(toolName: string, handler: AnyToolHandler): AnyToolHandler {
  const prereq = TOOL_PREREQUISITES[toolName];
  if (prereq === undefined) return handler;
  return applyPrerequisite(toolName, prereq, handler);
}
