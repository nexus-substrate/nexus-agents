/**
 * Every cwd-subtree path guard on an MCP tool input must be realpath-aware:
 * a symlink inside cwd whose target is outside cwd is rejected, and a symlink
 * whose target stays inside cwd is accepted. A lexical `path.resolve` +
 * `startsWith(root + sep)` check accepts both, so each site below is exercised
 * against the same fixture rather than trusting that it calls the helper.
 *
 * @module mcp/tools/path-containment-symlink.test
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from '../../core/index.js';
import {
  createSymlinkEscapeFixture,
  type SymlinkEscapeFixture,
} from '../../testing/symlink-escape-fixture.js';
import { _testing as compareFeeds } from './compare-data-feeds.js';
import { _testing as extractSymbols } from './extract-symbols-tool.js';
import { _testing as searchUsages } from './search-usages-tool.js';
import { _testing as searchCodebase } from './search-codebase-tool.js';
import { _testing as pipelineTool } from './pipeline-tool.js';
import { _testing as securityScan } from './security-scan.js';
import { queryTraceFromDisk } from './query-trace-tool.js';
import { validateWorkflowPath } from './run-workflow-helpers.js';

function makeCtx(toolName: string): Parameters<typeof extractSymbols.extractSymbolsHandler>[1] {
  return {
    requestContext: {
      requestId: 'test-req',
      toolName,
      startTimeMs: 0,
    } as unknown as Parameters<typeof extractSymbols.extractSymbolsHandler>[1]['requestContext'],
    logger: createLogger({ component: 'test' }),
    sanitization: {
      wasModified: false,
      commentsRemoved: 0,
      fieldsModified: 0,
      tagsRemoved: 0,
      rawFieldHashes: {},
      rawFieldBytes: {},
    },
  };
}

function textOf(result: { content: Array<{ type: string; text?: string }> }): string {
  const first = result.content[0];
  return first?.type === 'text' ? (first.text ?? '') : '';
}

describe('MCP path guards follow symlinks', () => {
  let fx: SymlinkEscapeFixture;

  beforeEach(() => {
    fx = createSymlinkEscapeFixture();
  });

  afterEach(() => {
    fx.cleanup();
  });

  describe('compare_data_feeds loadFeed', () => {
    it('rejects a feed reached through a symlink that points outside cwd', () => {
      expect(() => compareFeeds.loadFeed(join(fx.linkOut, 'feed.json'))).toThrow(
        /Path traversal denied/
      );
    });

    it('accepts a feed reached through a symlink that stays inside cwd', () => {
      expect(compareFeeds.loadFeed(join(fx.linkIn, 'feed.json'))).toEqual([]);
    });
  });

  describe('extract_symbols filePath', () => {
    it('rejects a symlink escape', async () => {
      const result = await extractSymbols.extractSymbolsHandler(
        { filePath: join(fx.linkOut, 'a.ts') },
        makeCtx('extract_symbols')
      );
      expect(result.isError).toBe(true);
      expect(textOf(result)).toMatch(/Path traversal denied/);
    });

    it('accepts an inside symlink', async () => {
      const result = await extractSymbols.extractSymbolsHandler(
        { filePath: join(fx.linkIn, 'a.ts') },
        makeCtx('extract_symbols')
      );
      expect(textOf(result)).not.toMatch(/Path traversal denied/);
    });
  });

  describe('search_usages path / dir', () => {
    it('rejects a file path through a symlink escape', async () => {
      const result = await searchUsages.searchUsagesHandler(
        { symbol: 'a', path: join(fx.linkOut, 'a.ts') },
        makeCtx('search_usages')
      );
      expect(result.isError).toBe(true);
      expect(textOf(result)).toMatch(/Path traversal denied/);
    });

    it('rejects a dir through a symlink escape', async () => {
      const result = await searchUsages.searchUsagesHandler(
        { symbol: 'a', dir: fx.linkOut },
        makeCtx('search_usages')
      );
      expect(result.isError).toBe(true);
      expect(textOf(result)).toMatch(/Path traversal denied/);
    });

    it('accepts a dir through an inside symlink', async () => {
      const result = await searchUsages.searchUsagesHandler(
        { symbol: 'a', dir: fx.linkIn },
        makeCtx('search_usages')
      );
      expect(textOf(result)).not.toMatch(/Path traversal denied/);
    });
  });

  describe('search_codebase directory', () => {
    it('rejects a symlink escape', () => {
      const r = searchCodebase.resolveSearchDir(fx.linkOut);
      expect('error' in r && r.error).toMatch(/Path traversal denied/);
    });

    it('accepts an inside symlink', () => {
      expect('dir' in searchCodebase.resolveSearchDir(fx.linkIn)).toBe(true);
    });
  });

  describe('run_pipeline specFile', () => {
    it('rejects a symlink escape', async () => {
      await expect(pipelineTool.resolveTask('t', join(fx.linkOut, 'plan.md'))).rejects.toThrow(
        /Path traversal denied/
      );
    });

    it('accepts an inside symlink', async () => {
      await expect(pipelineTool.resolveTask('t', join(fx.linkIn, 'plan.md'))).resolves.toContain(
        '# plan'
      );
    });
  });

  describe('security scan target', () => {
    it('rejects a symlink escape', () => {
      expect(() => securityScan.validateTargetPath(fx.linkOut)).toThrow(/Invalid target path/);
    });

    it('accepts an inside symlink', () => {
      expect(() => securityScan.validateTargetPath(fx.linkIn)).not.toThrow();
    });
  });

  describe('query_trace runs dir', () => {
    const TRACE_LINE = JSON.stringify({ timestamp: 1, runId: 'r', eventType: 'model.called' });

    beforeEach(() => {
      writeFileSync(join(fx.outsideDir, 'trace.jsonl'), TRACE_LINE + '\n');
      writeFileSync(join(fx.insideDir, 'real', 'trace.jsonl'), TRACE_LINE + '\n');
    });

    it('rejects a run dir that is a symlink escape', async () => {
      const result = await queryTraceFromDisk({ runId: 'escape' }, fx.insideDir);
      expect(result.totalEvents).toBe(0);
    });

    it('accepts a run dir that is an inside symlink', async () => {
      const result = await queryTraceFromDisk({ runId: 'alias' }, fx.insideDir);
      expect(result.totalEvents).toBe(1);
    });
  });

  describe('run_workflow template path', () => {
    it('rejects a symlink escape', () => {
      expect(validateWorkflowPath(join(fx.linkOut, 'plan.md'), [fx.insideDir]).ok).toBe(false);
    });

    it('accepts an inside symlink and returns the canonical path', () => {
      const r = validateWorkflowPath(join(fx.linkIn, 'plan.md'), [fx.insideDir]);
      expect(r.ok && r.value).toBe(join(fx.insideDir, 'real', 'plan.md'));
    });
  });
});
