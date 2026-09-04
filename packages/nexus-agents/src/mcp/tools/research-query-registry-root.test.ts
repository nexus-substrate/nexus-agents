/**
 * Seam test for #5053: the `research_query` MCP handler must read the
 * registry from the workspace root, not from wherever the server process
 * happens to have its cwd. Drives the real registered handler (mock server,
 * permissive rate limiter) with cwd pinned to a nested directory beneath a
 * temp root that owns `docs/research/registry`.
 */

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { registerResearchQueryTool, type ResearchQueryDeps } from './research-query.js';
import { RateLimiter } from '../middleware/rate-limiter.js';
import {
  PAPERS_FILE,
  REGISTRY_PATH,
  TECHNIQUES_FILE,
  _resetRegistryRootForTests,
} from '../../cli/research-helpers-io.js';
import { _resetActiveWorkspaceRootForTests } from '../../config/nexus-data-dir.js';
import { mkdtempOutsideRepo } from '../../testing/non-repo-temp-dir.js';

type Handler = (args: unknown) => Promise<{
  isError?: boolean;
  content: Array<{ text: string }>;
}>;

interface StatusPayload {
  action: string;
  success: boolean;
  data: { techniques: Array<{ id: string }> };
}

const ROOT_TECHNIQUE_ID = 'seam-root-technique';

function registerHandler(): Handler {
  const registerTool = vi.fn();
  const deps: ResearchQueryDeps = {
    rateLimiter: new RateLimiter({ capacity: 1000, refillRate: 1000, refillIntervalMs: 1000 }),
  };
  registerResearchQueryTool(
    { tool: vi.fn(), registerTool } as unknown as Parameters<typeof registerResearchQueryTool>[0],
    deps
  );
  const handler = registerTool.mock.calls[0]?.[2] as Handler | undefined;
  if (handler === undefined) throw new Error('research_query handler was not registered');
  return handler;
}

describe('research_query reads the registry at the workspace root (#5053)', () => {
  const originalCwd = process.cwd();
  let root: string;
  let stderrSpy: MockInstance;

  beforeEach(() => {
    // Outside any git repo: vitest pins TMPDIR under the repo, where the
    // resolver would legitimately find the repo's own registry.
    root = mkdtempOutsideRepo('nexus-5053-seam-');
    mkdirSync(join(root, REGISTRY_PATH), { recursive: true });
    writeFileSync(
      join(root, REGISTRY_PATH, TECHNIQUES_FILE),
      [
        "schema_version: '1.0'",
        'techniques:',
        `  ${ROOT_TECHNIQUE_ID}:`,
        '    name: Seam Root Technique',
        '    description: only present in the root registry',
        '    status: planned',
        '    source_papers: []',
        '    topic: testing',
        '    tags: []',
        '    priority: P3',
        '',
      ].join('\n'),
      'utf-8'
    );
    writeFileSync(
      join(root, REGISTRY_PATH, PAPERS_FILE),
      "schema_version: '1.0'\npapers: {}\n",
      'utf-8'
    );
    _resetRegistryRootForTests();
    _resetActiveWorkspaceRootForTests();
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    _resetRegistryRootForTests();
    _resetActiveWorkspaceRootForTests();
    stderrSpy.mockRestore();
    rmSync(root, { recursive: true, force: true });
  });

  it('status from a nested cwd returns the technique that only the root registry holds', async () => {
    const nested = join(root, 'packages', 'nexus-agents', 'src');
    mkdirSync(nested, { recursive: true });
    process.chdir(nested);

    const result = await registerHandler()({ action: 'status' });

    expect(result.isError, result.content[0]?.text).not.toBe(true);
    const payload = JSON.parse(result.content[0]?.text ?? '{}') as StatusPayload;
    expect(payload.success).toBe(true);
    expect(payload.data.techniques.map((t) => t.id)).toEqual([ROOT_TECHNIQUE_ID]);
  });
});
