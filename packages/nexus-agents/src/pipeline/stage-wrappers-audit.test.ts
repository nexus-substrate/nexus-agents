/** Audit target contract: actual wrappers and graph, only remote boundaries replaced. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuditStageRegistry } from './stage-wrappers.js';
import { runGraphPipeline } from './graph-pipeline-runner.js';
import { AUDIT_PIPELINE_TEMPLATE } from './templates.js';
import { getPipelineEventBus } from './event-bus.js';
import type { PipelineEvent } from './event-types.js';
import { PIPELINE_STATE_KEYS as K } from './stage-types.js';
import { normalizeRepoId } from '../mcp/tools/repo-analyze.js';

const remote = vi.hoisted(() => ({
  analyze: vi.fn<(input: { repo: string; depth: 'deep' }) => Promise<unknown>>(),
  scan: vi.fn<(input: { repo: string; maxScanners: number }) => Promise<unknown>>(),
}));
vi.mock('../mcp/tools/repo-analyze.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../mcp/tools/repo-analyze.js')>()),
  analyzeGitHubRepo: remote.analyze,
}));
vi.mock('../mcp/tools/repo-security-plan.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../mcp/tools/repo-security-plan.js')>()),
  generateSecurityPlan: remote.scan,
}));

beforeEach(() => {
  remote.analyze.mockReset().mockResolvedValue({
    language: 'TypeScript',
    framework: null,
    ciProvider: 'github-actions',
    securityTooling: [],
  });
  remote.scan.mockReset().mockResolvedValue({ recommendations: [] });
});

const accepted = [
  ['owner/project', 'owner/project'],
  ['docs/security', 'docs/security'],
  ['audit docs/security', 'docs/security'],
  ['audit owner/project', 'owner/project'],
  ['owner/project.git', 'owner/project.git'],
  ['Audit owner/project.git', 'owner/project.git'],
  ['Audit https://github.com/owner/project', 'owner/project'],
  ['Audit http://github.com/owner/project.git/tree/main?q=1#readme', 'owner/project'],
  ['repo: owner/project /home/william/docs/security.md', 'owner/project'],
  ['repository:owner/project.docs after ./docs/security.md', 'owner/project.docs'],
  ['Audit repo: owner/project.docs after checking ./docs/security.md', 'owner/project.docs'],
  ['repo: owner/project repository: owner/project', 'owner/project'],
  [
    'repo: owner/project https://GITHUB.com/OWNER/PROJECT.git/tree/main?file=a%2fb#readme /home/william/docs/security.md',
    'owner/project',
  ],
  ['Audit (https://github.com/owner/project/tree/main)', 'owner/project'],
  ['Inspect https://example.test/docs and repo: owner/project', 'owner/project'],
  ['repo: owner/project https://example.test/docs/../reference', 'owner/project'],
  ['repo: owner/project ftp://example.test/docs', 'owner/project'],
  ['repo: owner/.github', 'owner/.github'],
  ['repository: owner/.github-private', 'owner/.github-private'],
  ['Audit https://github.com/owner/.github-private', 'owner/.github-private'],
  ['repo: owner/.hidden-repo', 'owner/.hidden-repo'],
  ['Audit https://github.com/owner/.github/tree/main', 'owner/.github'],
  ['Audit https://github.com/%6fwner/%70roject.git/tree/main', 'owner/project'],
  ['repo: owner/project https://github.com/%6fwner/%70roject', 'owner/project'],
] as const;

const refused = [
  '',
  'Audit an artifact without a repository reference',
  'Audit /home/william/git/nexus-substrate/nexus-agents/.nexus-agents/review-artifacts/source.json',
  'Audit C:\\Users\\william\\git\\owner\\project',
  'Audit \\\\server\\share\\owner\\project',
  'Audit ./owner/project',
  'Audit ../owner/project',
  'Audit owner/project/extra',
  'Inspect docs/security.md and/or /home/william/git/repo https://evil.example/x/github.com/owner/repo',
  'Audit docs/security.md',
  'Inspect owner/project for security',
  'xrepo: owner/project',
  'Audit abchttps://github.com/owner/project',
  'Audit https://evil.example/owner/project',
  'Audit https://github.com.evil.example/owner/project',
  'Audit https://github.com@evil.example/owner/project',
  'Audit https://TESTUSER:TESTFAKE_password@github.com/owner/project',
  'Audit https://@github.com/owner/project',
  'repo: owner/project https://@github.com/owner/project',
  'Audit https:/github.com/owner/project',
  'repo: owner/project https:/github.com/other/project',
  'Inspect ftp://evil.example/x?repo:owner/project',
  'Audit https://github.com/owner',
  'Audit https://github.com/owner/project/../other',
  'Audit https://github.com/owner/.%2e/evil/project',
  'Audit https://github.com/owner%2fproject/extra',
  'Audit https://github.com/owner/project%5cother',
  'Audit https://github.com/owner\\project',
  'repo: owner/project https://github.com/owner/project%5cother',
  'repo: owner/project repository: owner/project/extra',
  'repo: owner/project https://github.com/other/project',
  'repo: owner/project repo: other/project',
  'repository:',
  'repo: owner/..',
  'repo: owner/.',
  'Audit https://github.com/owner/%2e',
  'Audit https://github.com/owner/%2e%2e',
  'Audit https://github.com/owner/%252e%252e',
  'Audit https://github.com/owner/%ff',
  'Audit https://github.com/owner/%2g',
  'repo: /owner/project',
  'repo: owner/project?query=1',
] as const;

describe.each(['analyze', 'scan'] as const)('audit %s target selection (#7401)', (stageId) => {
  it.each(accepted)('dispatches supported complete target: %s', async (task, expectedRepo) => {
    const stage = createAuditStageRegistry().get(stageId);
    expect(stage).toBeDefined();
    const result = await stage!.execute({
      executionId: 'audit-contract',
      task,
      templateId: 'audit',
      state: {},
    });
    expect(result.success).toBe(true);
    const calls = stageId === 'analyze' ? remote.analyze.mock.calls : remote.scan.mock.calls;
    expect(calls).toHaveLength(1);
    // Equivalent identities are case-insensitive; whichever harmless casing wins is valid.
    expect(calls[0]?.[0].repo.toLowerCase()).toBe(expectedRepo.toLowerCase());
    expect(calls[0]?.[0]).toMatchObject(
      stageId === 'analyze' ? { depth: 'deep' } : { maxScanners: 10 }
    );
    expect(stageId === 'analyze' ? remote.scan : remote.analyze).not.toHaveBeenCalled();
  });

  it.each(refused)('refuses unsupported, invalid or ambiguous target: %s', async (task) => {
    const seen: PipelineEvent[] = [];
    const unsubscribe = getPipelineEventBus().subscribe({ executionId: `audit-${stageId}` }, (e) =>
      seen.push(e)
    );
    try {
      const stage = createAuditStageRegistry().get(stageId);
      expect(stage).toBeDefined();
      const result = await stage!.execute({
        executionId: 'audit-contract',
        task,
        templateId: 'audit',
        state: {},
      });
      expect(result).toMatchObject({ success: false, value: null });
      expect(result.error).toMatch(/repository|target/i);
      expect(remote.analyze).not.toHaveBeenCalled();
      expect(remote.scan).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
    expect(seen.map((e) => e.type)).toEqual(['stage.started', 'stage.failed']);
  });

  it('retains backend error reporting after valid selection', async () => {
    (stageId === 'analyze' ? remote.analyze : remote.scan).mockRejectedValueOnce(
      new Error('remote fixture unavailable')
    );
    const result = await createAuditStageRegistry().get(stageId)!.execute({
      executionId: 'audit-contract',
      task: 'repo: owner/project',
      templateId: 'audit',
      state: {},
    });
    expect(result).toMatchObject({
      success: false,
      value: null,
      error: 'remote fixture unavailable',
    });
  });
});

describe('audit actual graph failure and completion (#7401)', () => {
  it.each([
    'Audit /home/william/docs/security.md',
    'Audit https://github.com/owner/project/../other',
    'repo: owner/project repo: other/project',
    'Audit an artifact',
  ])('stops before scan/report without claiming successful audit: %s', async (task) => {
    const seen: PipelineEvent[] = [];
    const unsubscribe = getPipelineEventBus().subscribe({}, (e) => seen.push(e));
    const registry = createAuditStageRegistry();
    const report = vi.spyOn(registry.get('report')!, 'execute');
    try {
      const result = await runGraphPipeline(task, AUDIT_PIPELINE_TEMPLATE, registry);
      expect(result.success).toBe(false);
      expect(result.error).toContain('analyze');
      expect(result.finalState[K.COMPLETED]).toBe(false);
      expect(result.finalState[K.RESEARCH]).toBe('');
      expect(result.errorDetail?.[K.RESEARCH]).toBeNull();
      expect(remote.analyze).not.toHaveBeenCalled();
      expect(remote.scan).not.toHaveBeenCalled();
      expect(report).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
    const executionEvents = seen.filter(
      (e): e is Extract<PipelineEvent, { executionId: string }> => 'executionId' in e
    );
    expect(
      executionEvents.filter((e) => e.executionId === 'audit-analyze').map((e) => e.type)
    ).toEqual(['stage.started', 'stage.failed']);
    expect(
      executionEvents.filter((e) => ['audit-scan', 'audit-report'].includes(e.executionId))
    ).toEqual([]);
    expect(
      executionEvents.filter((e) => e.executionId === 'audit-pipeline').map((e) => e.type)
    ).toEqual(['stage.started', 'stage.failed']);
  });

  it('executes analyze, scan and report for an explicit repository beside local artifacts', async () => {
    const result = await runGraphPipeline(
      'Audit repo: owner/project after /home/william/docs/security.md',
      AUDIT_PIPELINE_TEMPLATE,
      createAuditStageRegistry()
    );
    expect(result.success).toBe(true);
    expect(remote.analyze).toHaveBeenCalledExactlyOnceWith({
      repo: 'owner/project',
      depth: 'deep',
    });
    expect(remote.scan).toHaveBeenCalledExactlyOnceWith({ repo: 'owner/project', maxScanners: 10 });
    expect(result.finalState[K.COMPLETED]).toContain('## Security Report');
  });

  it('keeps the direct normalizer semantics, including bare and URL .git differences', () => {
    expect(normalizeRepoId('owner/project.git')).toBe('owner/project.git');
    expect(normalizeRepoId('https://github.com/owner/project.git/tree/main?q=1#readme')).toBe(
      'owner/project'
    );
    expect(normalizeRepoId('docs/security.md')).toBe('docs/security.md');
  });
});
