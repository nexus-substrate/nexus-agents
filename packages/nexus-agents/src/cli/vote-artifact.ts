/** Bounded text artifacts shared by the CLI and MCP vote boundaries. */
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { basename } from 'node:path';

/** Byte limit for text attached to a vote proposal. */
export const MAX_VOTE_ARTIFACT_BYTES = 256 * 1024;

function oversizedArtifact(bytes: number): Error {
  return new Error(
    `Vote artifact is ${String(bytes)} bytes; cap is ${String(MAX_VOTE_ARTIFACT_BYTES)} bytes`
  );
}

/** Read at most cap + 1 bytes, including when a file grows after stat. */
async function readBoundedArtifact(artifactPath: string): Promise<Buffer> {
  const file = await open(artifactPath, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile()) throw new Error('Vote artifact must be a regular file');
    if (stat.size > MAX_VOTE_ARTIFACT_BYTES) throw oversizedArtifact(stat.size);
    const buffer = Buffer.alloc(MAX_VOTE_ARTIFACT_BYTES + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await file.read(buffer, size, buffer.length - size, null);
      if (bytesRead === 0) break;
      size += bytesRead;
    }
    if (size > MAX_VOTE_ARTIFACT_BYTES) {
      throw oversizedArtifact(Math.max(size, (await file.stat()).size));
    }
    return buffer.subarray(0, size);
  } finally {
    await file.close();
  }
}

/** Inline a file into the proposal every voter consumes and the recorder hashes. */
export async function inlineVoteArtifact(
  proposal: string,
  artifactPath: string | undefined,
  displayName?: string
): Promise<string> {
  if (artifactPath === undefined) return proposal;
  const bytes = await readBoundedArtifact(artifactPath);
  if (bytes.length === 0) throw new Error('Vote artifact is empty; an artifact must have content');
  if (bytes.includes(0)) throw new Error('Vote artifact is binary (contains a NUL byte)');
  const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const digest = createHash('sha256').update(bytes).digest('hex');
  const header = `Artifact: ${displayName ?? basename(artifactPath)} sha256:${digest} ${String(bytes.length)} bytes`;
  return `${proposal}\n\n${header}\n===== BEGIN ARTIFACT =====\n${content}\n===== END ARTIFACT =====`;
}
