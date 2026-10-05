import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('retired access-policy API (#6319)', () => {
  it('does not publish ClawGuardViolationEvent or include it in AuditEvent', () => {
    const source = readFileSync(new URL('../../security/audit-trail.ts', import.meta.url), 'utf8');
    expect(source).not.toContain('ClawGuardViolationEvent');
  });

  it('does not declare an audit logger in ExecuteExpertDeps', () => {
    const source = readFileSync(new URL('./execute-expert.ts', import.meta.url), 'utf8');
    const declaration = source.match(/export interface ExecuteExpertDeps[^]*?\n}/)?.[0];
    expect(declaration).toBeDefined();
    expect(declaration).not.toContain('auditLogger');
  });

  it('does not declare an audit logger in OrchestrateDeps', () => {
    const source = readFileSync(new URL('./orchestrate-types.ts', import.meta.url), 'utf8');
    const declaration = source.match(/export interface OrchestrateDeps[^]*?\n}/)?.[0];
    expect(declaration).toBeDefined();
    expect(declaration).not.toContain('auditLogger');
  });
});
