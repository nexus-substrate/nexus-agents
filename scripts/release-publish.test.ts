import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  evaluatePublishExit,
  parsePublishFailures,
  readLocalVersions,
  teeCommand,
} from './release-publish.js';

/** The failure block exactly as changesets v3.0.2 printed it in run 35831579625 (#6500). */
const STAGED_8_83_0 = [
  '🦋 changeset v3.0.2',
  '',
  'These packages will be published as they were not found in the registry:',
  'nexus-agents@8.83.0',
  '1 packages are already published.',
  '\u001b[1G\u001b[J\u001b[?25h',
  'Some packages failed to publish:',
  'nexus-agents@8.83.0',
  '└ E409: 409 Conflict - PUT https://registry.npmjs.org/nexus-agents - Cannot publish over previously staged version "8.83.0".',
  '🦋 Exited with code 1',
  '',
].join('\n');

const LOCAL = new Map([
  ['nexus-agents', '8.83.0'],
  ['nexus-memory', '1.4.0'],
]);

/** Build a failure block for `entries` of [name@version, error line or undefined]. */
function failureBlock(entries: ReadonlyArray<readonly [string, string | undefined]>): string {
  const lines = ['Some packages failed to publish:'];
  for (const [id, error] of entries) {
    lines.push(id);
    if (error !== undefined) lines.push(`└ ${error}`);
  }
  return [...lines, '🦋 Exited with code 1'].join('\n');
}

const stagedError = (name: string, version: string): string =>
  `E409: 409 Conflict - PUT https://registry.npmjs.org/${name} - Cannot publish over previously staged version "${version}".`;

describe('parsePublishFailures', () => {
  it('parses the real changesets v3 E409 staged-version block', () => {
    expect(parsePublishFailures(STAGED_8_83_0)).toEqual([
      {
        name: 'nexus-agents',
        version: '8.83.0',
        error: stagedError('nexus-agents', '8.83.0'),
      },
    ]);
  });

  it('strips ANSI colour codes changesets wraps around names, versions and the error', () => {
    const coloured =
      'Some packages failed to publish:\n\u001b[94mnexus-agents\u001b[39m@\u001b[31m8.83.0\u001b[39m\n' +
      `\u001b[2m└\u001b[22m ${stagedError('nexus-agents', '8.83.0')}\n`;
    expect(parsePublishFailures(coloured)).toEqual([
      { name: 'nexus-agents', version: '8.83.0', error: stagedError('nexus-agents', '8.83.0') },
    ]);
  });

  it('parses scoped names and entries that carry no error line', () => {
    const out = failureBlock([
      ['@scope/pkg@2.0.0', 'E403: forbidden'],
      ['nexus-memory@1.4.0', undefined],
    ]);
    expect(parsePublishFailures(out)).toEqual([
      { name: '@scope/pkg', version: '2.0.0', error: 'E403: forbidden' },
      { name: 'nexus-memory', version: '1.4.0', error: undefined },
    ]);
  });

  it('returns no failures when the output has no failure section', () => {
    expect(parsePublishFailures('Successfully published:\nnexus-agents@8.83.0\n')).toEqual([]);
    expect(parsePublishFailures('')).toEqual([]);
  });
});

describe('evaluatePublishExit', () => {
  it('passes a zero exit through untouched', () => {
    expect(evaluatePublishExit({ exitCode: 0, output: '', localVersions: LOCAL })).toEqual({
      ok: true,
      staged: [],
    });
  });

  it('forgives the real staged-version E409 for the local version (#6500)', () => {
    const verdict = evaluatePublishExit({
      exitCode: 1,
      output: STAGED_8_83_0,
      localVersions: LOCAL,
    });
    expect(verdict).toEqual({
      ok: true,
      staged: [
        { name: 'nexus-agents', version: '8.83.0', error: stagedError('nexus-agents', '8.83.0') },
      ],
    });
  });

  it('forgives several failures only when every one is a staged E409 for its local version', () => {
    const out = failureBlock([
      ['nexus-agents@8.83.0', stagedError('nexus-agents', '8.83.0')],
      ['nexus-memory@1.4.0', stagedError('nexus-memory', '1.4.0')],
    ]);
    const verdict = evaluatePublishExit({ exitCode: 1, output: out, localVersions: LOCAL });
    expect(verdict.ok).toBe(true);
  });

  it('fails a non-zero exit with zero parsed failures — the empty case is not a pass', () => {
    const verdict = evaluatePublishExit({
      exitCode: 1,
      output: 'npm ERR! network',
      localVersions: LOCAL,
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/no parsable/);
  });

  it('fails when the staged version differs from the local package.json version', () => {
    const out = failureBlock([['nexus-agents@8.83.0', stagedError('nexus-agents', '8.82.0')]]);
    const verdict = evaluatePublishExit({ exitCode: 1, output: out, localVersions: LOCAL });
    expect(verdict.ok).toBe(false);
  });

  it('fails when the failed entry version is not the local version, even if the E409 names it', () => {
    const out = failureBlock([['nexus-agents@8.84.0', stagedError('nexus-agents', '8.84.0')]]);
    const verdict = evaluatePublishExit({ exitCode: 1, output: out, localVersions: LOCAL });
    expect(verdict.ok).toBe(false);
  });

  it('fails when the failed entry version is not local, even if the E409 names the local version', () => {
    const out = failureBlock([['nexus-agents@8.84.0', stagedError('nexus-agents', '8.83.0')]]);
    const verdict = evaluatePublishExit({ exitCode: 1, output: out, localVersions: LOCAL });
    expect(verdict.ok).toBe(false);
  });

  it('fails a package that has no local package.json', () => {
    const out = failureBlock([['ghost@8.83.0', stagedError('ghost', '8.83.0')]]);
    expect(evaluatePublishExit({ exitCode: 1, output: out, localVersions: LOCAL }).ok).toBe(false);
  });

  it('fails a mix of a staged E409 and any other failure', () => {
    const out = failureBlock([
      ['nexus-agents@8.83.0', stagedError('nexus-agents', '8.83.0')],
      ['nexus-memory@1.4.0', 'E403: 403 Forbidden - PUT https://registry.npmjs.org/nexus-memory'],
    ]);
    const verdict = evaluatePublishExit({ exitCode: 1, output: out, localVersions: LOCAL });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/nexus-memory@1\.4\.0/);
  });

  it('fails a plain E409 that is not the staged-version conflict', () => {
    const out = failureBlock([
      [
        'nexus-agents@8.83.0',
        'E409: 409 Conflict - PUT https://registry.npmjs.org/nexus-agents - "8.83.0"',
      ],
    ]);
    expect(evaluatePublishExit({ exitCode: 1, output: out, localVersions: LOCAL }).ok).toBe(false);
  });

  it('fails the staged message under a non-E409 code', () => {
    const out = failureBlock([
      ['nexus-agents@8.83.0', stagedError('nexus-agents', '8.83.0').replace('E409', 'E500')],
    ]);
    expect(evaluatePublishExit({ exitCode: 1, output: out, localVersions: LOCAL }).ok).toBe(false);
  });

  it('fails a failed entry that carries no error line', () => {
    const out = failureBlock([['nexus-agents@8.83.0', undefined]]);
    expect(evaluatePublishExit({ exitCode: 1, output: out, localVersions: LOCAL }).ok).toBe(false);
  });

  it('fails a process killed by a signal (null exit code)', () => {
    const verdict = evaluatePublishExit({
      exitCode: null,
      output: STAGED_8_83_0,
      localVersions: LOCAL,
    });
    expect(verdict.ok).toBe(false);
  });
});

describe('readLocalVersions', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  });

  it('maps each workspace package name to its package.json version', () => {
    dir = mkdtempSync(join(tmpdir(), 'release-publish-'));
    for (const [folder, name, version] of [
      ['a', 'pkg-a', '1.2.3'],
      ['b', '@s/pkg-b', '4.5.6'],
    ] as const) {
      mkdirSync(join(dir, 'packages', folder), { recursive: true });
      writeFileSync(
        join(dir, 'packages', folder, 'package.json'),
        JSON.stringify({ name, version })
      );
    }
    mkdirSync(join(dir, 'packages', 'no-manifest'));
    expect(readLocalVersions(dir)).toEqual(
      new Map([
        ['pkg-a', '1.2.3'],
        ['@s/pkg-b', '4.5.6'],
      ])
    );
  });
});

describe('teeCommand', () => {
  it('captures combined output and the exit code of the child', async () => {
    const result = await teeCommand(
      process.execPath,
      [
        '-e',
        'process.stdout.write("out-line\\n"); process.stderr.write("err-line\\n"); process.exit(3)',
      ],
      process.env,
      { stdout: () => undefined, stderr: () => undefined }
    );
    expect(result.exitCode).toBe(3);
    expect(result.output).toContain('out-line');
    expect(result.output).toContain('err-line');
  });

  it('streams each chunk through unchanged', async () => {
    const seen: string[] = [];
    await teeCommand(
      process.execPath,
      ['-e', 'process.stdout.write("New tag: x@1.0.0\\n")'],
      process.env,
      {
        stdout: (chunk) => seen.push(chunk.toString()),
        stderr: () => undefined,
      }
    );
    expect(seen.join('')).toBe('New tag: x@1.0.0\n');
  });
});
