/**
 * How the dev-pipeline implement stage reports what its expert call did on
 * the host (#6792).
 *
 * The implement expert runs in workspace-edit mode. What it actually changed
 * depends on the arm that served it: a claude CLI arm can edit files in its
 * working directory, while a direct-API or gateway arm runs nothing on the
 * host and only returns text. The stage result and the outcome row say
 * which, so a text-only answer is not presented as an applied change, and
 * edits the CLI's permission layer refused are surfaced rather than lost.
 *
 * @module pipeline/implement-result
 */

import type { ExecutionAccessMode } from '../core/index.js';
import type { ExpertBridgeResult } from './expert-bridge.js';

/**
 * The access mode the implement stage asks for (#6792). The prompt derives
 * from issue text, which may be untrusted, so the code expert may edit files
 * in its working directory but runs no command, fetches nothing and gets no
 * MCP tools, whatever the host's own claude permission settings are.
 */
export const IMPLEMENT_ACCESS_MODE: ExecutionAccessMode = 'workspace-edit';

/** Outcome signal for an implementation the serving arm could only return as text. */
const TEXT_ONLY_SIGNAL = 'implement:text-only';

/** The implement row's own quality signals: text-only, and refused tool calls. */
export function implementQualitySignals(
  r: Pick<ExpertBridgeResult, 'textOnly' | 'permissionDenials'>
): string[] {
  const denials = r.permissionDenials ?? [];
  return [
    ...(r.textOnly === true ? [TEXT_ONLY_SIGNAL] : []),
    ...(denials.length > 0 ? [`implement:permission-denials:${String(denials.length)}`] : []),
  ];
}

/**
 * The stage's result text for a successful call: the expert's text, preceded
 * by a note when nothing was applied to the workspace (a text-only arm) or
 * when the CLI refused some of the expert's tool calls.
 */
export function implementStageText(
  r: Pick<ExpertBridgeResult, 'text' | 'textOnly' | 'permissionDenials' | 'routedArm' | 'cli'>
): string {
  const notes: string[] = [];
  if (r.textOnly === true) {
    notes.push(
      `[Text-only implementation: the serving arm (${r.routedArm ?? r.cli ?? 'unknown'}) ` +
        'runs nothing on the host, so no file was changed. The text below is a proposal, ' +
        'not an applied change.]'
    );
  }
  const denials = r.permissionDenials ?? [];
  if (denials.length > 0) {
    const listed = denials
      .map((d) => (d.filePath !== undefined ? `${d.toolName} ${d.filePath}` : d.toolName))
      .join('; ');
    notes.push(`[Refused by the CLI permission layer (${String(denials.length)}): ${listed}]`);
  }
  return notes.length === 0 ? r.text : `${notes.join('\n')}\n\n${r.text}`;
}
