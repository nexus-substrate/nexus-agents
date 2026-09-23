/**
 * Audit Hash Chain Producer→Consumer Seam Tests (#5120 Seam 1).
 *
 * Verifies the seam between the production audit logger (`cli-server-audit.ts`)
 * and the audit chain verification tool (`mcp/tools/verify-audit-chain-tool.ts`).
 * Neither side is stubbed: production events are written to disk via
 * `initializeAuditLogger` and read back and verified via `verify_audit_chain`.
 *
 * Prevents drift where the producer writes one filename prefix (e.g. 'audit')
 * and the consumer scans for another (e.g. 'audits'), or where the real producer's
 * hash-chain format diverges from what the verifier expects.
 *
 * @module mcp/tools/verify-audit-chain-seam.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { ILogger } from '../../core/index.js';
import type { AuditEvent } from '../../audit/audit-types.js';
import {
  DEFAULT_AUDIT_FILE_PREFIX,
  initializeAuditLogger,
  shutdownAuditLogger,
  recordStartupComplete,
} from '../../cli-server-audit.js';
import {
  registerVerifyAuditChainTool,
  type VerifyAuditChainResponse,
} from './verify-audit-chain-tool.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-audit-seam-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function createMockLogger(): ILogger {
  const mock: ILogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
    setLevel: vi.fn(),
  };
  (mock.child as ReturnType<typeof vi.fn>).mockReturnValue(mock);
  return mock;
}

function makeSecurityConfig(logDir: string): Parameters<typeof initializeAuditLogger>[0] {
  return {
    allowedPaths: ['./'],
    blockedPatterns: [],
    rateLimit: { enabled: true, requestsPerMinute: 60 },
    audit: {
      enabled: true,
      enableHashChain: true,
      logDir,
      minSeverity: 'info',
      maxFileSizeBytes: 10 * 1024 * 1024,
      maxFiles: 10,
    },
  };
}

/**
 * Invokes the registered verify_audit_chain MCP tool handler on `tmpDir`.
 */
async function callVerifyAuditChain(args: {
  logDir: string;
  filePrefix?: string;
}): Promise<VerifyAuditChainResponse> {
  type Captured =
    ((a: unknown, c: unknown) => Promise<{ content: Array<{ text: string }> }>) | undefined;
  let captured: Captured;
  const server = {
    registerTool: (_n: string, _s: unknown, h: unknown) => {
      captured = h as Captured;
    },
  };
  registerVerifyAuditChainTool(server as never, {} as never);
  if (!captured) {
    throw new Error('Tool was not registered');
  }
  const res = await captured(args, {});
  return JSON.parse(res.content[0]?.text ?? '{}') as VerifyAuditChainResponse;
}

describe('Audit hash chain producer→consumer seam (#5120)', () => {
  it('exports DEFAULT_AUDIT_FILE_PREFIX as "audit"', () => {
    expect(DEFAULT_AUDIT_FILE_PREFIX).toBe('audit');
  });

  it('verifies a real production audit hash chain written by initializeAuditLogger', async () => {
    const logger = createMockLogger();
    const auditLogger = initializeAuditLogger(makeSecurityConfig(tmpDir), logger);
    expect(auditLogger).not.toBeNull();
    if (!auditLogger) return;

    recordStartupComplete(auditLogger, 'production');
    auditLogger.logToolInvocation({
      toolName: 'read_file',
      outcome: 'success',
      actor: { type: 'agent', id: 'agent-1', name: 'WorkerAgent' },
      durationMs: 42,
    });

    await shutdownAuditLogger(auditLogger, logger);

    // Verify disk contains files starting with DEFAULT_AUDIT_FILE_PREFIX
    const files = fs.readdirSync(tmpDir);
    expect(files.length).toBeGreaterThanOrEqual(1);
    expect(files.every((f) => f.startsWith(`${DEFAULT_AUDIT_FILE_PREFIX}-`))).toBe(true);

    // Consumer verification without specifying filePrefix (uses default)
    const result = await callVerifyAuditChain({ logDir: tmpDir });

    expect(result.fileCount).toBeGreaterThanOrEqual(1);
    expect(result.eventCount).toBeGreaterThanOrEqual(3);
    expect(result.skippedLines).toBeUndefined();
    expect(result.unreadableFiles).toBeUndefined();
    expect(result.verification.ok).toBe(true);
    if (result.verification.ok) {
      expect(result.verification.eventCount).toBe(result.eventCount);
      expect(result.verification.notVerified).toBeUndefined();
    }
  });

  it('detects tampering when an event body in a production-written log is modified', async () => {
    const logger = createMockLogger();
    const auditLogger = initializeAuditLogger(makeSecurityConfig(tmpDir), logger);
    expect(auditLogger).not.toBeNull();
    if (!auditLogger) return;

    recordStartupComplete(auditLogger, 'production');
    auditLogger.logToolInvocation({
      toolName: 'read_file',
      outcome: 'success',
      actor: { type: 'agent', id: 'agent-1', name: 'WorkerAgent' },
    });

    await shutdownAuditLogger(auditLogger, logger);

    // Locate the log file
    const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith('.jsonl'));
    expect(files.length).toBeGreaterThanOrEqual(1);
    const logFilePath = path.join(tmpDir, files[0]!);

    // Tamper with the second event in the file
    const lines = fs.readFileSync(logFilePath, 'utf-8').trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(3);
    const event = JSON.parse(lines[1]!) as AuditEvent;
    event.action = 'tampered.action'; // modified action without recalculating hash
    lines[1] = JSON.stringify(event);
    fs.writeFileSync(logFilePath, lines.join('\n') + '\n');

    // Run verifier
    const result = await callVerifyAuditChain({ logDir: tmpDir });

    expect(result.verification.ok).toBe(false);
    if (!result.verification.ok) {
      expect(result.verification.eventIndex).toBe(1);
      expect(result.verification.reason).toBe('hash_mismatch');
    }
  });

  it('detects tampering when previousHash link in a production-written log is corrupted', async () => {
    const logger = createMockLogger();
    const auditLogger = initializeAuditLogger(makeSecurityConfig(tmpDir), logger);
    expect(auditLogger).not.toBeNull();
    if (!auditLogger) return;

    recordStartupComplete(auditLogger, 'production');
    auditLogger.logToolInvocation({
      toolName: 'read_file',
      outcome: 'success',
      actor: { type: 'agent', id: 'agent-1', name: 'WorkerAgent' },
    });

    await shutdownAuditLogger(auditLogger, logger);

    const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith('.jsonl'));
    const logFilePath = path.join(tmpDir, files[0]!);

    // Corrupt previousHash on index 1
    const lines = fs.readFileSync(logFilePath, 'utf-8').trim().split('\n');
    const event = JSON.parse(lines[1]!) as AuditEvent;
    event.previousHash = '0000000000000000000000000000000000000000000000000000000000000000';
    lines[1] = JSON.stringify(event);
    fs.writeFileSync(logFilePath, lines.join('\n') + '\n');

    const result = await callVerifyAuditChain({ logDir: tmpDir });

    expect(result.verification.ok).toBe(false);
    if (!result.verification.ok) {
      expect(result.verification.eventIndex).toBe(1);
      expect(result.verification.reason).toBe('previous_hash_mismatch');
    }
  });

  it('reports notVerified: "empty" when filePrefix does not match production output', async () => {
    const logger = createMockLogger();
    const auditLogger = initializeAuditLogger(makeSecurityConfig(tmpDir), logger);
    expect(auditLogger).not.toBeNull();
    if (!auditLogger) return;

    recordStartupComplete(auditLogger, 'production');
    await shutdownAuditLogger(auditLogger, logger);

    // Call consumer with a mismatched prefix
    const result = await callVerifyAuditChain({
      logDir: tmpDir,
      filePrefix: 'mismatched-prefix',
    });

    expect(result.fileCount).toBe(0);
    expect(result.eventCount).toBe(0);
    expect(result.verification.ok).toBe(true);
    if (result.verification.ok) {
      expect(result.verification.notVerified).toBe('empty');
    }
  });
});
