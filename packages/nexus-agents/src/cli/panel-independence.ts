/**
 * Reporting for consensus-panel model independence (#4983).
 *
 * Split from `voter-agents` so the verdict-to-log rendering is testable
 * without standing up a vote, and so the two call sites — assignment time and
 * after the votes are in — render the same verdict the same way.
 *
 * @module cli/panel-independence
 */

import type { ILogger, IModelAdapter } from '../core/index.js';
import { assessPanelIndependence } from '../config/model-equivalence.js';
import type { PanelIndependence } from '../config/model-equivalence.js';

/**
 * When the check runs. Adapter detection is lazy (#811), so at `assignment`
 * every CLI adapter still reports a placeholder and an unmeasured verdict is
 * expected. By `post-vote` each has resolved, so unmeasured means the panel
 * finished without anyone being able to say whether its members were
 * independent — which is worth a warning.
 */
export type PanelCheckPhase = 'assignment' | 'post-vote';

/**
 * Classifies the panel from its adapters' model ids and logs the verdict.
 *
 * A single-role panel cannot correlate with itself, so nothing is reported.
 */
export function reportPanelIndependence(
  adapters: readonly IModelAdapter[],
  roleCount: number,
  phase: PanelCheckPhase,
  logger: ILogger
): void {
  if (roleCount <= 1) return;
  const verdict: PanelIndependence = assessPanelIndependence(adapters.map((a) => a.modelId));

  if (verdict.kind === 'collapsed') {
    logger.warn('Consensus panel ran on ONE model — votes may correlate', {
      model: verdict.model,
      roleCount,
      phase,
    });
    return;
  }
  if (verdict.kind === 'diverse') {
    logger.debug('Consensus panel spans distinct models', {
      distinctModels: verdict.distinct,
      roleCount,
      phase,
    });
    return;
  }
  const context = { unresolved: verdict.unresolved, total: verdict.total, roleCount };
  if (phase === 'post-vote') {
    logger.warn(
      'Panel independence UNMEASURED after voting — cannot say whether votes correlate',
      context
    );
    return;
  }
  logger.debug(
    'Panel independence not yet measurable (adapters have not detected their model)',
    context
  );
}
