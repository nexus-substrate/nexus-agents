/** Run-layer consensus verdict enforcement (#4464). */
export type ConsensusEnforcementMode = 'off' | 'audit' | 'enforce';

/** Unset or invalid values use the non-blocking audit default. */
export function resolveConsensusEnforcementMode(raw: string | undefined): ConsensusEnforcementMode {
  if (raw === 'off') return 'off';
  if (raw === 'enforce') return 'enforce';
  return 'audit';
}
