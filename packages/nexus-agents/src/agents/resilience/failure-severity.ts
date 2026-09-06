/**
 * Confidence → severity for a detected failure.
 *
 * Lives beside the detector rather than inside it because the mapping is the
 * part that broke: it was an object keyed by number, and the enumeration order
 * of an integer-like key is what made one of its levels unreachable. A module
 * of its own keeps the table, its order, and the test on that order together.
 *
 * @module agents/resilience/failure-severity
 */
import type { DetectedFailure } from './failure-types.js';

/**
 * Map a confidence score to a severity level.
 *
 * The previous form was an object keyed by number, walked with
 * `Object.entries` and last-match-wins:
 *
 * ```ts
 * const severityMap: Record<number, Severity> = { 0.3:'low', 0.5:'medium', 0.7:'high', 1.0:'critical' };
 * for (const [t, sev] of Object.entries(severityMap)) if (confidence >= parseFloat(t)) severity = sev;
 * ```
 *
 * `1.0` stringifies to the key `"1"`, which is a canonical array index, and ES
 * property enumeration puts integer-like keys FIRST — the real order is
 * `["1","0.3","0.5","0.7"]`. So at confidence 1 the loop assigned `critical`
 * and then overwrote it with `low`, `medium` and finally `high`. `critical` was
 * unreachable for every possible input, while `FailureSeverity` and its Zod
 * enum both published it as a state a consumer could expect.
 *
 * An ordered array of thresholds cannot develop that defect: the order is the
 * literal's own, and it is the thing under test.
 */
const SEVERITY_THRESHOLDS: readonly (readonly [number, DetectedFailure['severity']])[] = [
  [0.3, 'low'],
  [0.5, 'medium'],
  [0.7, 'high'],
  [1.0, 'critical'],
];

export function severityForConfidence(confidence: number): DetectedFailure['severity'] {
  let severity: DetectedFailure['severity'] = 'low';
  for (const [threshold, level] of SEVERITY_THRESHOLDS) {
    if (confidence >= threshold) severity = level;
  }
  return severity;
}
