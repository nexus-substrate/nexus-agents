/**
 * `run_graph_workflow` graph_execution events must reach the durable chain (#5219).
 *
 * The tool called bare `createAuditTrail()`, so with `enableAuditTrail: true` its
 * records sat in an in-memory array capped at 10,000, evicted oldest-first, and
 * were gone on process exit — never hash-chained, never in `verify_audit_chain`.
 *
 * Three of the four `AuditTrail` construction sites already threaded a durable
 * sink; this one did not, and it bypassed the guard that exists to prevent
 * exactly that: `createDurableAuditTrail` returns `undefined` without a logger
 * so a caller cannot silently receive a non-durable trail.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createDurableAuditTrail } from '../../security/audit-bridge.js';
import type { IAuditLogger } from '../../audit/audit-types.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(HERE, 'run-graph-workflow.ts'), 'utf8');

describe('run_graph_workflow audit durability (#5219)', () => {
  it('routes its trail through createDurableAuditTrail, not bare createAuditTrail', () => {
    // Matched as a call, not a substring: the explanatory comment names the old
    // function to say what was wrong, and a bare `not.toContain` would flag that
    // prose as if it were code.
    expect(SOURCE).toMatch(/createDurableAuditTrail\(auditLogger\)/);
    expect(SOURCE).not.toMatch(/=\s*createGraphAuditBridge\(createAuditTrail\(\)\)/);
  });

  it('declares auditLogger on its deps so the threaded logger is not dropped', () => {
    // buildStandardDeps has passed auditLogger to every standardHandler tool
    // since #4991. This tool discarded it purely because the interface did not
    // declare the field — the plumbing was already there.
    expect(SOURCE).toMatch(/readonly auditLogger\?: IAuditLogger \| undefined/);
  });

  it('warns when a trail was requested but cannot be durable', () => {
    // The run still succeeds, but the caller asked for an audit trail and is not
    // getting one. Silence there is the misreport this fixes.
    expect(SOURCE).toMatch(/enableAuditTrail requested but no durable audit logger/);
  });
});

describe('createDurableAuditTrail contract relied on above', () => {
  it('returns undefined without a logger, so a non-durable trail cannot be silent', () => {
    expect(createDurableAuditTrail(undefined)).toBeUndefined();
  });

  it('returns a trail when a logger is supplied', () => {
    const logger = { log: vi.fn(() => Promise.resolve(undefined)) } as unknown as IAuditLogger;
    expect(createDurableAuditTrail(logger)).toBeDefined();
  });
});
