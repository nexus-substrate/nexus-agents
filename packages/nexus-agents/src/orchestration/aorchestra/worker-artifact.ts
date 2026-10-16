/**
 * Worker artifact reader and inline delivery helper (#7413).
 *
 * Provides safe, bounded artifact reading and inlining for read-only workers
 * whose transport does not provide native reader tools (such as Codex).
 *
 * @module orchestration/aorchestra/worker-artifact
 */

import { createHash } from 'node:crypto';
import { statSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { ok, err, type Result } from '../../core/result.js';
import { MAX_WORKER_PROMPT_BYTES } from './compose-worker-prompt.js';

/** Maximum byte limit for a single inlined artifact file. */
export const MAX_INLINE_ARTIFACT_BYTES = 100_000;

export interface InlinedArtifact {
  readonly name: string;
  readonly path: string;
  readonly content: string;
  readonly bytes: number;
  readonly sha256: string;
}

/** Determines if a transport or CLI identity is Codex-shaped (#7413). */
export function isCodexTransport(cliOrProviderId?: string): boolean {
  if (cliOrProviderId === undefined) return false;
  const normalized = cliOrProviderId.toLowerCase();
  return (
    normalized === 'codex' ||
    normalized === 'cli-codex' ||
    normalized.endsWith('/codex') ||
    normalized.endsWith('-codex')
  );
}

/**
 * Derives permitted reader tools for an execution transport under read-only-analysis (#7413).
 * Claude provides native Read, Grep, Glob tools; Codex provides no reader tools.
 */
export function transportReaderTools(cliOrProviderId?: string): readonly string[] {
  return isCodexTransport(cliOrProviderId) ? [] : ['Read', 'Grep', 'Glob'];
}

/**
 * Reads a single bounded text artifact file from disk.
 * Fails closed if the file does not exist, is a directory/special file,
 * contains NUL bytes (binary), is empty, or exceeds the byte cap.
 */
export function readWorkerArtifact(filePath: string): Result<InlinedArtifact, string> {
  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    return err(`Artifact does not exist or is not a regular file: ${filePath}`);
  }

  if (!stat.isFile()) {
    return err(`Artifact does not exist or is not a regular file: ${filePath}`);
  }

  if (stat.size === 0) {
    return err(`Artifact is empty; an artifact must have content: ${filePath}`);
  }

  if (stat.size > MAX_INLINE_ARTIFACT_BYTES || stat.size > MAX_WORKER_PROMPT_BYTES) {
    return err(
      `Artifact is ${String(stat.size)} bytes; cap is ${String(MAX_INLINE_ARTIFACT_BYTES)} bytes: ${filePath}`
    );
  }

  let buffer: Buffer;
  try {
    buffer = readFileSync(filePath);
  } catch {
    return err(`Failed to read artifact: ${filePath}`);
  }

  if (buffer.includes(0)) {
    return err(`Artifact is binary (contains a NUL byte): ${filePath}`);
  }

  let content: string;
  try {
    content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
  } catch {
    return err(`Artifact cannot be decoded as UTF-8: ${filePath}`);
  }

  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const name = basename(filePath);

  return ok({
    name,
    path: filePath,
    content,
    bytes: buffer.byteLength,
    sha256,
  });
}

/**
 * Inlines a list of artifact files into a structured markdown block for worker prompts.
 * Returns an error if any file cannot be read or verified.
 */
export function inlineWorkerArtifacts(filePaths: readonly string[]): Result<string, string> {
  if (filePaths.length === 0) return ok('');

  const sections: string[] = [];
  for (const filePath of filePaths) {
    const read = readWorkerArtifact(filePath);
    if (!read.ok) return read;

    const { name, sha256, bytes, content } = read.value;
    const header = `Artifact: ${name} sha256:${sha256} ${String(bytes)} bytes`;
    sections.push(
      `${header}\n===== BEGIN ARTIFACT: ${name} =====\n${content}\n===== END ARTIFACT =====`
    );
  }

  return ok(sections.join('\n\n'));
}
