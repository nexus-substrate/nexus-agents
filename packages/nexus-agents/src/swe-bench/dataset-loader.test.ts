/**
 * Tests for dataset-loader.ts
 * (Source: Issue #257)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadDataset,
  getInstance,
  listInstances,
  getDatasetInfo,
  filterByRepo,
  filterByVersion,
  DatasetLoadError,
} from './dataset-loader.js';
import type { SWEBenchInstance } from './types.js';

// Mock fetch for HuggingFace API
const mockFetch = vi.fn<typeof fetch>();

describe('dataset-loader', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('loadDataset', () => {
    it('loads instances from HuggingFace', async () => {
      const mockInstances = [
        {
          instance_id: 'django__django-11099',
          repo: 'django/django',
          base_commit: 'abc123',
          problem_statement: 'Fix the bug',
          created_at: '2023-01-01',
        },
        {
          instance_id: 'sympy__sympy-20590',
          repo: 'sympy/sympy',
          base_commit: 'def456',
          problem_statement: 'Another issue',
          created_at: '2023-02-01',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ rows: mockInstances.map((row) => ({ row })) }),
      } as Response);

      const result = await loadDataset('lite');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.instances.length).toBe(2);
        const firstInstance = result.value.instances[0];
        expect(firstInstance).toBeDefined();
        expect(firstInstance?.instance_id).toBe('django__django-11099');
        expect(result.value.count).toBe(2);
        expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('applies instance ID filter', async () => {
      const mockInstances = [
        {
          instance_id: 'django__django-11099',
          repo: 'django/django',
          base_commit: 'abc123',
          problem_statement: 'Fix the bug',
          created_at: '2023-01-01',
        },
        {
          instance_id: 'sympy__sympy-20590',
          repo: 'sympy/sympy',
          base_commit: 'def456',
          problem_statement: 'Another issue',
          created_at: '2023-02-01',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ rows: mockInstances.map((row) => ({ row })) }),
      } as Response);

      const result = await loadDataset('lite', {
        instanceIds: ['django__django-11099'],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.instances.length).toBe(1);
        const firstInstance = result.value.instances[0];
        expect(firstInstance).toBeDefined();
        expect(firstInstance?.instance_id).toBe('django__django-11099');
        expect(result.value.filtered).toBe(1);
      }
    });

    it('applies custom filter', async () => {
      const mockInstances = [
        {
          instance_id: 'django__django-11099',
          repo: 'django/django',
          base_commit: 'abc123',
          problem_statement: 'Fix the bug',
          created_at: '2023-01-01',
        },
        {
          instance_id: 'sympy__sympy-20590',
          repo: 'sympy/sympy',
          base_commit: 'def456',
          problem_statement: 'Another issue',
          created_at: '2023-02-01',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ rows: mockInstances.map((row) => ({ row })) }),
      } as Response);

      const result = await loadDataset('lite', {
        filter: (instance) => instance.repo === 'django/django',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.instances.length).toBe(1);
        const firstInstance = result.value.instances[0];
        expect(firstInstance).toBeDefined();
        expect(firstInstance?.repo).toBe('django/django');
      }
    });

    it('handles API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      const result = await loadDataset('lite');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(DatasetLoadError);
        expect(result.error.message).toContain('500');
      }
    });

    it('handles network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await loadDataset('lite');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(DatasetLoadError);
        expect(result.error.message).toContain('Failed to fetch');
      }
    });

    it('handles invalid response format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ invalid: 'format' }),
      } as Response);

      const result = await loadDataset('lite');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Invalid response format');
      }
    });

    it('filters invalid instances', async () => {
      const mockInstances = [
        {
          instance_id: 'valid__valid-1',
          repo: 'valid/valid',
          base_commit: 'abc123',
          problem_statement: 'Valid problem',
          created_at: '2023-01-01',
        },
        {
          instance_id: '',
          repo: 'invalid/invalid',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ rows: mockInstances.map((row) => ({ row })) }),
      } as Response);

      const result = await loadDataset('lite');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.instances.length).toBe(1);
        expect(result.value.filtered).toBe(1);
      }
    });
  });

  describe('getInstance', () => {
    it('retrieves a single instance by ID', async () => {
      const mockInstance = {
        instance_id: 'django__django-11099',
        repo: 'django/django',
        base_commit: 'abc123',
        problem_statement: 'Fix the bug',
        created_at: '2023-01-01',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ rows: [{ row: mockInstance }] }),
      } as Response);

      const result = await getInstance('lite', 'django__django-11099');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.instance_id).toBe('django__django-11099');
      }
    });

    it('returns error for non-existent instance', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ rows: [] }),
      } as Response);

      const result = await getInstance('lite', 'nonexistent__instance-1');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Instance not found');
      }
    });
  });

  describe('listInstances', () => {
    it('returns list of instance IDs', async () => {
      const mockInstances = [
        {
          instance_id: 'django__django-11099',
          repo: 'django/django',
          base_commit: 'abc123',
          problem_statement: 'Fix the bug',
          created_at: '2023-01-01',
        },
        {
          instance_id: 'sympy__sympy-20590',
          repo: 'sympy/sympy',
          base_commit: 'def456',
          problem_statement: 'Another issue',
          created_at: '2023-02-01',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ rows: mockInstances.map((row) => ({ row })) }),
      } as Response);

      const result = await listInstances('lite');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('django__django-11099');
        expect(result.value).toContain('sympy__sympy-20590');
      }
    });
  });

  describe('getDatasetInfo', () => {
    it('returns info for lite variant', () => {
      const info = getDatasetInfo('lite');

      expect(info.variant).toBe('lite');
      expect(info.num_instances).toBe(300);
      expect(info.hf_dataset_id).toBe('princeton-nlp/SWE-bench_Lite');
    });

    it('returns info for verified variant', () => {
      const info = getDatasetInfo('verified');

      expect(info.variant).toBe('verified');
      expect(info.num_instances).toBe(500);
    });

    it('returns info for full variant', () => {
      const info = getDatasetInfo('full');

      expect(info.variant).toBe('full');
      expect(info.num_instances).toBe(2294);
    });
  });

  describe('filter helpers', () => {
    const testInstance: SWEBenchInstance = {
      instance_id: 'django__django-11099',
      repo: 'django/django',
      base_commit: 'abc123',
      problem_statement: 'Fix the bug',
      created_at: '2023-01-01',
      version: '3.0',
    };

    describe('filterByRepo', () => {
      it('returns true for matching repo', () => {
        const filter = filterByRepo('django/django');
        expect(filter(testInstance)).toBe(true);
      });

      it('returns false for non-matching repo', () => {
        const filter = filterByRepo('sympy/sympy');
        expect(filter(testInstance)).toBe(false);
      });
    });

    describe('filterByVersion', () => {
      it('returns true for matching version', () => {
        const filter = filterByVersion('3.0');
        expect(filter(testInstance)).toBe(true);
      });

      it('returns false for non-matching version', () => {
        const filter = filterByVersion('4.0');
        expect(filter(testInstance)).toBe(false);
      });
    });
  });

  describe('DatasetLoadError', () => {
    it('stores cause when provided', () => {
      const cause = new Error('Original error');
      const error = new DatasetLoadError('Failed to load', cause);

      expect(error.message).toBe('Failed to load');
      expect(error.cause).toBe(cause);
      expect(error.name).toBe('DatasetLoadError');
    });

    it('works without cause', () => {
      const error = new DatasetLoadError('Simple error');

      expect(error.message).toBe('Simple error');
      expect(error.cause).toBeUndefined();
    });
  });
});
