/**
 * A fake gateway model adapter for family-slot tests (#6604): it answers at
 * the adapter boundary with its own id, so a test can see WHICH gateway model
 * served a call without any network.
 *
 * @module testing/adapters/fake-gateway-model
 */

import { vi } from 'vitest';
import { ok, type IModelAdapter } from '../../core/index.js';

/** Build a fake gateway model; `gatewayArm` marks it as a gateway-arm model. */
export function fakeGatewayModel(modelId: string, gatewayArm?: string): IModelAdapter {
  return {
    providerId: 'openai',
    modelId,
    capabilities: [],
    complete: vi.fn(() =>
      Promise.resolve(
        ok({
          content: [{ type: 'text' as const, text: `served by ${modelId}` }],
          model: modelId,
          stopReason: 'end_turn' as const,
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        })
      )
    ),
    stream: vi.fn(),
    countTokens: vi.fn(() => Promise.resolve(1)),
    validateConfig: () => ok(undefined),
    ...(gatewayArm !== undefined && { gatewayArm }),
  };
}
