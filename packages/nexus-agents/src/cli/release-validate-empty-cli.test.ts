/** Real parser → release wrapper → command seam for zero measurements (#7444). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseCliArgs } from '../cli.js';
import { handleReleaseValidateCommand } from '../cli-release-handlers.js';
import * as validators from './release-validate-helpers.js';

const { execSyncGuard } = vi.hoisted(() => ({
  execSyncGuard: vi.fn(() => {
    throw new Error('Release validation test forbids subprocess execution');
  }),
}));

// Preserve the real command/barrel/wrapper. Only the actual subprocess boundary is guarded.
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execSync: execSyncGuard,
}));

const ALL_VALIDATORS = ['security', 'architecture', 'docs', 'devops'];
const outputLines: unknown[][] = [];

beforeEach(() => {
  vi.clearAllMocks();
  outputLines.length = 0;
  vi.spyOn(console, 'log').mockImplementation((...line: unknown[]) => {
    outputLines.push(line);
  });
  vi.spyOn(validators, 'validateSecurity');
  vi.spyOn(validators, 'validateArchitecture');
  vi.spyOn(validators, 'validateDocumentation');
  vi.spyOn(validators, 'validateDevOps');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('real release CLI refuses unmeasured readiness', () => {
  it.each([false, true])(
    'returns CLI1 and UNMEASURED for all skipped (strict=%s)',
    async (strict) => {
      const args = parseCliArgs([
        'release-validate',
        '11.7.0',
        ...ALL_VALIDATORS.flatMap((name) => ['--skip', name]),
        ...(strict ? ['--strict'] : []),
      ]);

      const result = await handleReleaseValidateCommand(args);
      const output = outputLines.map((line) => line.join(' ')).join('\n');

      expect(args.command).toBe('release-validate');
      expect(args.options.skip).toEqual(ALL_VALIDATORS);
      expect(result).toEqual({ success: false, exitCode: 1 });
      expect(output).toContain('UNMEASURED');
      expect(output).toContain('all validators skipped');
      expect(output).not.toContain('PASSED');
      expect(execSyncGuard).not.toHaveBeenCalled();
      expect(validators.validateSecurity).not.toHaveBeenCalled();
      expect(validators.validateArchitecture).not.toHaveBeenCalled();
      expect(validators.validateDocumentation).not.toHaveBeenCalled();
      expect(validators.validateDevOps).not.toHaveBeenCalled();
    }
  );

  it.each([
    { flags: [], exitCode: 0 },
    { flags: ['--strict'], exitCode: 1 },
    { flags: ['--force'], exitCode: 1 },
  ])(
    'preserves measured warnings and strict/force forwarding: $flags',
    async ({ flags, exitCode }) => {
      vi.mocked(validators.validateSecurity).mockResolvedValue({
        expert: 'security',
        passed: true,
        confidence: 1,
        findings: [
          { severity: 'warning', category: 'security', title: 'Measured warning', description: '' },
        ],
        durationMs: 1,
      });
      const args = parseCliArgs([
        'release-validate',
        '11.7.0',
        '--skip',
        'architecture',
        '--skip',
        'docs',
        '--skip',
        'devops',
        ...flags,
      ]);

      const result = await handleReleaseValidateCommand(args);

      expect(result).toEqual({ success: exitCode === 0, exitCode });
      expect(validators.validateSecurity).toHaveBeenCalledOnce();
      expect(execSyncGuard).not.toHaveBeenCalled();
    }
  );
});
