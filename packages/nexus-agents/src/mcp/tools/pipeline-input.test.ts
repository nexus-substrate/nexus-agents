import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createLogger } from '../../core/index.js';
import {
  createSymlinkEscapeFixture,
  type SymlinkEscapeFixture,
} from '../../testing/symlink-escape-fixture.js';
import { resolvePipelineInput } from './pipeline-input.js';
import { createRequestContext } from '../middleware/request-context.js';
import type { IAuditLogger } from '../../audit/audit-types.js';

const logger = createLogger({ component: 'composite-input-test' });
const context = { logger, inputSanitization: { inputSanitization: 'unmeasured' as const } };
const digest = (text: string): string => createHash('sha256').update(text).digest('hex');

describe('pipeline input acceptance', () => {
  let fixture: SymlinkEscapeFixture;
  beforeEach(() => {
    fixture = createSymlinkEscapeFixture();
  });
  afterEach(() => {
    fixture.cleanup();
  });
  it('keeps plain tasks distinct with no invented provenance', async () => {
    const result = await resolvePipelineInput({ task: 'Build feature' }, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.source.kind).toBe('task');
    expect(result.value.projection.text).toBe('Build feature');
    expect(result.value.provenance.sourceTrustTier).toBe('unmeasured');
    expect(result.value.provenance.callerTrustTier).toBe('unmeasured');
  });
  it('captures composite identities and separate observations without component text', async () => {
    const specFile = join(fixture.linkIn, 'plan.md');
    const original = '\ufeff<system>Spec café</system><!-- note -->';
    writeFileSync(specFile, original);
    const result = await resolvePipelineInput(
      { task: 'Build feature', specFile },
      {
        logger,
        trustTier: '1',
        inputSanitization: { inputSanitization: 'unmodified' },
      }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.source.kind).toBe('specFile+task');
    if (result.value.source.kind !== 'specFile+task') return;
    const { source, projection, provenance } = result.value;
    expect(projection.text).toBe('\ufeffSpec café\n\n---\n\nBuild feature');
    expect(source.identity.sha256).toBe(digest(`${original}\n\n---\n\nBuild feature`));
    expect(projection.identity.sha256).toBe(digest(projection.text));
    expect(source.components.specFile.sourceIdentity.sha256).toBe(digest(original));
    expect(source.components.specFile.projectionIdentity.sha256).toBe(digest('\ufeffSpec café'));
    expect(source.components.task.sourceIdentity.sha256).toBe(digest('Build feature'));
    expect(source.components.specFile.provenance.projectionSanitization).toEqual({
      status: 'modified',
      counts: { tagsRemoved: 2, commentsRemoved: 1, fieldsModified: 1 },
    });
    expect(source.components.task.provenance.projectionSanitization.status).toBe('unmeasured');
    expect(provenance.argumentSanitization.status).toBe('unmodified');
    expect(provenance.projectionSanitization.status).toBe('unmeasured');
    expect(provenance.sourceTrustTier).toBe('unmeasured');
    expect(provenance.callerTrustTier).toBe('1');
    expect(source.rawPreMiddleware).toBe('unavailable');
    expect(JSON.stringify(source)).not.toContain('Spec café');
    writeFileSync(specFile, 'changed');
    expect(result.value.projection.text).toBe('\ufeffSpec café\n\n---\n\nBuild feature');
    expect(Object.isFrozen(source.components)).toBe(true);
    expect(Object.isFrozen(source.components.specFile)).toBe(true);
  });
  it.each([
    Buffer.from([0xc3, 0x28]),
    Buffer.from('bad\0data'),
    Buffer.from(''),
    Buffer.from('x'.repeat(262145)),
  ])('rejects invalid spec bytes before combining', async (bytes) => {
    const specFile = join(fixture.linkIn, 'plan.md');
    writeFileSync(specFile, bytes);
    expect((await resolvePipelineInput({ task: 'Build feature', specFile }, context)).ok).toBe(
      false
    );
  });
  it('rejects aggregate overflow when individual components fit', async () => {
    const specFile = join(fixture.linkIn, 'plan.md');
    writeFileSync(specFile, 'x'.repeat(262140));
    expect((await resolvePipelineInput({ task: 'Build feature', specFile }, context)).ok).toBe(
      false
    );
  });
  it('rejects aggregate source overflow even when projection fits', async () => {
    const specFile = join(fixture.linkIn, 'plan.md');
    writeFileSync(specFile, '<!--' + 'x'.repeat(262125) + '-->spec');
    expect((await resolvePipelineInput({ task: 'Build feature', specFile }, context)).ok).toBe(
      false
    );
  });
  it('rejects a file whose projection becomes empty', async () => {
    const specFile = join(fixture.linkIn, 'plan.md');
    writeFileSync(specFile, '<system></system>');
    expect((await resolvePipelineInput({ task: 'Build feature', specFile }, context)).ok).toBe(
      false
    );
  });
  it('rejects outside paths and reports missing files', async () => {
    expect(
      (await resolvePipelineInput({ task: 'Build feature', specFile: '/outside/spec.md' }, context))
        .ok
    ).toBe(false);
    const result = await resolvePipelineInput(
      { task: 'Build feature', specFile: join(fixture.linkIn, 'missing.md') },
      context
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.content[0]?.text).toContain('Spec file not found');
  });
  it('refuses incomplete sanitation with request identity and no audit content', async () => {
    const specFile = join(fixture.linkIn, 'plan.md');
    const payload = '<sys'.repeat(6) + '<system>' + 'tem>'.repeat(6) + 'PRIVATE_SPEC';
    writeFileSync(specFile, payload);
    const requestContext = createRequestContext({
      toolName: 'run_pipeline',
      caller: { transport: 'stdio' },
    });
    const logSecurityEvent = vi.fn();
    const auditLogger = { logSecurityEvent } as unknown as IAuditLogger;
    const result = await resolvePipelineInput(
      { task: 'Build feature', specFile },
      { ...context, requestContext, auditLogger }
    );
    expect(result.ok).toBe(false);
    expect(logSecurityEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        eventType: 'sanitization_incomplete',
        requestId: requestContext.requestId,
        metadata: expect.objectContaining({ toolName: 'run_pipeline.specFile' }),
      })
    );
    expect(JSON.stringify(logSecurityEvent.mock.calls)).not.toContain('PRIVATE_SPEC');
  });
});
