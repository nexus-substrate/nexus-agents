/**
 * A deep import of `cli-error-envelope.ts` must load on its own (#7213).
 *
 * The module imported `adapters/rate-limit-detector.ts`, which imported the
 * `core/index.ts` barrel. That barrel reaches the router, which reaches
 * `cli-binary-on-path.ts`, which reads `GEMINI_CLI_COMMAND` from
 * `cli-error-envelope.ts` at module-evaluation time — before the envelope had
 * initialized it. Loading through the package index orders the cycle so it
 * never trips, and so does vitest, so only a real Node ESM load as the first
 * import shows the crash: `ReferenceError: Cannot access 'GEMINI_CLI_COMMAND'
 * before initialization`.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const tsxEsm = createRequire(import.meta.url).resolve('tsx/esm');
const here = dirname(fileURLToPath(import.meta.url));
const SUBPROCESS_TIMEOUT_MS = 60_000;

describe('cli-error-envelope deep import under tsx (#7213)', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it.each(['cli-error-envelope.ts', 'cli-binary-on-path.ts'])(
    'loads %s as the first and only import',
    (moduleFile) => {
      dir = mkdtempSync(join(tmpdir(), 'cli-envelope-deep-import-'));
      const entry = join(dir, 'entry.mts');
      const target = pathToFileURL(join(here, moduleFile)).href;
      writeFileSync(entry, `import ${JSON.stringify(target)};\nconsole.log('loaded');\n`);

      const result = spawnSync(process.execPath, ['--import', tsxEsm, entry], {
        encoding: 'utf8',
        timeout: SUBPROCESS_TIMEOUT_MS,
      });

      expect(result.stderr).not.toContain('before initialization');
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('loaded');
    },
    SUBPROCESS_TIMEOUT_MS + 10_000
  );
});
