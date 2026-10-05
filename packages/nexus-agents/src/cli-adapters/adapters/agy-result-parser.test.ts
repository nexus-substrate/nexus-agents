/** Replays stdout through execute(), including the real process exit code. */
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { Readable, Writable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiCliAdapter } from './gemini-adapter.js';

const processResult = vi.hoisted(() => ({ stdout: '' }));
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawn: vi.fn(() => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new Readable({ read() {} }),
      stderr: new Readable({ read() {} }),
      stdin: new Writable({
        write(_chunk, _encoding, callback) {
          callback();
        },
      }),
      kill: vi.fn(),
      exitCode: null as number | null,
      signalCode: null,
    });
    setImmediate(() => {
      child.stdout.push(processResult.stdout);
      child.stdout.push(null);
      child.stderr.push(null);
      child.exitCode = 0;
      child.emit('close', 0);
    });
    return child;
  }),
}));

function fixture(name: string): string {
  return readFileSync(new URL(`../parsers/fixtures/${name}`, import.meta.url), 'utf8');
}

describe('agy execute uses AgyResponseParser (#7073)', () => {
  let adapter: GeminiCliAdapter | undefined;
  afterEach(async () => {
    await adapter?.dispose();
  });

  async function execute(stdout: string): Promise<boolean> {
    processResult.stdout = stdout;
    adapter = new GeminiCliAdapter({ enableCircuitBreaker: false });
    const result = await adapter.execute(
      { content: 'Reply with the single word ok' },
      {
        allowRetry: false,
      }
    );
    return result.ok;
  }

  // Existing live captures: agy v1.1.9, 2026-08-09, agy-parser.test.ts;
  // session id sanitized; error capture really exited 0.
  it('replays the sanitized existing live success capture', async () => {
    expect(await execute(fixture('agy-success.capture.json'))).toBe(true);
  });
  it('replays the existing live error capture despite exit 0', async () => {
    expect(await execute(fixture('agy-error.capture.json'))).toBe(false);
  });
  it('rejects fenced JSON without SUCCESS that the old plaintext bypass accepted', async () => {
    // Derived, unverified live: #7073 removes the shared >=30-character bypass.
    // Unlike bare {response: 'ok'}, this was accepted by the old adapter.
    expect(await execute('```json\n{"response":"a complete looking response"}\n```')).toBe(false);
  });
  it('rejects plaintext without SUCCESS: documented-format, unverified against a live capture', async () => {
    // documented-format, unverified against a live capture.
    expect(await execute('A complete looking plaintext response without a success marker')).toBe(
      false
    );
  });
});
