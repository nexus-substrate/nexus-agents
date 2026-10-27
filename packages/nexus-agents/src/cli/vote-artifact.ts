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

/** Read at most cap + 1 bytes, including when a file grows after stat.
 * Internal shared boundary for vote artifacts and pipeline acceptance files.
 */
export async function readBoundedArtifact(artifactPath: string): Promise<Buffer> {
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

/** Validate and frame bounded, complete UTF-8 text without replacing source bytes. */
export function inlineVoteArtifactText(
  proposal: string,
  source: string | Uint8Array,
  displayName: string
): string {
  // Buffer.from replaces lone UTF-16 surrogates; never hash that replacement
  // while claiming it represents the caller's original in-memory plan.
  if (typeof source === 'string' && !source.isWellFormed()) {
    throw new Error('Vote artifact contains a lone surrogate and cannot encode exact UTF-8');
  }
  const size = typeof source === 'string' ? Buffer.byteLength(source, 'utf8') : source.byteLength;
  if (size > MAX_VOTE_ARTIFACT_BYTES) throw oversizedArtifact(size);
  const bytes = Buffer.from(source);
  if (bytes.length === 0) throw new Error('Vote artifact is empty; an artifact must have content');
  if (bytes.includes(0)) throw new Error('Vote artifact is binary (contains a NUL byte)');
  const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const digest = createHash('sha256').update(bytes).digest('hex');
  const header = `Artifact: ${displayName} sha256:${digest} ${String(bytes.length)} bytes`;
  const framed = `${proposal}\n\n${header}\n===== BEGIN ARTIFACT =====\n${content}\n===== END ARTIFACT =====`;
  if (extractBoundArtifact(framed) === undefined) {
    throw new Error(`Failed to produce verifiable bound artifact block for ${displayName}`);
  }
  return framed;
}

/** Inline a file into the proposal every voter consumes and the recorder hashes. */
export async function inlineVoteArtifact(
  proposal: string,
  artifactPath: string | undefined,
  displayName?: string
): Promise<string> {
  if (artifactPath === undefined) return proposal;
  return inlineVoteArtifactText(
    proposal,
    await readBoundedArtifact(artifactPath),
    displayName ?? basename(artifactPath)
  );
}

const BOUND_ARTIFACT_BLOCK_RE =
  /\n\nArtifact:\s+(.+?)\s+sha256:([0-9a-f]{64})\s+(\d+)\s+bytes\n===== BEGIN ARTIFACT =====\n([\s\S]*?)\n===== END ARTIFACT =====(?:\n|$)/;

/** Extracts and cryptographically verifies bound artifact metadata from an inlined artifact block. */
export function extractBoundArtifact(proposal: string):
  | {
      displayName: string;
      digest: string;
      bytes: number;
    }
  | undefined {
  const match = BOUND_ARTIFACT_BLOCK_RE.exec(proposal);
  if (
    match?.[1] === undefined ||
    match[2] === undefined ||
    match[3] === undefined ||
    match[4] === undefined
  ) {
    return undefined;
  }
  const content = match[4];
  const declaredDigest = match[2];
  const declaredBytes = Number.parseInt(match[3], 10);
  const actualBytes = Buffer.from(content, 'utf8');
  if (actualBytes.length !== declaredBytes) {
    return undefined;
  }
  const actualDigest = createHash('sha256').update(actualBytes).digest('hex');
  if (actualDigest !== declaredDigest) {
    return undefined;
  }
  return {
    displayName: match[1],
    digest: `sha256:${declaredDigest}`,
    bytes: declaredBytes,
  };
}
