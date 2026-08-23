/**
 * Tool-refusal capability gaps (#4651).
 *
 * ## What this is for
 *
 * A registry gap ("the task needed a tool we do not have") is what
 * `detectCapabilityGaps` was built for, and it cannot currently produce one —
 * `requiredCapabilities` is drawn from static tables whose every entry is
 * already available, so the diff is always empty.
 *
 * A **tool refusal** is a different thing: a tool that exists, ran, and
 * declined the work for a reason it can name. `extract_symbols` hard-gating on
 * file extension is the first producer — an agent asked it to read a `.py`
 * file and it could not. That is real, deterministic, observable demand for a
 * capability we do not have, and the registry diff has no vocabulary for it.
 *
 * The #4651 panel chose this shape unanimously among approvers over three
 * alternatives, in particular over inferring gaps from LLM-named capabilities:
 * `parse python` / `python AST` / `py support` would each count once, and a
 * frequency-ranked consumer cannot do anything useful with an unnormalised
 * label space. A refusal keyed on a file extension has no such problem.
 *
 * ## Why the key matters more than it looks
 *
 * The name IS the frequency bucket. Two spellings of one capability each sit
 * below the trigger threshold while their sum is above it, so the gap that
 * should surface is exactly the one that does not. Hence normalisation, and
 * hence a refusal with no nameable capability records nothing at all rather
 * than accumulating under an empty key.
 *
 * @module core/task-analysis/tool-refusal-gap
 */

import type { CapabilityGapReport } from './capability-gap-detector.js';
import {
  getGapLedger,
  type GapContext,
  type ICapabilityGapLedger,
} from './capability-gap-ledger.js';

/** A tool declining work it cannot do. */
export interface ToolRefusal {
  /** The tool that refused, by its MCP name. */
  readonly tool: string;
  /** What it could not handle — the dedup key. An extension, a format, a language. */
  readonly capability: string;
  /** What would close the gap, for whoever reads the summary. */
  readonly suggestion: string;
}

/**
 * The ledger key for a refusal: `<tool>:<capability>`, lowercased.
 *
 * Lowercasing is load-bearing rather than cosmetic — see the module note on
 * why a split bucket hides the gap it is meant to surface.
 */
export function toolRefusalGapName(tool: string, capability: string): string {
  return `${tool}:${capability}`.toLowerCase();
}

/**
 * Records a tool refusal to the gap ledger.
 *
 * A refusal with no nameable capability is **not** recorded: it is an
 * unmeasured refusal, and filing it under an empty key would inflate a bucket
 * that means nothing. Callers with nothing to name should not call this.
 */
export function recordToolRefusal(
  refusal: ToolRefusal,
  context: GapContext,
  ledger: ICapabilityGapLedger = getGapLedger()
): void {
  const capability = refusal.capability.trim();
  if (capability === '') return;

  const report: CapabilityGapReport = {
    gaps: [
      {
        type: 'tool_refusal',
        name: toolRefusalGapName(refusal.tool, capability),
        suggestion: refusal.suggestion,
      },
    ],
    available: { tools: [], experts: [] },
    allSatisfied: false,
  };

  ledger.record(report, context);
}
