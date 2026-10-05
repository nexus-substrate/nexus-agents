/** Pure grading of existing CLI evidence; admission consumes the block verdict (#7069). */
import type { AuthProbeResult } from '../cli/cli-auth-probe.js';
import type { CliName } from './types.js';

/** State-only callers remain supported; absent provenance never earns a rung. */
export type AuthEvidenceInput = Pick<AuthProbeResult, 'state'> & {
  readonly cli?: CliName;
  readonly via?: 'env-var' | 'cli-credentials';
};

/**
 * Orders local authentication evidence, not remote authentication strength:
 * - none: no positive evidence with known provenance (including agy unknown).
 * - artifact: probeCli's Claude credential inspection or Claude/Codex env presence.
 * - probe: probeCli's Codex login status or OpenCode auth list assertion;
 *   BaseCliAdapter.authStatus delegates to those same producers.
 *
 * No completed rung: admission callers supply no OutcomeStore history. In
 * particular, cliSource=executed does not establish a CLI completion (see
 * learning/distiller-eligibility). No probe or completion is issued here.
 */
type AuthEvidenceRung = 'none' | 'artifact' | 'probe';

interface AuthEvidence {
  readonly rung: AuthEvidenceRung;
  /** Preserve unknown/error/negative probe results alongside the evidence rung. */
  readonly probeState: AuthProbeResult['state'];
  /** Local probe provenance, including rejected artifact inspection versus CLI rejection. */
  readonly source: 'none' | 'artifact' | 'cli';
  /** The input probe reported authenticated; never an admission or remote-auth assertion. */
  readonly passed: boolean;
  /** Today's policy: needs-login and not-installed block, including stale Claude artifacts. */
  readonly blocks: boolean;
}

function probeSource(auth: AuthEvidenceInput): AuthEvidence['source'] {
  if (auth.state === 'unknown' || auth.state === 'not-installed') return 'none';
  if (auth.state === 'authenticated') {
    if (auth.via === 'env-var') return 'artifact';
    if (auth.via !== 'cli-credentials') return 'none';
  }
  if (auth.cli === 'claude') return 'artifact';
  if (auth.cli === 'codex' || auth.cli === 'opencode') return 'cli';
  return 'none';
}

/**
 * Grade only supplied auth evidence. Negative probe states retain their
 * block verdict independently of the evidence source. Agy unknown is
 * admitted optimistically by the consumer but never recorded as a probe pass.
 */
export function resolveAuthEvidence(auth: AuthEvidenceInput): AuthEvidence {
  const source = probeSource(auth);
  const passed = auth.state === 'authenticated';
  let rung: AuthEvidenceRung = 'none';
  if (passed && source !== 'none') rung = source === 'artifact' ? 'artifact' : 'probe';
  return {
    rung,
    probeState: auth.state,
    source,
    passed,
    blocks: auth.state === 'needs-login' || auth.state === 'not-installed',
  };
}
