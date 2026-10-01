/** Non-billing measurements stored beside usage events, never added to cost totals. */
export interface UsageMeasurement {
  kind: 'measurement';
  event: 'voter_late_settlement';
  timestamp: string;
  role: string;
  cli: string;
  model?: string | undefined;
  msAfterDeadline: number;
  settled: 'ok' | 'error';
  settledBy: 'abort' | 'adapter';
  usage?:
    | {
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
        cachedInputTokens?: number;
        cacheCreationInputTokens?: number;
      }
    | undefined;
  stdoutBytes?: number | undefined;
  sawFirstByte?: boolean | undefined;
}
