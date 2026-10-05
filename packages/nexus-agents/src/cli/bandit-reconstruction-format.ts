/** Honest, bounded-width provenance labels for reconstructed CLI bandits. */
import type { BanditReconstruction } from '../cli-adapters/bandit-warm-start.js';

export function formatBanditReconstruction(reconstruction: BanditReconstruction): string[] {
  const lines = [
    reconstruction.status === 'failed'
      ? 'reconstruction failed at'
      : 'reconstructed from the outcome store at',
    reconstruction.reconstructedAt,
    `(${String(reconstruction.outcomesReplayed)} outcomes replayed, window ${String(reconstruction.lookbackDays)}d; ${String(reconstruction.empiricalOutcomesReplayed)} empirical)`,
    "— not the live router's in-memory state; see #7057",
    reconstruction.status === 'failed'
      ? 'Specialization priors unavailable or partial.'
      : 'Specialization priors included (synthetic).',
  ];
  if (reconstruction.empiricalOutcomesReplayed === 0) {
    lines.push('no empirical outcomes replayed in the recent window');
  } else {
    lines.push(
      `${String(reconstruction.empiricalOutcomesReplayed)} empirical outcomes replayed in the recent window`
    );
  }
  if (reconstruction.fallbackUsed) {
    lines.push(
      `Legacy all-time fallback replay: ${String(reconstruction.fallbackOutcomesReplayed)} outcomes`,
      '(may include generated synthetic outcomes)'
    );
  }
  if (reconstruction.status === 'failed')
    lines.push('Partial state only; reconstruction is unmeasured.');
  return lines;
}
