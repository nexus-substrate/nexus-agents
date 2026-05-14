/**
 * Tests for the MCP tool prerequisite gates (#2652).
 *
 * @module mcp/middleware/tool-prerequisites.test
 */

import { describe, it, expect, vi } from 'vitest';
import {
  applyPrerequisite,
  withPrerequisite,
  TOOL_PREREQUISITES,
  NO_PREREQUISITE,
  type ToolPrerequisite,
} from './tool-prerequisites.js';
import { parseToolErrorEnvelope } from '../error-envelope.js';
import type { ToolResult } from '../tools/tool-result.js';

const okResult: ToolResult = { content: [{ type: 'text', text: 'ran' }] };

function prereq(
  overrides: Partial<ToolPrerequisite> & Pick<ToolPrerequisite, 'check'>
): ToolPrerequisite {
  return { name: 'test-precondition', rationale: 'test rationale', ...overrides };
}

describe('applyPrerequisite', () => {
  it('runs the handler when the predicate passes', async () => {
    const handler = vi.fn(() => Promise.resolve(okResult));
    const guarded = applyPrerequisite('t', prereq({ check: () => ({ ok: true }) }), handler);
    const result = await guarded({});
    expect(handler).toHaveBeenCalledOnce();
    expect(result).toBe(okResult);
  });

  it('blocks with a permission envelope when the predicate fails', async () => {
    const handler = vi.fn(() => Promise.resolve(okResult));
    const guarded = applyPrerequisite(
      'memory_write',
      prereq({
        name: 'data-dir-writable',
        check: () => ({ ok: false, remediation: 'fix the dir' }),
      }),
      handler
    );
    const result = await guarded({});
    expect(handler).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    const envelope = parseToolErrorEnvelope(result._meta);
    expect(envelope?.errorCategory).toBe('permission');
    expect(envelope?.detail).toMatchObject({
      failedPrerequisite: 'data-dir-writable',
      remediation: 'fix the dir',
    });
  });

  it('fails closed when the predicate throws', async () => {
    const handler = vi.fn(() => Promise.resolve(okResult));
    const guarded = applyPrerequisite(
      't',
      prereq({
        check: () => {
          throw new Error('boom');
        },
      }),
      handler
    );
    const result = await guarded({});
    expect(handler).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    const envelope = parseToolErrorEnvelope(result._meta);
    expect(envelope?.errorCategory).toBe('permission');
    expect(String(envelope?.detail?.['remediation'])).toContain('threw');
  });

  it('awaits async predicates', async () => {
    const handler = vi.fn(() => Promise.resolve(okResult));
    const guarded = applyPrerequisite(
      't',
      prereq({ check: () => Promise.resolve({ ok: false }) }),
      handler
    );
    const result = await guarded({});
    expect(result.isError).toBe(true);
  });
});

describe('withPrerequisite', () => {
  it('passes an unguarded tool straight through (same reference)', () => {
    const handler = (): Promise<ToolResult> => Promise.resolve(okResult);
    expect(withPrerequisite('not_a_guarded_tool', handler)).toBe(handler);
  });

  it('wraps a guarded tool', () => {
    const handler = (): Promise<ToolResult> => Promise.resolve(okResult);
    expect(withPrerequisite('memory_write', handler)).not.toBe(handler);
  });
});

describe('prerequisite registry coverage', () => {
  it('the three Epic B representative tools are guarded', () => {
    expect(TOOL_PREREQUISITES['improvement_review']).toBeDefined();
    expect(TOOL_PREREQUISITES['memory_write']).toBeDefined();
    expect(TOOL_PREREQUISITES['registry_import']).toBeDefined();
  });

  it('a tool is in exactly one of TOOL_PREREQUISITES / NO_PREREQUISITE', () => {
    for (const name of Object.keys(TOOL_PREREQUISITES)) {
      expect(NO_PREREQUISITE[name]).toBeUndefined();
    }
  });

  it('every prerequisite has a name and rationale', () => {
    for (const [tool, p] of Object.entries(TOOL_PREREQUISITES)) {
      expect(p.name, tool).toBeTruthy();
      expect(p.rationale, tool).toBeTruthy();
    }
  });
});
