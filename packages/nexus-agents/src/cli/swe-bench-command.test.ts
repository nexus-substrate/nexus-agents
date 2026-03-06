/**
 * Tests for swe-bench-command.ts
 * (Source: Issue #257)
 */

import { describe, it, expect } from 'vitest';
import { parseSweBenchArgs, type SWEBenchOptions } from './swe-bench-command.js';

describe('swe-bench-command', () => {
  describe('parseSweBenchArgs', () => {
    it('should return default options for empty args', () => {
      const options = parseSweBenchArgs([]);

      expect(options.subcommand).toBe('run');
      expect(options.variant).toBe('lite');
      expect(options.output).toBe('predictions.jsonl');
      expect(options.resume).toBe(false);
      expect(options.verbose).toBe(false);
      expect(options.instances).toEqual([]);
      expect(options.limit).toBeUndefined();
    });

    it('should parse info subcommand', () => {
      const options = parseSweBenchArgs(['info']);

      expect(options.subcommand).toBe('info');
    });

    it('should parse status subcommand', () => {
      const options = parseSweBenchArgs(['status']);

      expect(options.subcommand).toBe('status');
    });

    it('should parse run subcommand', () => {
      const options = parseSweBenchArgs(['run']);

      expect(options.subcommand).toBe('run');
    });

    it('should default to run for unknown subcommand', () => {
      const options = parseSweBenchArgs(['unknown']);

      expect(options.subcommand).toBe('run');
    });

    it('should parse --variant=lite', () => {
      const options = parseSweBenchArgs(['run', '--variant=lite']);

      expect(options.variant).toBe('lite');
    });

    it('should parse --variant=verified', () => {
      const options = parseSweBenchArgs(['run', '--variant=verified']);

      expect(options.variant).toBe('verified');
    });

    it('should parse --variant=full', () => {
      const options = parseSweBenchArgs(['run', '--variant=full']);

      expect(options.variant).toBe('full');
    });

    it('should default variant to lite for invalid value', () => {
      const options = parseSweBenchArgs(['run', '--variant=invalid']);

      expect(options.variant).toBe('lite');
    });

    it('should parse --limit=10', () => {
      const options = parseSweBenchArgs(['run', '--limit=10']);

      expect(options.limit).toBe(10);
    });

    it('should parse --output=path', () => {
      const options = parseSweBenchArgs(['run', '--output=/path/to/output.jsonl']);

      expect(options.output).toBe('/path/to/output.jsonl');
    });

    it('should parse --resume flag', () => {
      const options = parseSweBenchArgs(['run', '--resume']);

      expect(options.resume).toBe(true);
    });

    it('should parse --verbose flag', () => {
      const options = parseSweBenchArgs(['run', '--verbose']);

      expect(options.verbose).toBe(true);
    });

    it('should parse -v flag', () => {
      const options = parseSweBenchArgs(['run', '-v']);

      expect(options.verbose).toBe(true);
    });

    it('should parse single --instance', () => {
      const options = parseSweBenchArgs(['run', '--instance=test-123']);

      expect(options.instances).toEqual(['test-123']);
    });

    it('should parse multiple --instance flags', () => {
      const options = parseSweBenchArgs(['run', '--instance=test-123', '--instance=test-456']);

      expect(options.instances).toEqual(['test-123', 'test-456']);
    });

    it('should parse complex command line', () => {
      const options = parseSweBenchArgs([
        'run',
        '--variant=verified',
        '--limit=50',
        '--output=./out.jsonl',
        '--resume',
        '-v',
        '--instance=django__django-12345',
      ]);

      expect(options.subcommand).toBe('run');
      expect(options.variant).toBe('verified');
      expect(options.limit).toBe(50);
      expect(options.output).toBe('./out.jsonl');
      expect(options.resume).toBe(true);
      expect(options.verbose).toBe(true);
      expect(options.instances).toEqual(['django__django-12345']);
    });

    it('should parse evaluate subcommand', () => {
      const options = parseSweBenchArgs(['evaluate']);

      expect(options.subcommand).toBe('evaluate');
    });

    it('should parse evaluate with output option', () => {
      const options = parseSweBenchArgs(['evaluate', '--output=./my-predictions.jsonl']);

      expect(options.subcommand).toBe('evaluate');
      expect(options.output).toBe('./my-predictions.jsonl');
    });

    it('should parse evaluate-specific flags', () => {
      const options = parseSweBenchArgs([
        'evaluate',
        '--predictions=./preds.jsonl',
        '--cache-level=instance',
        '--max-workers=2',
        '--run-id=my-run-1',
        '--output-dir=./my-logs',
      ]);

      expect(options.subcommand).toBe('evaluate');
      expect(options.predictions).toBe('./preds.jsonl');
      expect(options.cacheLevel).toBe('instance');
      expect(options.maxWorkers).toBe(2);
      expect(options.runId).toBe('my-run-1');
      expect(options.outputDir).toBe('./my-logs');
    });

    it('should default cache-level to env for invalid value', () => {
      const options = parseSweBenchArgs(['evaluate', '--cache-level=invalid']);

      expect(options.cacheLevel).toBe('env');
    });

    it('should cap max-workers', () => {
      const options = parseSweBenchArgs(['evaluate', '--max-workers=999']);

      expect(options.maxWorkers).toBeLessThanOrEqual(24);
      expect(options.maxWorkers).toBeGreaterThan(0);
    });

    it('should default max-workers to 4 for invalid value', () => {
      const options = parseSweBenchArgs(['evaluate', '--max-workers=abc']);

      expect(options.maxWorkers).toBe(4);
    });

    it('should have default evaluate options', () => {
      const options = parseSweBenchArgs(['evaluate']);

      expect(options.cacheLevel).toBe('env');
      expect(options.maxWorkers).toBe(4);
      expect(options.outputDir).toBe('./logs/run_evaluation');
      expect(options.predictions).toBeUndefined();
      expect(options.runId).toBeUndefined();
    });
  });

  describe('SWEBenchOptions type', () => {
    it('should have correct readonly properties', () => {
      const options: SWEBenchOptions = {
        subcommand: 'run',
        variant: 'lite',
        output: 'predictions.jsonl',
        resume: false,
        verbose: false,
        concurrency: 1,
        instances: [],
        mcp: false,
        cacheLevel: 'env',
        maxWorkers: 4,
        outputDir: './logs/run_evaluation',
      };

      expect(options.subcommand).toBe('run');
      expect(options.variant).toBe('lite');
    });

    it('should allow optional limit property', () => {
      const withLimit: SWEBenchOptions = {
        subcommand: 'run',
        variant: 'lite',
        limit: 10,
        output: 'predictions.jsonl',
        resume: false,
        verbose: false,
        concurrency: 1,
        instances: [],
        mcp: false,
        cacheLevel: 'env',
        maxWorkers: 4,
        outputDir: './logs/run_evaluation',
      };

      const withoutLimit: SWEBenchOptions = {
        subcommand: 'run',
        variant: 'lite',
        output: 'predictions.jsonl',
        resume: false,
        verbose: false,
        concurrency: 1,
        instances: [],
        mcp: false,
        cacheLevel: 'env',
        maxWorkers: 4,
        outputDir: './logs/run_evaluation',
      };

      expect(withLimit.limit).toBe(10);
      expect(withoutLimit.limit).toBeUndefined();
    });
  });
});
