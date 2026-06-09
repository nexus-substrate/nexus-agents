/**
 * Tests for the `auto-remediate` CLI handler (#3671).
 * With NEXUS_AUTO_REMEDIATE=off the cycle short-circuits → a no-op summary.
 * (Default is now `audit` since #3769 — covered at the resolveAutoRemediateMode
 * + cycle layers; exercising it here would run a real signal/vote cycle.)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleAutoRemediateCommand } from './auto-remediate-command.js';
import type { ParsedCliArgs } from '../cli-types.js';

function args(over: Partial<ParsedCliArgs['options']> = {}): ParsedCliArgs {
  return { command: 'auto-remediate', options: { ...over } } as unknown as ParsedCliArgs;
}

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env['NEXUS_AUTO_REMEDIATE'];
});

describe('handleAutoRemediateCommand', () => {
  it('explicit off: prints an off summary without running a cycle', async () => {
    process.env['NEXUS_AUTO_REMEDIATE'] = 'off';
    const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    await handleAutoRemediateCommand(args());
    const text = out.mock.calls.map((c) => String(c[0])).join('');
    expect(text).toMatch(/auto-remediation \[off\]/);
  });

  it('emits JSON when --format json (explicit off)', async () => {
    process.env['NEXUS_AUTO_REMEDIATE'] = 'off';
    const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    await handleAutoRemediateCommand(args({ format: 'json' }));
    const text = out.mock.calls.map((c) => String(c[0])).join('');
    expect(JSON.parse(text)).toMatchObject({ mode: 'off' });
  });
});
