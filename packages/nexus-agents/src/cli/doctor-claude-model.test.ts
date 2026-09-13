/**
 * Doctor's pinned claude model probe (#6120).
 *
 * `doctor` passed on a host whose pinned voter model was out of usage
 * credits, because it checked the CLI's presence and auth and inferred the
 * model from that. This probe measures the model: one short request, with
 * the adapter's in-family fallback disabled so a sibling cannot answer for it.
 *
 * @module cli/doctor-claude-model.test
 */

import { describe, expect, it, vi } from 'vitest';

import {
  probeClaudePinnedModel,
  formatClaudeModelLine,
  type ClaudeModelProbeTarget,
} from './doctor-claude-model.js';
import { IN_FAMILY_FALLBACK_OPTION } from '../cli-adapters/adapters/claude-adapter.js';

const OUT_OF_CREDITS =
  "You're out of usage credits. Switch to another model, or manage usage credits at claude.ai/settings/usage, to continue. (stop_reason: stop_sequence)";

function target(
  outcome: Awaited<ReturnType<ClaudeModelProbeTarget['execute']>>
): ClaudeModelProbeTarget & { execute: ReturnType<typeof vi.fn> } {
  return { execute: vi.fn(() => Promise.resolve(outcome)) };
}

describe('probeClaudePinnedModel (#6120)', () => {
  it('reports out-of-credits from the adapter error, naming the pinned alias', async () => {
    const adapter = target({ ok: false, error: { message: OUT_OF_CREDITS } });

    const probe = await probeClaudePinnedModel({ installed: true, alias: 'fable', adapter });

    expect(probe).toEqual({
      alias: 'fable',
      status: 'out-of-credits',
      reason: OUT_OF_CREDITS,
    });
  });

  it('disables the in-family fallback so a sibling model cannot answer for the pinned one', async () => {
    const adapter = target({ ok: true, value: { text: 'ok' } });

    await probeClaudePinnedModel({ installed: true, alias: 'fable', adapter });

    const [task] = adapter.execute.mock.calls[0] as [{ options?: Record<string, unknown> }];
    expect(task.options?.[IN_FAMILY_FALLBACK_OPTION]).toBe(false);
  });

  it('reports available only when content came back', async () => {
    const served = await probeClaudePinnedModel({
      installed: true,
      alias: 'sonnet',
      adapter: target({ ok: true, value: { text: 'ok' } }),
    });
    expect(served).toEqual({ alias: 'sonnet', status: 'available', reason: null });

    const empty = await probeClaudePinnedModel({
      installed: true,
      alias: 'sonnet',
      adapter: target({ ok: true, value: { text: '   ' } }),
    });
    expect(empty.status).toBe('error');
    expect(empty.reason).toContain('no content');
  });

  it('reports a non-capacity failure as error with the adapter message', async () => {
    const probe = await probeClaudePinnedModel({
      installed: true,
      alias: 'fable',
      adapter: target({ ok: false, error: { message: 'Not logged in' } }),
    });

    expect(probe).toEqual({ alias: 'fable', status: 'error', reason: 'Not logged in' });
  });

  it('reports a thrown probe as error rather than letting doctor crash', async () => {
    const probe = await probeClaudePinnedModel({
      installed: true,
      alias: 'fable',
      adapter: { execute: () => Promise.reject(new Error('spawn EACCES')) },
    });

    expect(probe.status).toBe('error');
    expect(probe.reason).toContain('spawn EACCES');
  });

  it('names the pinned model by its CLI alias — what --model is given — by default', async () => {
    const probe = await probeClaudePinnedModel({ installed: false });

    // Registry default for claude is claude-fable-5, requested as `fable`.
    expect(probe.alias).toBe('fable');
  });

  it('does not probe when the CLI is absent, and says so', async () => {
    const adapter = target({ ok: true, value: { text: 'ok' } });

    const probe = await probeClaudePinnedModel({ installed: false, alias: 'fable', adapter });

    expect(adapter.execute).not.toHaveBeenCalled();
    expect(probe).toEqual({
      alias: 'fable',
      status: 'not-probed',
      reason: 'claude CLI not installed',
    });
  });
});

describe('formatClaudeModelLine (#6120)', () => {
  it.each([
    ['available', 'Claude model fable: available'],
    ['out-of-credits', 'Claude model fable: out of credits'],
    ['error', 'Claude model fable: error'],
    ['not-probed', 'Claude model fable: not probed'],
  ] as const)('renders %s', (status, expected) => {
    const line = formatClaudeModelLine({ alias: 'fable', status, reason: null });
    expect(line).toContain(expected);
  });

  it('appends the reason when there is one', () => {
    const line = formatClaudeModelLine({
      alias: 'fable',
      status: 'out-of-credits',
      reason: OUT_OF_CREDITS,
    });
    expect(line).toContain('out of usage credits');
  });
});
