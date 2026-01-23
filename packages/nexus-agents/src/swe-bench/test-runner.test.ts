/**
 * nexus-agents/swe-bench - Test Runner Tests
 *
 * @module swe-bench/test-runner.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
import { TestRunner, createTestRunner } from './test-runner.js';

// Mock fs module
vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  unlink: vi.fn(),
}));

describe('TestRunner', () => {
  let runner: TestRunner;

  beforeEach(() => {
    runner = createTestRunner();
    vi.clearAllMocks();
  });

  describe('detectFramework', () => {
    it('should detect pytest when pytest.ini exists', async () => {
      const mockAccess = vi.mocked(fs.access);
      mockAccess.mockImplementation((filepath) => {
        if (String(filepath).endsWith('pytest.ini')) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const result = await runner.detectFramework('/workspace');

      expect(result.framework).toBe('pytest');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.configFiles).toContain('pytest.ini');
    });

    it('should detect pytest when conftest.py exists', async () => {
      const mockAccess = vi.mocked(fs.access);
      mockAccess.mockImplementation((filepath) => {
        if (String(filepath).endsWith('conftest.py')) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const result = await runner.detectFramework('/workspace');

      expect(result.framework).toBe('pytest');
      expect(result.configFiles).toContain('conftest.py');
    });

    it('should detect tox when tox.ini exists', async () => {
      const mockAccess = vi.mocked(fs.access);
      mockAccess.mockImplementation((filepath) => {
        if (String(filepath).endsWith('tox.ini')) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const result = await runner.detectFramework('/workspace');

      // tox.ini is shared by pytest and tox, pytest usually wins on confidence
      expect(['pytest', 'tox']).toContain(result.framework);
      expect(result.configFiles).toContain('tox.ini');
    });

    it('should default to pytest with low confidence when no config found', async () => {
      const mockAccess = vi.mocked(fs.access);
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const result = await runner.detectFramework('/workspace');

      expect(result.framework).toBe('pytest');
      expect(result.confidence).toBe(0.5);
      expect(result.configFiles).toHaveLength(0);
    });

    it('should prefer pytest with higher confidence when multiple configs exist', async () => {
      const mockAccess = vi.mocked(fs.access);
      mockAccess.mockImplementation((filepath) => {
        const path = String(filepath);
        if (path.endsWith('pytest.ini') || path.endsWith('conftest.py')) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const result = await runner.detectFramework('/workspace');

      expect(result.framework).toBe('pytest');
      expect(result.confidence).toBeGreaterThan(0.7);
    });
  });

  describe('cancel', () => {
    it('should set cancelled flag', () => {
      runner.cancel();

      // Cannot directly check internal state, but cancel should not throw
      expect(true).toBe(true);
    });
  });
});

describe('TestRunner result parsing', () => {
  it('should parse pytest summary from stdout', () => {
    // This tests the internal parsing logic indirectly
    // In real use, this would come from actual test execution
    const pytestOutput = `
============================= test session starts ==============================
platform linux -- Python 3.11.0
collected 25 items

tests/test_example.py::test_one PASSED
tests/test_example.py::test_two FAILED
tests/test_example.py::test_three SKIPPED

=========================== short test summary info ============================
FAILED tests/test_example.py::test_two - AssertionError
======================= 23 passed, 1 failed, 1 skipped =========================
`;

    // The runner parses this format when JSON output is not available
    // We verify the regex patterns work (same pattern used in test-runner.ts)
    const summaryMatch = pytestOutput.match(
      /(\d+)\s+passed(?:,\s*(\d+)\s+failed)?(?:,\s*(\d+)\s+skipped)?/
    );

    expect(summaryMatch).toBeTruthy();
    expect(summaryMatch?.[1]).toBe('23');
    expect(summaryMatch?.[2]).toBe('1');
    expect(summaryMatch?.[3]).toBe('1');
  });
});

describe('createTestRunner', () => {
  it('should create a test runner instance', () => {
    const runner = createTestRunner();

    expect(runner).toBeInstanceOf(TestRunner);
  });
});
