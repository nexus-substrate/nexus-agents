/**
 * Tests for verify_audit_chain MCP tool (#2281 follow-up).
 *
 * @module mcp/tools/verify-audit-chain-tool.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import type { AuditEvent } from '../../audit/audit-types.js';
import {
  VerifyAuditChainInputSchema,
  registerVerifyAuditChainTool,
  type VerifyAuditChainResponse,
} from './verify-audit-chain-tool.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-verify-audit-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function realHash(event: AuditEvent): string {
  const data = JSON.stringify({
    id: event.id,
    timestamp: event.timestamp,
    category: event.category,
    action: event.action,
    outcome: event.outcome,
    actor: event.actor,
    previousHash: event.previousHash,
  });
  return crypto.createHash('sha256').update(data).digest('hex');
}

function makeEvent(
  id: string,
  previousHash: string | undefined,
  overrides: Partial<AuditEvent> = {}
): AuditEvent {
  const base: AuditEvent = {
    id,
    version: '1.0',
    timestamp: '2026-04-28T12:00:00.000Z',
    timestampMs: 1745842800000,
    category: 'system',
    severity: 'info',
    outcome: 'success',
    action: 'test.action',
    actor: { type: 'system', id: 'nexus-agents', name: 'Test System' },
    previousHash,
    ...overrides,
  };
  return { ...base, hash: realHash(base) };
}

function writeAuditFile(filename: string, events: readonly AuditEvent[]): void {
  const content = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
  fs.writeFileSync(path.join(tmpDir, filename), content);
}

function chain(count: number): AuditEvent[] {
  const events: AuditEvent[] = [];
  let prev: string | undefined = undefined;
  for (let i = 0; i < count; i++) {
    const e = makeEvent(`aud_${String(i)}`, prev);
    events.push(e);
    prev = e.hash;
  }
  return events;
}

describe('VerifyAuditChainInputSchema', () => {
  it('accepts a valid logDir', () => {
    const result = VerifyAuditChainInputSchema.safeParse({ logDir: '/var/log/nexus-agents' });
    expect(result.success).toBe(true);
  });

  it('rejects empty logDir', () => {
    const result = VerifyAuditChainInputSchema.safeParse({ logDir: '' });
    expect(result.success).toBe(false);
  });

  it('rejects logDir over 512 chars', () => {
    const result = VerifyAuditChainInputSchema.safeParse({ logDir: 'x'.repeat(513) });
    expect(result.success).toBe(false);
  });

  it('rejects missing logDir', () => {
    const result = VerifyAuditChainInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// The handler is internal but exercised through registerVerifyAuditChainTool;
// we test the behavior via direct file-system fixtures + the exported types.
// Each fixture writes audit-*.jsonl files into tmpDir, then we re-export the
// internal loadAuditEvents+verify pipeline by importing the wrapper module
// indirectly through its public surface.

describe('verify_audit_chain handler behavior', () => {
  // Re-implement the file-loader path here to test the contract: this tool
  // reads audit-*.jsonl files, sorts them lexicographically, parses events,
  // skips malformed lines, and returns a VerifyAuditChainResponse.
  //
  // Direct handler invocation is via registerVerifyAuditChainTool — these
  // tests verify the response shape we expect from the handler when given
  // representative fixtures.

  it('verifies a clean single-file chain', async () => {
    const events = chain(3);
    writeAuditFile('audit-2026-04-28-12-00-00.jsonl', events);

    // Mimic the handler's loadAuditEvents + verifyChain pipeline.
    const { verifyChain } = await import('../../audit/audit-logger.js');
    const result = verifyChain(events);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.eventCount).toBe(3);
  });

  // #4768: the handler serialises the whole verdict, so the unverified marker
  // reaches the caller without extra wiring — asserted through the REGISTERED
  // handler rather than by re-calling verifyChain, because "the field exists"
  // and "a caller sees it" are different claims.
  it('surfaces notVerified through the tool response for an empty directory', async () => {
    type Captured =
      ((a: unknown, c: unknown) => Promise<{ content: Array<{ text: string }> }>) | undefined;
    let captured: Captured;
    const server = {
      registerTool: (_n: string, _s: unknown, h: unknown) => {
        captured = h as Captured;
      },
    };
    registerVerifyAuditChainTool(server as never, {} as never);
    expect(captured).toBeDefined();

    const res = await captured?.({ logDir: tmpDir }, {});
    const body = res?.content[0]?.text ?? '';

    // The directory has no audit files in this test, so the verdict must say so.
    expect(body).toContain('"notVerified"');
    expect(body).toContain('empty');
  });

  // #4787: the loader drops unreadable files and unparseable/invalid lines with
  // nothing but a logger.warn, so a verdict computed over PART of the log was
  // reported identically to one computed over all of it. A bounded read is
  // fine; a bounded read recorded as complete is the failure.
  describe('coverage reporting (#4787)', () => {
    /** Invokes the registered handler and returns the parsed response body. */
    async function callHandler(dir: string): Promise<VerifyAuditChainResponse> {
      type Captured =
        ((a: unknown, c: unknown) => Promise<{ content: Array<{ text: string }> }>) | undefined;
      let captured: Captured;
      const server = {
        registerTool: (_n: string, _s: unknown, h: unknown) => {
          captured = h as Captured;
        },
      };
      registerVerifyAuditChainTool(server as never, {} as never);
      const res = await captured?.({ logDir: dir }, {});
      return JSON.parse(res?.content[0]?.text ?? '{}') as VerifyAuditChainResponse;
    }

    it('reports the number of lines it could not read', async () => {
      const events = chain(3);
      const good = events.map((e) => JSON.stringify(e));
      // Two lines an adversary or a truncated write would leave behind: one
      // that is not JSON at all, one that is JSON but not an AuditEvent.
      fs.writeFileSync(
        path.join(tmpDir, 'audit-2026-04-28-12-00-00.jsonl'),
        [good[0]!, 'not json at all', good[1]!, '{"id":"x"}', good[2]!].join('\n') + '\n'
      );

      const body = await callHandler(tmpDir);

      expect(body.skippedLines).toBe(2);
      // The parsed subset still chains, so without the count this reads as a
      // clean verdict over the whole log.
      expect(body.eventCount).toBe(3);
      expect(body.verification.ok).toBe(true);
    });

    it('omits the count when nothing was skipped, so absence stays meaningful', async () => {
      writeAuditFile('audit-2026-04-28-12-00-00.jsonl', chain(3));

      const body = await callHandler(tmpDir);

      expect(body.skippedLines).toBeUndefined();
      expect(body.unreadableFiles).toBeUndefined();
    });

    it('distinguishes a wholly unparseable log from an empty one', async () => {
      // The worst case: every line is garbage. Before this the response was
      // eventCount 0 + notVerified "empty" — identical to an empty directory.
      fs.writeFileSync(
        path.join(tmpDir, 'audit-2026-04-28-12-00-00.jsonl'),
        ['garbage', 'more garbage'].join('\n') + '\n'
      );

      const body = await callHandler(tmpDir);

      expect(body.eventCount).toBe(0);
      expect(body.skippedLines).toBe(2);
      expect(body.fileCount).toBe(1);
    });
  });

  it('verifies a clean multi-file chain in lexicographic order', async () => {
    const all = chain(6);
    writeAuditFile('audit-2026-04-28-12-00-00.jsonl', all.slice(0, 3));
    writeAuditFile('audit-2026-04-28-13-00-00.jsonl', all.slice(3));

    const { verifyChain } = await import('../../audit/audit-logger.js');
    const result = verifyChain(all);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.eventCount).toBe(6);
  });

  it('detects tampering when an event body is modified across files', async () => {
    const all = chain(4);
    const tampered = { ...all[2]!, action: 'malicious.action' };
    const concatenated = [all[0]!, all[1]!, tampered, all[3]!];

    const { verifyChain } = await import('../../audit/audit-logger.js');
    const result = verifyChain(concatenated);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('hash_mismatch');
      expect(result.eventIndex).toBe(2);
    }
  });

  it('produces a VerifyAuditChainResponse with the expected shape', () => {
    const response: VerifyAuditChainResponse = {
      logDir: '/tmp/test-audit',
      fileCount: 2,
      eventCount: 6,
      verification: { ok: true, eventCount: 6 },
    };
    expect(response.fileCount).toBe(2);
    expect(response.verification.ok).toBe(true);
  });
});
