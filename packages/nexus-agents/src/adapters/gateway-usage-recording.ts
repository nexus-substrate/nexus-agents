/**
 * Per-call gateway usage recording shared by discovered and fallback models.
 * Verification belongs to this adapter's selection, including during failover.
 * @module adapters/gateway-usage-recording
 */
import type {
  IModelAdapter,
  CompletionRequest,
  CompletionResponse,
  ModelError,
  ModelMetadata,
  Result,
} from '../core/index.js';
import { getTimeProvider } from '../core/index.js';
import type { EndpointArmId } from '../cli-adapters/types-core.js';
import { gatewayCostDetail } from '../cli-adapters/budget-arm-cost.js';
import { recordUsageEvent } from '../learning/usage-log.js';

type UsageRecordingAdapter = IModelAdapter & { readonly gatewayArm: EndpointArmId };

/**
 * Wrap a gateway model adapter so that successful + failed `complete()`
 * calls append a UsageEvent to the on-disk usage log. Stream calls aren't
 * yet instrumented (a future PR can add streaming-aware recording).
 *
 * The returned object preserves the IModelAdapter contract identically;
 * downstream code can't tell the difference except that one extra JSONL
 * line gets written per call. The line is priced by `gatewayArm`'s
 * `NEXUS_GATEWAY_COST` declaration ({@link gatewayCostDetail}, #4392 step 4):
 * an undeclared gateway records `priced: false`, never the model id's vendor
 * list price. Verification is captured at selection time: true only for a
 * discovery match, false after failed discovery, absent when unmeasured.
 * Shared by discovered models and the auto-adapter's single-model SDK fallback.
 */
export function withGatewayUsageRecording(
  inner: IModelAdapter,
  gatewayArm: EndpointArmId,
  modelVerified?: boolean
): UsageRecordingAdapter {
  const wrapped: UsageRecordingAdapter = {
    gatewayArm,
    providerId: inner.providerId,
    modelId: inner.modelId,
    capabilities: inner.capabilities,
    countTokens: (text) => inner.countTokens(text),
    validateConfig: () => inner.validateConfig(),
    stream: (request) => inner.stream(request),
    async complete(request: CompletionRequest): Promise<Result<CompletionResponse, ModelError>> {
      const start = getTimeProvider().now();
      const result = await inner.complete(request);
      const latencyMs = getTimeProvider().now() - start;
      try {
        if (result.ok) {
          const u = result.value.usage;
          // No vendor usage ⇒ nothing to record. Zero-filling here would write
          // a fabricated measurement into the usage log, which is the defect
          // #4439 exists to remove — a lost latency datapoint is the cheaper
          // loss than a false token count.
          if (u === undefined) return result;
          // Declaration-first pricing with provenance (#4165, #4392 step 4):
          // `priced: false` marks the $0 as UNPRICED (unmeasured), not a real $0.
          const cost = gatewayCostDetail(gatewayArm, inner.modelId, u.inputTokens, u.outputTokens);
          recordUsageEvent({
            timestamp: new Date().toISOString(),
            modelId: inner.modelId,
            providerId: inner.providerId,
            inputTokens: u.inputTokens,
            outputTokens: u.outputTokens,
            usdCost: cost.costUsd,
            latencyMs,
            success: true,
            priced: cost.priced,
            ...(modelVerified !== undefined && { modelVerified }),
            ...(cost.priced ? { priceSource: cost.resolvedId } : {}),
          });
        } else {
          recordFailedCall(inner, latencyMs, result.error.code, modelVerified);
        }
      } catch {
        // Telemetry must not break user calls.
      }
      return result;
    },
  };
  attachListModels(wrapped, inner);
  return wrapped;
}

/** The usage line for a failed call: no tokens, no cost — the error code is the datum. */
function recordFailedCall(
  inner: IModelAdapter,
  latencyMs: number,
  errorCode: string,
  modelVerified: boolean | undefined
): void {
  recordUsageEvent({
    timestamp: new Date().toISOString(),
    modelId: inner.modelId,
    providerId: inner.providerId,
    inputTokens: 0,
    outputTokens: 0,
    usdCost: 0,
    latencyMs,
    success: false,
    errorCode,
    ...(modelVerified !== undefined && { modelVerified }),
  });
}

/**
 * (#2540) Forward `listModels` through the wrapper when the inner adapter
 * exposes one. Only attach when defined so the wrapper's `listModels?:`
 * hint stays accurate for the resolver. The inner reference is captured
 * by closure so the forwarded call binds `this` to the inner adapter.
 */
function attachListModels(wrapped: IModelAdapter, inner: IModelAdapter): void {
  const list = inner.listModels?.bind(inner);
  if (list === undefined) return;
  wrapped.listModels = (): Promise<readonly ModelMetadata[]> => list();
}
