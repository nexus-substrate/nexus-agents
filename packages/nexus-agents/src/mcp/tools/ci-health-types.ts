/**
 * Shared CI-health value/types — the leaf that breaks the
 * `ci-health-check-tool` ↔ `ci-health-log` import cycle (#3756).
 *
 * `ci-health-log` needs `CiHealthStatusSchema` at module-eval time (its
 * `CiHealthEventSchema` references it), and `ci-health-check-tool` imports
 * `ci-health-log`'s appenders — so defining the schema on the tool made the two
 * modules mutually dependent, and under tsx ESM evaluation the tool's import of
 * the log ran first, leaving `CiHealthStatusSchema` in the TDZ
 * (`ReferenceError: Cannot access 'CiHealthStatusSchema' before initialization`).
 * Hosting the shared schema/types here (imports only zod) makes both modules
 * depend on a leaf instead of each other.
 *
 * @module mcp/tools/ci-health-types
 */

import { z } from 'zod';

/** Combined health verdict. `degraded` means partial — operator can still ship with caution. */
export const CiHealthStatusSchema = z.enum(['healthy', 'degraded', 'outage', 'unknown']);
export type CiHealthStatus = z.infer<typeof CiHealthStatusSchema>;

/** Per-signal evidence the tool returns alongside the combined verdict. */
export interface CiHealthSignal {
  readonly source: 'github-status' | 'repo-activity-window';
  readonly status: CiHealthStatus;
  readonly evidence: string;
}
