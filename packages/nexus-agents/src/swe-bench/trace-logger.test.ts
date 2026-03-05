/**
 * Tests for trace-logger.ts
 * (Source: Issue #1412 - Structured trace logging for SWE-bench)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

vi.mock('../core/index.js', () => ({
  getTimeProvider: vi.fn(() => ({
    now: () => 1700000000000,
    nowIso: () => '2023-11-14T22:13:20.000Z',
    nowDate: () => new Date(1700000000000),
    nowDateString: () => '2023-11-14',
  })),
}));

import { TraceLogger } from './trace-logger.js';
import type { TraceEvent, RunStatus } from './trace-logger.js';

describe('trace-logger', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'trace-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('constructor path derivation', () => {
    it('derives trace path from outputPath', () => {
      const outputPath = path.join(tempDir, 'predictions.jsonl');
      const logger = new TraceLogger({
        outputPath,
        runId: 'run-1',
        totalInstances: 10,
      });

      expect(logger.getTracePath()).toBe(path.join(tempDir, 'predictions-trace.jsonl'));
    });

    it('derives status path from outputPath', () => {
      const outputPath = path.join(tempDir, 'predictions.jsonl');
      const logger = new TraceLogger({
        outputPath,
        runId: 'run-1',
        totalInstances: 10,
      });

      expect(logger.getStatusPath()).toBe(path.join(tempDir, 'predictions-status.json'));
    });

    it('handles outputPath without .jsonl extension', () => {
      const outputPath = path.join(tempDir, 'output.txt');
      const logger = new TraceLogger({
        outputPath,
        runId: 'run-1',
        totalInstances: 5,
      });

      expect(logger.getTracePath()).toBe(path.join(tempDir, 'output-trace.jsonl'));
      expect(logger.getStatusPath()).toBe(path.join(tempDir, 'output-status.json'));
    });
  });

  describe('emit', () => {
    it('appends valid JSONL lines to trace file', async () => {
      const outputPath = path.join(tempDir, 'predictions.jsonl');
      const logger = new TraceLogger({
        outputPath,
        runId: 'run-1',
        totalInstances: 10,
      });

      await logger.emit('run_start', { config: { model: 'test' } });

      const content = await fs.readFile(logger.getTracePath(), 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(1);

      const parsed = JSON.parse(lines[0] ?? '') as TraceEvent;
      expect(parsed.type).toBe('run_start');
      expect(parsed.runId).toBe('run-1');
      expect(parsed.timestamp).toBe('2023-11-14T22:13:20.000Z');
      expect(parsed.data).toEqual({ config: { model: 'test' } });
    });

    it('appends multiple lines', async () => {
      const outputPath = path.join(tempDir, 'predictions.jsonl');
      const logger = new TraceLogger({
        outputPath,
        runId: 'run-1',
        totalInstances: 10,
      });

      await logger.emit('instance_start');
      await logger.emit('instance_complete');

      const content = await fs.readFile(logger.getTracePath(), 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(2);
    });

    it('does not throw when appendFile rejects', async () => {
      const outputPath = path.join(tempDir, 'predictions.jsonl');
      const logger = new TraceLogger({
        outputPath,
        runId: 'run-1',
        totalInstances: 10,
      });

      // Make the trace file path a directory to cause EISDIR
      const tracePath = logger.getTracePath();
      await fs.mkdir(tracePath, { recursive: true });

      // Should not throw — best effort
      await expect(logger.emit('run_start')).resolves.toBeUndefined();
    });
  });

  describe('lifecycle methods', () => {
    it('instanceStart emits event and tracks current instance', async () => {
      const outputPath = path.join(tempDir, 'predictions.jsonl');
      const logger = new TraceLogger({
        outputPath,
        runId: 'run-1',
        totalInstances: 10,
      });

      await logger.instanceStart('django__django-11099');

      const content = await fs.readFile(logger.getTracePath(), 'utf-8');
      const parsed = JSON.parse(content.trim()) as TraceEvent;
      expect(parsed.type).toBe('instance_start');
      expect(parsed.instanceId).toBe('django__django-11099');
    });

    it('iterationStart emits event with iteration number', async () => {
      const outputPath = path.join(tempDir, 'predictions.jsonl');
      const logger = new TraceLogger({
        outputPath,
        runId: 'run-1',
        totalInstances: 10,
      });

      await logger.instanceStart('django__django-11099');
      await logger.iterationStart(1);

      const content = await fs.readFile(logger.getTracePath(), 'utf-8');
      const lines = content.trim().split('\n');
      const parsed = JSON.parse(lines[1] ?? '') as TraceEvent;
      expect(parsed.type).toBe('iteration_start');
      expect(parsed.iteration).toBe(1);
    });

    it('iterationComplete updates token count', async () => {
      const outputPath = path.join(tempDir, 'predictions.jsonl');
      const logger = new TraceLogger({
        outputPath,
        runId: 'run-1',
        totalInstances: 10,
      });

      await logger.instanceStart('test-1');
      await logger.iterationStart(1);
      await logger.iterationComplete(500, 100, false);

      const content = await fs.readFile(logger.getTracePath(), 'utf-8');
      const lines = content.trim().split('\n');
      const parsed = JSON.parse(lines[2] ?? '') as TraceEvent;
      expect(parsed.type).toBe('iteration_complete');
      expect(parsed.data).toEqual({
        durationMs: 500,
        tokensUsed: 100,
        patchFound: false,
      });
    });

    it('instanceComplete updates success/failure counters', async () => {
      const outputPath = path.join(tempDir, 'predictions.jsonl');
      const logger = new TraceLogger({
        outputPath,
        runId: 'run-1',
        totalInstances: 10,
      });

      await logger.instanceStart('test-1');
      await logger.instanceComplete(true, 3, 1500);
      await logger.instanceStart('test-2');
      await logger.instanceComplete(false, 5, 3000);

      const statusContent = await fs.readFile(logger.getStatusPath(), 'utf-8');
      const status = JSON.parse(statusContent) as RunStatus;
      expect(status.completedInstances).toBe(2);
      expect(status.successCount).toBe(1);
      expect(status.failureCount).toBe(1);
    });

    it('iterationComplete accumulates totalTokens', async () => {
      const outputPath = path.join(tempDir, 'predictions.jsonl');
      const logger = new TraceLogger({
        outputPath,
        runId: 'run-1',
        totalInstances: 10,
      });

      await logger.instanceStart('test-1');
      await logger.iterationComplete(100, 50, false);
      await logger.iterationComplete(100, 75, true);

      const statusContent = await fs.readFile(logger.getStatusPath(), 'utf-8');
      const status = JSON.parse(statusContent) as RunStatus;
      expect(status.totalTokens).toBe(125);
    });
  });

  describe('runStart and runComplete', () => {
    it('runStart emits event with config', async () => {
      const outputPath = path.join(tempDir, 'predictions.jsonl');
      const logger = new TraceLogger({
        outputPath,
        runId: 'run-1',
        totalInstances: 10,
      });

      await logger.runStart({ model: 'claude', variant: 'lite' });

      const content = await fs.readFile(logger.getTracePath(), 'utf-8');
      const parsed = JSON.parse(content.trim()) as TraceEvent;
      expect(parsed.type).toBe('run_start');
      expect(parsed.data).toEqual({ model: 'claude', variant: 'lite' });
    });

    it('runComplete emits event with summary data', async () => {
      const outputPath = path.join(tempDir, 'predictions.jsonl');
      const logger = new TraceLogger({
        outputPath,
        runId: 'run-1',
        totalInstances: 2,
      });

      await logger.runStart({});
      await logger.instanceStart('test-1');
      await logger.iterationComplete(100, 50, true);
      await logger.instanceComplete(true, 1, 100);
      await logger.instanceStart('test-2');
      await logger.iterationComplete(200, 75, false);
      await logger.instanceComplete(false, 1, 200);
      await logger.runComplete();

      const content = await fs.readFile(logger.getTracePath(), 'utf-8');
      const lines = content.trim().split('\n');
      const last = JSON.parse(lines[lines.length - 1] ?? '') as TraceEvent;
      expect(last.type).toBe('run_complete');
      expect(last.data).toEqual({
        completedInstances: 2,
        successCount: 1,
        failureCount: 1,
        totalTokens: 125,
      });
    });
  });

  describe('status file', () => {
    it('contains valid JSON with correct fields', async () => {
      const outputPath = path.join(tempDir, 'predictions.jsonl');
      const logger = new TraceLogger({
        outputPath,
        runId: 'run-1',
        totalInstances: 10,
      });

      await logger.instanceStart('test-1');
      await logger.iterationStart(1);

      const statusContent = await fs.readFile(logger.getStatusPath(), 'utf-8');
      const status = JSON.parse(statusContent) as RunStatus;
      expect(status.runId).toBe('run-1');
      expect(status.totalInstances).toBe(10);
      expect(status.currentInstance).toBe('test-1');
      expect(status.currentIteration).toBe(1);
      expect(status.completedInstances).toBe(0);
      expect(status.successCount).toBe(0);
      expect(status.failureCount).toBe(0);
      expect(status.startedAt).toBe('2023-11-14T22:13:20.000Z');
      expect(status.elapsedMs).toBe(0);
      expect(status.totalTokens).toBe(0);
    });

    it('success rate is 0 when no instances completed', async () => {
      const outputPath = path.join(tempDir, 'predictions.jsonl');
      const logger = new TraceLogger({
        outputPath,
        runId: 'run-1',
        totalInstances: 10,
      });

      await logger.instanceStart('test-1');

      const statusContent = await fs.readFile(logger.getStatusPath(), 'utf-8');
      const status = JSON.parse(statusContent) as RunStatus;
      expect(status.completedInstances).toBe(0);
      expect(status.successCount).toBe(0);
    });

    it('does not throw when writeFile rejects', async () => {
      const outputPath = path.join(tempDir, 'predictions.jsonl');
      const logger = new TraceLogger({
        outputPath,
        runId: 'run-1',
        totalInstances: 10,
      });

      // Make status path a directory to cause EISDIR
      const statusPath = logger.getStatusPath();
      await fs.mkdir(statusPath, { recursive: true });

      // Should not throw — best effort
      await expect(logger.instanceStart('test-1')).resolves.toBeUndefined();
    });
  });
});
