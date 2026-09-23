/**
 * Cross-process hash-chain continuity (#6546).
 *
 * Real child processes append to ONE log directory through `createAuditLogger`,
 * and the result is judged by the `verify_audit_chain` tool handler itself —
 * the same loader and verifier an operator runs — not by a re-implementation.
 *
 * Before #6546 the second process's first event carried no `previousHash`
 * (sequential), and concurrent processes interleaved two independent chains
 * (fork). Both read as `previous_hash_mismatch`.
 *
 * @module audit/audit-logger-multiprocess.test
 */

import { spawn, type ChildProcess } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerVerifyAuditChainTool } from '../mcp/tools/verify-audit-chain-tool.js';
import type { VerifyAuditChainResponse } from '../mcp/tools/verify-audit-chain-tool.js';
import { createAuditLogger, type AuditLogger } from './audit-logger.js';
import {
  AuditLogConfigSchema,
  type AuditEvent,
  type AuditLogConfig,
  type IAuditStorage,
} from './audit-types.js';

const here = dirname(fileURLToPath(import.meta.url));
const loggerModule = pathToFileURL(resolve(here, 'audit-logger.ts')).href;
const tsxCli = createRequire(import.meta.url).resolve('tsx/cli');

/**
 * One appender. Waits for `go` (when a barrier is given), then logs `count`
 * events, flushing after each one with a small random pause so concurrent
 * appenders genuinely interleave.
 */
const WORKER_SOURCE = `
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAuditLogger } from ${JSON.stringify(loggerModule)};
const [logDir, name, count, barrierDir] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (barrierDir) {
  writeFileSync(join(barrierDir, name + '-ready'), '');
  while (!existsSync(join(barrierDir, 'go'))) await sleep(5);
}
const logger = createAuditLogger({ logDir, flushIntervalMs: 60000 });
for (let i = 0; i < Number(count); i++) {
  logger.log({
    category: 'system',
    severity: 'info',
    outcome: 'success',
    action: 'test.append',
    actor: { type: 'system', id: name + '-' + String(i) },
  });
  await logger.flush();
  if (barrierDir) await sleep(Math.floor(Math.random() * 6));
}
await logger.close();
`;

function exited(child: ChildProcess): Promise<number | null> {
  return new Promise((r) => child.on('close', r));
}

async function waitForFiles(paths: readonly string[], timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!paths.every((p) => existsSync(p))) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${paths.join(', ')}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** Runs the real verify_audit_chain handler over `logDir`. */
async function verifyDir(logDir: string): Promise<VerifyAuditChainResponse> {
  type Captured =
    ((a: unknown, c: unknown) => Promise<{ content: Array<{ text: string }> }>) | undefined;
  let captured: Captured;
  const server = {
    registerTool: (_n: string, _s: unknown, h: unknown) => {
      captured = h as Captured;
    },
  };
  registerVerifyAuditChainTool(server as never, {} as never);
  const noop = (): void => undefined;
  const ctx = { logger: { warn: noop, info: noop, debug: noop, error: noop } };
  const res = await captured?.({ logDir }, ctx);
  return JSON.parse(res?.content[0]?.text ?? '{}') as VerifyAuditChainResponse;
}

function logFiles(logDir: string): string[] {
  return readdirSync(logDir)
    .filter((f) => f.startsWith('audit-') && f.endsWith('.jsonl'))
    .sort();
}

function readEvents(logDir: string, opts: { skipUnparseable?: boolean } = {}): AuditEvent[] {
  const parse = (l: string): AuditEvent[] => {
    try {
      return [JSON.parse(l) as AuditEvent];
    } catch (error) {
      if (opts.skipUnparseable === true) return [];
      throw error;
    }
  };
  return logFiles(logDir).flatMap((f) =>
    readFileSync(join(logDir, f), 'utf-8')
      .split('\n')
      .filter((l) => l.length > 0)
      .flatMap(parse)
  );
}

/** A full config for `logDir`; the flush timer is parked so tests flush explicitly. */
function config(logDir: string): AuditLogConfig {
  return AuditLogConfigSchema.parse({ logDir, flushIntervalMs: 60_000 });
}

describe('AuditLogger hash chain across processes (#6546)', () => {
  let dir: string;
  let logDir: string;
  let worker: string;
  const children: ChildProcess[] = [];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'audit-mp-'));
    logDir = join(dir, 'audit');
    mkdirSync(logDir);
    worker = join(dir, 'appender.mts');
    writeFileSync(worker, WORKER_SOURCE);
  });

  afterEach(() => {
    for (const c of children) c.kill();
    children.length = 0;
    rmSync(dir, { recursive: true, force: true });
  });

  function start(name: string, count: number, barrierDir?: string): ChildProcess {
    const args = [tsxCli, worker, logDir, name, String(count)];
    if (barrierDir !== undefined) args.push(barrierDir);
    const child = spawn(process.execPath, args, { stdio: 'ignore' });
    children.push(child);
    return child;
  }

  async function runToExit(name: string, count: number): Promise<void> {
    expect(await exited(start(name, count))).toBe(0);
  }

  it('a fresh directory starts a genesis chain: first event has no previousHash', async () => {
    await runToExit('A', 3);

    const events = readEvents(logDir);
    expect(events).toHaveLength(3);
    expect(events[0]?.previousHash).toBeUndefined();
    const body = await verifyDir(logDir);
    expect(body.verification).toEqual({ ok: true, eventCount: 3, coverage: expect.anything() });
  }, 60_000);

  it('a second process started after the first exits continues the same chain', async () => {
    await runToExit('A', 3);
    await runToExit('B', 3);

    const events = readEvents(logDir);
    expect(events.map((e) => e.actor.id)).toEqual(['A-0', 'A-1', 'A-2', 'B-0', 'B-1', 'B-2']);
    // The seam: B's first event links to A's last one.
    expect(events[3]?.previousHash).toBe(events[2]?.hash);
    const body = await verifyDir(logDir);
    expect(body.verification.ok).toBe(true);
    expect(body.verification).not.toHaveProperty('unanchoredHead');
    expect(body.eventCount).toBe(6);
  }, 60_000);

  it('N concurrent processes append one verified chain with no fork', async () => {
    const names = ['A', 'B', 'C', 'D'];
    const perProcess = 8;
    const kids = names.map((n) => start(n, perProcess, dir));
    await waitForFiles(names.map((n) => join(dir, `${n}-ready`)));
    writeFileSync(join(dir, 'go'), '');
    const codes = await Promise.all(kids.map(exited));
    expect(codes).toEqual(names.map(() => 0));

    const events = readEvents(logDir);
    expect(events).toHaveLength(names.length * perProcess);
    // Genuine concurrency: the processes' events interleave in the file. A
    // run that happened to serialize whole processes would not exercise the
    // lock, so it is not allowed to pass this test.
    const owners = events.map((e) => e.actor.id.split('-')[0]);
    const runs = owners.filter((o, i) => i === 0 || o !== owners[i - 1]).length;
    expect(runs).toBeGreaterThan(names.length);
    // No fork: every hash is referenced as a predecessor at most once.
    const predecessors = events.map((e) => e.previousHash).filter((h) => h !== undefined);
    expect(new Set(predecessors).size).toBe(predecessors.length);

    const body = await verifyDir(logDir);
    expect(body.verification.ok).toBe(true);
    expect(body.verification).not.toHaveProperty('unanchoredHead');
    expect(body.eventCount).toBe(names.length * perProcess);
  }, 90_000);

  it('continues the chain across a rotation boundary, skipping an empty newest file', async () => {
    await runToExit('A', 2);
    // Put A's file in an earlier second, and leave a newer file that another
    // process rotated to but never wrote: B opens that empty file and must
    // seed from the last event of the file before it.
    const [first] = logFiles(logDir);
    renameSync(join(logDir, first ?? ''), join(logDir, 'audit-2026-01-01-00-00-00.jsonl'));
    writeFileSync(join(logDir, 'audit-2026-01-02-00-00-00.jsonl'), '');

    await runToExit('B', 2);

    expect(readFileSync(join(logDir, 'audit-2026-01-02-00-00-00.jsonl'), 'utf-8')).toContain('B-0');
    const events = readEvents(logDir);
    expect(events.map((e) => e.actor.id)).toEqual(['A-0', 'A-1', 'B-0', 'B-1']);
    expect(events[2]?.previousHash).toBe(events[1]?.hash);
    const body = await verifyDir(logDir);
    expect(body.fileCount).toBe(2);
    expect(body.verification.ok).toBe(true);
    expect(body.verification).not.toHaveProperty('unanchoredHead');
  }, 60_000);

  it('creates its log file synchronously, so the lock holder sees it and does not rotate again', async () => {
    const logger = createAuditLogger(config(logDir));
    try {
      // Before any I/O tick: the write stream opens asynchronously, and a
      // listing that missed the file used to make adoptLatestFile rotate to a
      // second, empty-then-populated file.
      expect(logFiles(logDir)).toHaveLength(1);
    } finally {
      await logger.close();
    }
  });

  it('a live logger follows a newer file another writer rotated to', async () => {
    const a = createAuditLogger(config(logDir));
    const logAs = (l: AuditLogger, id: string): void => {
      l.log({
        category: 'system',
        severity: 'info',
        outcome: 'success',
        action: 'test.append',
        actor: { type: 'system', id },
      });
    };
    try {
      logAs(a, 'A-0');
      await a.flush();
      // Another writer rotates to a newer file and appends to it.
      writeFileSync(join(logDir, 'audit-2099-01-01-00-00-00.jsonl'), '');
      const b = createAuditLogger(config(logDir));
      logAs(b, 'B-0');
      await b.close();
      // A still holds a stream on the older file; its next event must land
      // after B-0, in the newer file, or the file order contradicts the chain.
      logAs(a, 'A-1');
      await a.flush();
    } finally {
      await a.close();
    }

    expect(readEvents(logDir).map((e) => e.actor.id)).toEqual(['A-0', 'B-0', 'A-1']);
    const body = await verifyDir(logDir);
    expect(body.verification.ok).toBe(true);
  });

  it('still detects a tampered or deleted event in a multi-process chain', async () => {
    await runToExit('A', 3);
    await runToExit('B', 3);
    // Precondition, so an edit below cannot miss the events it targets.
    expect(logFiles(logDir)).toHaveLength(1);
    const [file] = logFiles(logDir);
    const path = join(logDir, file ?? '');
    const lines = readFileSync(path, 'utf-8')
      .split('\n')
      .filter((l) => l.length > 0);

    const edited = JSON.parse(lines[3] ?? '{}') as AuditEvent;
    edited.action = 'test.forged';
    writeFileSync(
      path,
      [...lines.slice(0, 3), JSON.stringify(edited), ...lines.slice(4)].join('\n')
    );
    const tampered = await verifyDir(logDir);
    expect(tampered.verification).toMatchObject({
      ok: false,
      reason: 'hash_mismatch',
      eventIndex: 3,
    });

    writeFileSync(path, [...lines.slice(0, 3), ...lines.slice(4)].join('\n') + '\n');
    const deleted = await verifyDir(logDir);
    expect(deleted.verification).toMatchObject({
      ok: false,
      reason: 'previous_hash_mismatch',
      eventIndex: 3,
    });
  }, 60_000);

  it('persists the event as it was at log(), not as the caller later mutated it', async () => {
    const logger = createAuditLogger(config(logDir));
    const actor = { type: 'agent' as const, id: 'original-agent' };
    const metadata: Record<string, unknown> = { note: 'original', nested: { n: 1 } };
    try {
      logger.log({
        category: 'system',
        severity: 'info',
        outcome: 'success',
        action: 'test.append',
        actor,
        metadata,
      });
      // The caller owns these objects and may reuse them after log() returns.
      actor.id = 'forged-agent';
      metadata['note'] = 'forged';
      (metadata['nested'] as { n: number }).n = 2;
      await logger.flush();
    } finally {
      await logger.close();
    }

    const [event] = readEvents(logDir);
    expect(event?.actor.id).toBe('original-agent');
    expect(event?.metadata).toEqual({ note: 'original', nested: { n: 1 } });
    const body = await verifyDir(logDir);
    expect(body.verification.ok).toBe(true);
  });

  it('terminates a torn final line before appending, so no new event is lost', async () => {
    await runToExit('A', 2);
    const [file] = logFiles(logDir);
    const path = join(logDir, file ?? '');
    // A crash mid-write: a partial JSON line with no trailing newline.
    writeFileSync(path, readFileSync(path, 'utf-8') + '{"id":"aud_torn","timest');

    await runToExit('B', 2);

    const lines = readFileSync(path, 'utf-8').split('\n');
    expect(lines).toContain('{"id":"aud_torn","timest');
    const body = await verifyDir(logDir);
    // The torn line stays visible as a skipped line; it is not healed.
    expect(body.skippedLines).toBe(1);
    expect(body.eventCount).toBe(4);
    expect(body.verification.ok).toBe(true);
    const events = readEvents(logDir, { skipUnparseable: true });
    expect(events.map((e) => e.actor.id)).toEqual(['A-0', 'A-1', 'B-0', 'B-1']);
    // The new batch links past the torn line to the last valid event.
    expect(events[2]?.previousHash).toBe(events[1]?.hash);
  }, 60_000);
});

describe('AuditLogger batch requeue around appendChained (#6546)', () => {
  function stubStorage(failures: readonly ('before-seal' | 'after-seal')[]): {
    storage: IAuditStorage;
    written: AuditEvent[];
  } {
    const written: AuditEvent[] = [];
    let call = 0;
    const storage: IAuditStorage = {
      write: () => Promise.resolve(),
      flush: () => Promise.resolve(),
      close: () => Promise.resolve(),
      query: () => Promise.resolve([]),
      appendChained: (seal) => {
        const failure = failures[call++];
        if (failure === 'before-seal') return Promise.reject(new Error('lock timeout'));
        const sealed = seal(undefined);
        if (failure === 'after-seal') return Promise.reject(new Error('write failed'));
        written.push(...sealed);
        return Promise.resolve();
      },
    };
    return { storage, written };
  }

  const input = {
    category: 'system',
    severity: 'info',
    outcome: 'success',
    action: 'test.append',
    actor: { type: 'system', id: 'X' },
  } as const;

  it('keeps a batch that was never sealed (e.g. lock timeout) for the next flush', async () => {
    const { storage, written } = stubStorage(['before-seal']);
    const logger = createAuditLogger(config('/tmp/unused'), storage);
    logger.log(input);
    await expect(logger.flush()).rejects.toThrow('lock timeout');
    expect(written).toHaveLength(0);
    await logger.flush();
    expect(written).toHaveLength(1);
    expect(written[0]?.previousHash).toBeUndefined();
    await logger.close();
  });

  it('does not requeue a batch that was sealed, so a retry cannot duplicate it', async () => {
    const { storage, written } = stubStorage(['after-seal']);
    const logger = createAuditLogger(config('/tmp/unused'), storage);
    logger.log(input);
    await expect(logger.flush()).rejects.toThrow('write failed');
    await logger.flush();
    expect(written).toHaveLength(0);
    await logger.close();
  });

  it('records an unserializable event as a persist failure without throwing from log()', async () => {
    const { storage, written } = stubStorage([]);
    const logger = createAuditLogger(config('/tmp/unused'), storage);
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    expect(() => {
      logger.log({ ...input, metadata: circular });
    }).not.toThrow();
    logger.log(input);
    await logger.flush();
    expect(logger.getPersistFailureCount()).toBe(1);
    expect(written).toHaveLength(1);
    await logger.close();
  });
});
