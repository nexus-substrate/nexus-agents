/** Real executable version-probe diagnostics and fail-closed results (#7317). */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, parse, relative } from 'node:path';
import { executeSecurityScan, prepareSecurityScan } from './security-scan.js';

const scenarios = [
  { name: 'timeout', script: 'exec /bin/sleep 30', reason: /version probe.*timed out/i },
  { name: 'empty output', script: "printf '  \\n'", reason: /version probe.*empty output/i },
  { name: 'execution failure', script: 'exit 7', reason: /version probe.*(?:exit|code) 7/i },
  { name: 'missing interpreter', script: 'exit 0', reason: /version probe.*ENOENT/i },
  { name: 'missing binary', script: undefined, reason: /not installed/i },
] as const;

describe('semgrep version probe failures (#7317)', () => {
  let directory: string;
  let binary: string;
  let probeMarker: string;
  let scanMarker: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nexus-scan-probe-'));
    binary = join(directory, 'semgrep');
    probeMarker = join(directory, 'probed');
    scanMarker = join(directory, 'scanned');
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  async function createScanner(script: string | undefined, name: string): Promise<void> {
    if (script === undefined) return;
    await writeFile(
      binary,
      [
        name === 'missing interpreter' ? '#!/definitely/missing/interpreter' : '#!/bin/sh',
        'if [ "$1" = "--version" ]; then',
        `  printf probed > '${probeMarker}'`,
        `  ${script}`,
        '  exit 0',
        'fi',
        `printf scanned > '${scanMarker}'`,
        '',
      ].join('\n'),
      { mode: 0o700 }
    );
  }

  for (const operation of ['execute', 'prepare'] as const) {
    it.each(scenarios)(`${operation} reports $name and fails closed`, async (scenario) => {
      await createScanner(scenario.script, scenario.name);
      const result =
        operation === 'execute'
          ? await executeSecurityScan(
              { target: directory, scanner: 'auto', rulesets: ['p/default'], maxFindings: 10 },
              {
                root: directory,
                preparedScan: { binary, version: '1.0.0', rulesets: [], flags: [] },
              }
            )
          : await prepareSecurityScan(['p/default'], { directory, env: { PATH: directory } });

      expect(result).toEqual({ error: expect.stringMatching(scenario.reason) });
      if (scenario.script !== undefined) {
        expect('error' in result && result.error).not.toMatch(/not installed|pip install/i);
      }
      if (scenario.script !== undefined && scenario.name !== 'missing interpreter') {
        expect(await readFile(probeMarker, 'utf8')).toBe('probed');
      }
      await expect(readFile(scanMarker)).rejects.toMatchObject({ code: 'ENOENT' });
    });
  }

  it.each(['absolute', 'relative'])(
    'recognizes an existing scanner on %s PATH',
    async (pathKind) => {
      await createScanner('exit 0', 'missing interpreter');
      const scannerPath =
        pathKind === 'absolute' ? directory : relative(parse(directory).root, directory);
      const result = await executeSecurityScan(
        { target: directory, scanner: 'auto', rulesets: ['p/default'], maxFindings: 10 },
        { root: directory, env: { PATH: scannerPath } }
      );
      expect(result).toEqual({ error: expect.stringMatching(/version probe.*ENOENT/i) });
      expect('error' in result && result.error).not.toMatch(/not installed|pip install/i);
      await expect(readFile(scanMarker)).rejects.toMatchObject({ code: 'ENOENT' });
    }
  );
});
