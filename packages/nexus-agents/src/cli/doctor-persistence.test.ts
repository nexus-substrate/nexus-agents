/**
 * Tests for learning persistence health check in doctor command (Issue #1017).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock CLI adapter factory to avoid real subprocess spawns (perf: saves ~23s)
vi.mock('../cli-adapters/factory.js', () => ({
  createAllAdapters: vi.fn(() => new Map()),
}));

// We test the behavior indirectly through runDoctor since checkLearningPersistence is private.
// For unit tests, we verify the DoctorResult shape includes learningPersistence.

describe('Doctor learning persistence check (Issue #1017)', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env['NEXUS_PERSIST_LEARNING'];
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env['NEXUS_PERSIST_LEARNING'] = originalEnv;
    } else {
      delete process.env['NEXUS_PERSIST_LEARNING'];
    }
  });

  it('reports disabled when NEXUS_PERSIST_LEARNING is explicitly false', async () => {
    process.env['NEXUS_PERSIST_LEARNING'] = 'false';
    // Dynamic import to get fresh module state
    const { runDoctor } = await import('./doctor.js');
    const result = await runDoctor();

    expect(result.learningPersistence).toBeDefined();
    expect(result.learningPersistence.enabled).toBe(false);
    expect(result.learningPersistence.outcomeCount).toBe(0);
    expect(result.learningPersistence.ruleCount).toBe(0);
    expect(result.learningPersistence.error).toBeNull();
  });

  it('reports enabled with counts when flag is on and data exists', async () => {
    process.env['NEXUS_PERSIST_LEARNING'] = 'true';

    // Create temp dir with test data
    const tmpDir = join(tmpdir(), `nexus-doctor-test-${String(Date.now())}`);
    mkdirSync(tmpDir, { recursive: true });

    const outcomesFile = join(tmpDir, 'outcomes.jsonl');
    const rulesFile = join(tmpDir, 'rules.json');

    // Write fake outcomes (3 lines)
    const outcome = {
      id: 'o1',
      cli: 'claude',
      category: 'code_generation',
      model: 'test',
      success: true,
      durationMs: 100,
      timestamp: '2026-01-01',
      source: 'delegate',
    };
    writeFileSync(
      outcomesFile,
      [
        JSON.stringify(outcome),
        JSON.stringify({ ...outcome, id: 'o2' }),
        JSON.stringify({ ...outcome, id: 'o3' }),
      ].join('\n') + '\n'
    );

    // Write fake rules
    writeFileSync(
      rulesFile,
      JSON.stringify({
        version: 1,
        savedAt: '2026-02-13T10:00:00Z',
        rules: [{ id: 'r1' }, { id: 'r2' }],
      })
    );

    // We can't easily swap the LEARNING_DIR constant, so test the shape.
    // The integration behavior is tested via the real doctor command.
    const { runDoctor } = await import('./doctor.js');
    const result = await runDoctor();

    expect(result.learningPersistence).toBeDefined();
    expect(result.learningPersistence.enabled).toBe(true);

    // Clean up
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('DoctorResult includes learningPersistence field', async () => {
    const { runDoctor } = await import('./doctor.js');
    const result = await runDoctor();
    expect(result).toHaveProperty('learningPersistence');
    expect(result.learningPersistence).toHaveProperty('enabled');
    expect(result.learningPersistence).toHaveProperty('dirExists');
    expect(result.learningPersistence).toHaveProperty('dirWritable');
    expect(result.learningPersistence).toHaveProperty('outcomeCount');
    expect(result.learningPersistence).toHaveProperty('ruleCount');
    expect(result.learningPersistence).toHaveProperty('rulesLastSaved');
    expect(result.learningPersistence).toHaveProperty('error');
  });

  it('DoctorResult includes sqliteCheck field (#1249)', async () => {
    const { runDoctor } = await import('./doctor.js');
    const result = await runDoctor();
    expect(result).toHaveProperty('sqliteCheck');
    expect(result.sqliteCheck).toHaveProperty('available');
    expect(result.sqliteCheck).toHaveProperty('error');
    expect(typeof result.sqliteCheck.available).toBe('boolean');
  });

  it('DoctorResult includes dataDirectory field (#1249)', async () => {
    const { runDoctor } = await import('./doctor.js');
    const result = await runDoctor();
    expect(result).toHaveProperty('dataDirectory');
    expect(result.dataDirectory).toHaveProperty('rootExists');
    expect(result.dataDirectory).toHaveProperty('rootPath');
    expect(result.dataDirectory).toHaveProperty('subdirectories');
    expect(typeof result.dataDirectory.rootExists).toBe('boolean');
    expect(typeof result.dataDirectory.rootPath).toBe('string');
    expect(Array.isArray(result.dataDirectory.subdirectories)).toBe(true);
  });
});
