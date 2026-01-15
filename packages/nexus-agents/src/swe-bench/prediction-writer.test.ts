/**
 * Tests for prediction-writer.ts
 * (Source: Issue #257)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  PredictionWriter,
  writePredictions,
  readPredictions,
  getCompletedInstanceIds,
  createPrediction,
  validatePrediction,
  PredictionWriteError,
} from './prediction-writer.js';
import type { SWEBenchPrediction, SWEBenchRunResult } from './types.js';

describe('prediction-writer', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'swe-bench-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('PredictionWriter', () => {
    it('writes predictions to JSONL file', async () => {
      const outputPath = path.join(tempDir, 'predictions.jsonl');
      const writer = new PredictionWriter({
        outputPath,
        modelName: 'nexus-agents',
        append: false,
      });

      const openResult = await writer.open();
      expect(openResult.ok).toBe(true);

      const prediction: SWEBenchPrediction = {
        instance_id: 'django__django-11099',
        model_name_or_path: 'nexus-agents',
        model_patch: 'diff --git a/test.py b/test.py\n+# fix',
      };

      const writeResult = await writer.write(prediction);
      expect(writeResult.ok).toBe(true);

      const closeResult = await writer.close();
      expect(closeResult.ok).toBe(true);

      const content = await fs.readFile(outputPath, 'utf-8');
      const parsed = JSON.parse(content.trim()) as SWEBenchPrediction;
      expect(parsed.instance_id).toBe('django__django-11099');
    });

    it('tracks prediction count', async () => {
      const outputPath = path.join(tempDir, 'predictions.jsonl');
      const writer = new PredictionWriter({
        outputPath,
        modelName: 'nexus-agents',
        append: false,
      });

      await writer.open();

      expect(writer.getPredictionCount()).toBe(0);

      await writer.write({
        instance_id: 'test__test-1',
        model_name_or_path: 'nexus-agents',
        model_patch: 'patch1',
      });

      expect(writer.getPredictionCount()).toBe(1);

      await writer.write({
        instance_id: 'test__test-2',
        model_name_or_path: 'nexus-agents',
        model_patch: 'patch2',
      });

      expect(writer.getPredictionCount()).toBe(2);

      await writer.close();
    });

    it('returns error when writing without opening', async () => {
      const outputPath = path.join(tempDir, 'predictions.jsonl');
      const writer = new PredictionWriter({
        outputPath,
        modelName: 'nexus-agents',
        append: false,
      });

      const result = await writer.write({
        instance_id: 'test__test-1',
        model_name_or_path: 'nexus-agents',
        model_patch: 'patch',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('not opened');
      }
    });

    it('appends to existing file when append is true', async () => {
      const outputPath = path.join(tempDir, 'predictions.jsonl');

      // Write first prediction
      const writer1 = new PredictionWriter({
        outputPath,
        modelName: 'nexus-agents',
        append: false,
      });
      await writer1.open();
      await writer1.write({
        instance_id: 'test__test-1',
        model_name_or_path: 'nexus-agents',
        model_patch: 'patch1',
      });
      await writer1.close();

      // Append second prediction
      const writer2 = new PredictionWriter({
        outputPath,
        modelName: 'nexus-agents',
        append: true,
      });
      await writer2.open();
      await writer2.write({
        instance_id: 'test__test-2',
        model_name_or_path: 'nexus-agents',
        model_patch: 'patch2',
      });
      await writer2.close();

      const content = await fs.readFile(outputPath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines.length).toBe(2);
    });

    it('returns output path', () => {
      const outputPath = path.join(tempDir, 'predictions.jsonl');
      const writer = new PredictionWriter({
        outputPath,
        modelName: 'nexus-agents',
        append: false,
      });

      expect(writer.getOutputPath()).toBe(outputPath);
    });
  });

  describe('writeResult', () => {
    it('writes completed run results as predictions', async () => {
      const outputPath = path.join(tempDir, 'predictions.jsonl');
      const writer = new PredictionWriter({
        outputPath,
        modelName: 'nexus-agents',
        append: false,
      });

      await writer.open();

      const result: SWEBenchRunResult = {
        instance_id: 'django__django-11099',
        completed: true,
        prediction: {
          instance_id: 'django__django-11099',
          model_name_or_path: 'nexus-agents',
          model_patch: 'diff --git a/test.py b/test.py\n+# fix',
        },
        duration_ms: 5000,
      };

      const writeResult = await writer.writeResult(result);
      expect(writeResult.ok).toBe(true);
      if (writeResult.ok) {
        expect(writeResult.value).toBe(true);
      }

      await writer.close();
    });

    it('skips incomplete run results', async () => {
      const outputPath = path.join(tempDir, 'predictions.jsonl');
      const writer = new PredictionWriter({
        outputPath,
        modelName: 'nexus-agents',
        append: false,
      });

      await writer.open();

      const result: SWEBenchRunResult = {
        instance_id: 'django__django-11099',
        completed: false,
        error: 'Timeout',
        duration_ms: 600000,
      };

      const writeResult = await writer.writeResult(result);
      expect(writeResult.ok).toBe(true);
      if (writeResult.ok) {
        expect(writeResult.value).toBe(false);
      }

      expect(writer.getPredictionCount()).toBe(0);

      await writer.close();
    });
  });

  describe('writePredictions', () => {
    it('writes multiple predictions at once', async () => {
      const outputPath = path.join(tempDir, 'predictions.jsonl');
      const predictions: SWEBenchPrediction[] = [
        {
          instance_id: 'test__test-1',
          model_name_or_path: 'nexus-agents',
          model_patch: 'patch1',
        },
        {
          instance_id: 'test__test-2',
          model_name_or_path: 'nexus-agents',
          model_patch: 'patch2',
        },
      ];

      const result = await writePredictions(predictions, outputPath);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(2);
      }

      const content = await fs.readFile(outputPath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines.length).toBe(2);
    });
  });

  describe('readPredictions', () => {
    it('reads predictions from JSONL file', async () => {
      const outputPath = path.join(tempDir, 'predictions.jsonl');
      const predictions: SWEBenchPrediction[] = [
        {
          instance_id: 'test__test-1',
          model_name_or_path: 'nexus-agents',
          model_patch: 'patch1',
        },
        {
          instance_id: 'test__test-2',
          model_name_or_path: 'nexus-agents',
          model_patch: 'patch2',
        },
      ];

      await writePredictions(predictions, outputPath);

      const result = await readPredictions(outputPath);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(2);
        const first = result.value[0];
        const second = result.value[1];
        expect(first).toBeDefined();
        expect(second).toBeDefined();
        expect(first?.instance_id).toBe('test__test-1');
        expect(second?.instance_id).toBe('test__test-2');
      }
    });

    it('handles non-existent file', async () => {
      const result = await readPredictions(path.join(tempDir, 'nonexistent.jsonl'));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(PredictionWriteError);
      }
    });

    it('skips invalid lines', async () => {
      const outputPath = path.join(tempDir, 'predictions.jsonl');
      await fs.writeFile(
        outputPath,
        '{"instance_id":"valid","model_name_or_path":"test","model_patch":"p"}\n{"invalid":"data"}\n'
      );

      const result = await readPredictions(outputPath);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
      }
    });
  });

  describe('getCompletedInstanceIds', () => {
    it('returns set of completed instance IDs', async () => {
      const outputPath = path.join(tempDir, 'predictions.jsonl');
      const predictions: SWEBenchPrediction[] = [
        {
          instance_id: 'test__test-1',
          model_name_or_path: 'nexus-agents',
          model_patch: 'patch1',
        },
        {
          instance_id: 'test__test-2',
          model_name_or_path: 'nexus-agents',
          model_patch: 'patch2',
        },
      ];

      await writePredictions(predictions, outputPath);

      const result = await getCompletedInstanceIds(outputPath);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.has('test__test-1')).toBe(true);
        expect(result.value.has('test__test-2')).toBe(true);
        expect(result.value.size).toBe(2);
      }
    });
  });

  describe('createPrediction', () => {
    it('creates prediction from completed result', () => {
      const result: SWEBenchRunResult = {
        instance_id: 'django__django-11099',
        completed: true,
        prediction: {
          instance_id: 'django__django-11099',
          model_name_or_path: 'original',
          model_patch: 'diff --git a/test.py b/test.py\n+# fix',
        },
        duration_ms: 5000,
      };

      const prediction = createPrediction(result, 'nexus-agents');

      expect(prediction).not.toBeNull();
      expect(prediction?.instance_id).toBe('django__django-11099');
      expect(prediction?.model_name_or_path).toBe('nexus-agents');
    });

    it('returns null for incomplete result', () => {
      const result: SWEBenchRunResult = {
        instance_id: 'django__django-11099',
        completed: false,
        error: 'Failed',
        duration_ms: 5000,
      };

      const prediction = createPrediction(result, 'nexus-agents');

      expect(prediction).toBeNull();
    });
  });

  describe('validatePrediction', () => {
    it('validates correct prediction', () => {
      const prediction = {
        instance_id: 'test__test-1',
        model_name_or_path: 'nexus-agents',
        model_patch: 'diff',
      };

      expect(validatePrediction(prediction)).toBe(true);
    });

    it('rejects missing instance_id', () => {
      const prediction = {
        model_name_or_path: 'nexus-agents',
        model_patch: 'diff',
      };

      expect(validatePrediction(prediction)).toBe(false);
    });

    it('rejects empty instance_id', () => {
      const prediction = {
        instance_id: '',
        model_name_or_path: 'nexus-agents',
        model_patch: 'diff',
      };

      expect(validatePrediction(prediction)).toBe(false);
    });

    it('rejects null', () => {
      expect(validatePrediction(null)).toBe(false);
    });

    it('rejects non-object', () => {
      expect(validatePrediction('string')).toBe(false);
    });
  });

  describe('PredictionWriteError', () => {
    it('stores cause when provided', () => {
      const cause = new Error('Original');
      const error = new PredictionWriteError('Failed', cause);

      expect(error.message).toBe('Failed');
      expect(error.cause).toBe(cause);
      expect(error.name).toBe('PredictionWriteError');
    });
  });
});
