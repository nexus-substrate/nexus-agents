import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inlineVoteArtifact, MAX_VOTE_ARTIFACT_BYTES } from './vote-artifact.js';
import { parseCliArgs } from '../cli.js';

const CAP = 256 * 1024;
const hasMkfifo = ((): boolean => {
  try {
    execFileSync('mkfifo', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('vote artifact file (#7092)', () => {
  let dir: string;
  let path: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'vote-artifact-'));
    path = join(dir, 'resolution.diff');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('preserves the proposal when no artifact path is provided', async () => {
    expect(await inlineVoteArtifact('Ratify', undefined)).toBe('Ratify');
  });

  it('parses --artifact-file and carries its path', () => {
    const parsed = parseCliArgs(['vote', '-p', 'Ratify', '--artifact-file', path]);
    expect(parsed.options.artifactFile).toBe(path);
  });
  it('omits artifactFile when absent', () => {
    expect(parseCliArgs(['vote', '-p', 'Ratify']).options).not.toHaveProperty('artifactFile');
  });
  it('requires a flag value', () => {
    expect(() => parseCliArgs(['vote', '-p', 'Ratify', '--artifact-file'])).toThrow();
  });
  it('inlines exact content with basename, UTF-8 bytes, SHA-256 and markers', async () => {
    const content = '+ café 🌍\n';
    await writeFile(path, content);
    const digest = createHash('sha256').update(content).digest('hex');
    expect(await inlineVoteArtifact('Ratify', path)).toBe(
      `Ratify\n\nArtifact: resolution.diff sha256:${digest} ${String(Buffer.byteLength(content))} bytes\n` +
        `===== BEGIN ARTIFACT =====\n${content}\n===== END ARTIFACT =====`
    );
  });
  it('accepts exactly the byte cap without truncating', async () => {
    const content = 'é'.repeat(CAP / 2);
    await writeFile(path, content);
    expect(MAX_VOTE_ARTIFACT_BYTES).toBe(CAP);
    expect(await inlineVoteArtifact('Ratify', path)).toContain(content);
  });
  it('errors on a missing file', async () => {
    await expect(inlineVoteArtifact('Ratify', path)).rejects.toThrow(/ENOENT/);
  });
  it('errors on an empty file', async () => {
    await writeFile(path, '');
    await expect(inlineVoteArtifact('Ratify', path)).rejects.toThrow(/empty/i);
  });
  it('errors on binary content containing NUL', async () => {
    await writeFile(path, Buffer.from([65, 0, 66]));
    await expect(inlineVoteArtifact('Ratify', path)).rejects.toThrow(/binary|NUL/i);
  });
  // #7092: POSIX fixture requires coreutils mkfifo, as in read-only-mcp-isolation.test.ts.
  it.skipIf(!hasMkfifo)('rejects a named pipe promptly without waiting for a writer', async () => {
    execFileSync('mkfifo', [path]);
    const pending = inlineVoteArtifact('Ratify', path).catch((error: unknown) => error);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<string>((resolve) => {
      timer = setTimeout(() => {
        resolve('timed out');
      }, 1000);
    });
    const result = await Promise.race([pending, timeout]);
    try {
      expect(result).toBeInstanceOf(Error);
      expect(result).toHaveProperty('message', 'Vote artifact must be a regular file');
    } finally {
      clearTimeout(timer);
      if (result === 'timed out') {
        // Release the blocked reader before cleaning up the failed fixture.
        const writer = await open(path, 'r+');
        await pending;
        await writer.close();
      }
    }
  });

  it('rejects invalid UTF-8 rather than replacing bytes in the reviewed artifact', async () => {
    await writeFile(path, Buffer.from([0xc3, 0x28]));
    await expect(inlineVoteArtifact('Ratify', path)).rejects.toThrow(/UTF-8/i);
  });

  it('reports actual byte size and cap when exceeded', async () => {
    await writeFile(path, 'é'.repeat(CAP / 2 + 1));
    await expect(inlineVoteArtifact('Ratify', path)).rejects.toThrow(`${String(CAP + 2)} bytes`);
    await expect(inlineVoteArtifact('Ratify', path)).rejects.toThrow(`${String(CAP)} bytes`);
  });
});
