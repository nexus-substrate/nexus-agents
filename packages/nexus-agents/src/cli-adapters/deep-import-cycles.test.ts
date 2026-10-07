/**
 * Each of these modules must load as the first and only import (#7214).
 *
 * Two low-level modules imported `createLogger` through the `core/index.ts`
 * barrel, and that barrel reaches the router:
 *
 * - `config/manifest-overlay.ts` → `core/index.ts` → … →
 *   `cli-adapters/model-to-cli-adapter.ts`, which reads
 *   `FALLBACK_CONTEXT_WINDOW` from `config/model-config-helpers.ts` while that
 *   module is still waiting on `manifest-overlay.ts` (via `model-registry.ts`).
 * - `orchestration/outcomes/outcome-types.ts` → `core/index.ts` → … →
 *   `pipeline/pipeline-run-id.ts`, which reads `TRACE_ID_MAX_LENGTH` from
 *   `outcome-types.ts` before it has initialized.
 *
 * Loading through the package index orders both cycles so they never trip, and
 * so does vitest, so only a real Node ESM load as the first import shows the
 * crash: `ReferenceError: Cannot access '<X>' before initialization`. A TDZ in
 * one module poisons the graph for later imports in the same process, so each
 * module gets its own process.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const tsxEsm = createRequire(import.meta.url).resolve('tsx/esm');
const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUBPROCESS_TIMEOUT_MS = 120_000;

/** Every entry point #7214 listed, relative to `src/`. */
const DEEP_IMPORT_ENTRY_POINTS = [
  // FALLBACK_CONTEXT_WINDOW cycle
  'cli-adapters/breaker-key.ts',
  'cli-adapters/budget-utils.ts',
  'cli-adapters/cli-adapter-diagnostics.ts',
  'cli-adapters/cli-to-model-adapter.ts',
  'cli-adapters/composite-router-scoring-stages.ts',
  'cli-adapters/factory.ts',
  'cli-adapters/gateway-slot-arm.ts',
  'cli-adapters/index.ts',
  'cli-adapters/resolve-model-for-tier.ts',
  'cli-adapters/topsis-types.ts',
  'cli-adapters/types-capability.ts',
  'cli-adapters/types.ts',
  'adapters/claude-adapter-types.ts',
  'adapters/optional-params.ts',
  // TRACE_ID_MAX_LENGTH cycle
  'cli-adapters/cli-timeout-helpers.ts',
  'cli-adapters/cli-timeout-profiles.ts',
] as const;

interface LoadResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function loadAlone(dir: string, moduleRelPath: string): Promise<LoadResult> {
  const entry = join(dir, `${moduleRelPath.replace(/[/.]/g, '_')}.mts`);
  const target = pathToFileURL(join(srcRoot, moduleRelPath)).href;
  writeFileSync(entry, `import ${JSON.stringify(target)};\nconsole.log('loaded');\n`);

  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ['--import', tsxEsm, entry], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: SUBPROCESS_TIMEOUT_MS,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (status) => {
      resolvePromise({ status, stdout, stderr });
    });
  });
}

describe('deep imports under tsx (#7214)', () => {
  let dir: string;
  const results = new Map<string, Promise<LoadResult>>();

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'deep-import-cycles-'));
    for (const moduleRelPath of DEEP_IMPORT_ENTRY_POINTS) {
      results.set(moduleRelPath, loadAlone(dir, moduleRelPath));
    }
  });

  afterAll(async () => {
    await Promise.allSettled(results.values());
    rmSync(dir, { recursive: true, force: true });
  });

  it.each(DEEP_IMPORT_ENTRY_POINTS)(
    'loads %s as the first and only import',
    async (moduleRelPath) => {
      const pending = results.get(moduleRelPath);
      if (pending === undefined) throw new Error(`no load started for ${moduleRelPath}`);
      const result = await pending;

      expect(result.stderr).not.toContain('before initialization');
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('loaded');
    },
    SUBPROCESS_TIMEOUT_MS + 10_000
  );
});
