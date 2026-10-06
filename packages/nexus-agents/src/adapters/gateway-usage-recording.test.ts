import { describe, expect, it, vi } from 'vitest';
import { err, ok, ModelError } from '../core/index.js';
import { fakeGatewayModel } from '../testing/adapters/fake-gateway-model.js';
import { withGatewayUsageRecording } from './gateway-usage-recording.js';
import { recordUsageEvent } from '../learning/usage-log.js';
vi.mock('../learning/usage-log.js', () => ({ recordUsageEvent: vi.fn() }));

describe('gateway usage alias', () => {
  it('replaces a catalogue recording wrapper instead of recording a second outcome', async () => {
    vi.mocked(recordUsageEvent).mockClear();
    const raw = fakeGatewayModel('gpt-5.5');
    const catalog = withGatewayUsageRecording(raw, 'api:openai-compat', true);
    const alias = withGatewayUsageRecording(catalog, 'api:custom-openai', true);
    const result = await alias.complete({ messages: [{ role: 'user', content: 'hello' }] });
    expect(result.ok).toBe(true);
    expect(alias.gatewayArm).toBe('api:custom-openai');
    expect(recordUsageEvent).toHaveBeenCalledTimes(1);
  });

  it('keeps historical attribution on one failed catalogue call', async () => {
    vi.mocked(recordUsageEvent).mockClear();
    const raw = fakeGatewayModel('gpt-5.5');
    vi.mocked(raw.complete).mockResolvedValue(err(new ModelError('TEST gateway refused')));
    const catalog = withGatewayUsageRecording(raw, 'api:openai-compat', true);
    const alias = withGatewayUsageRecording(
      catalog,
      'api:custom-openai',
      true,
      'sdk-custom-openai'
    );
    expect((await alias.complete({ messages: [] })).ok).toBe(false);
    expect(recordUsageEvent).toHaveBeenCalledTimes(1);
    expect(recordUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'sdk-custom-openai',
        success: false,
        modelVerified: true,
      })
    );
  });

  it('does not fabricate a measurement when a successful alias reply has no usage', async () => {
    vi.mocked(recordUsageEvent).mockClear();
    const raw = fakeGatewayModel('gpt-5.5');
    vi.mocked(raw.complete).mockResolvedValue(
      ok({
        content: [{ type: 'text', text: 'unmetered reply' }],
        model: 'gpt-5.5',
        stopReason: 'end_turn',
      })
    );
    const catalog = withGatewayUsageRecording(raw, 'api:openai-compat', true);
    const alias = withGatewayUsageRecording(catalog, 'api:custom-openai', true);
    expect((await alias.complete({ messages: [] })).ok).toBe(true);
    expect(recordUsageEvent).not.toHaveBeenCalled();
  });
});
