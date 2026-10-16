import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  isCodexTransport,
  transportReaderTools,
  readWorkerArtifact,
  inlineWorkerArtifacts,
} from './worker-artifact.js';

describe('worker-artifact (#7413)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'worker-artifact-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('isCodexTransport', () => {
    it.each(['codex', 'cli-codex'])('identifies %s as codex transport', (cli) => {
      expect(isCodexTransport(cli)).toBe(true);
    });

    it.each(['claude', 'cli-claude', 'gemini', 'opencode', 'custom-openai', undefined])(
      'identifies %s as non-codex transport',
      (cli) => {
        expect(isCodexTransport(cli)).toBe(false);
      }
    );
  });

  describe('transportReaderTools', () => {
    it('returns empty reader tools for codex', () => {
      expect(transportReaderTools('codex')).toEqual([]);
      expect(transportReaderTools('cli-codex')).toEqual([]);
    });

    it('returns Read, Grep, Glob for claude', () => {
      expect(transportReaderTools('claude')).toEqual(['Read', 'Grep', 'Glob']);
      expect(transportReaderTools('cli-claude')).toEqual(['Read', 'Grep', 'Glob']);
    });
  });

  describe('readWorkerArtifact', () => {
    it('reads a valid UTF-8 text file and returns content with sha256', () => {
      const filePath = join(tempDir, 'valid.ts');
      const content = 'export const answer = 42;\n';
      writeFileSync(filePath, content, 'utf-8');

      const result = readWorkerArtifact(filePath);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toBe(content);
        expect(result.value.bytes).toBe(Buffer.byteLength(content));
        expect(result.value.sha256).toMatch(/^[a-f0-9]{64}$/);
      }
    });

    it('fails when file does not exist', () => {
      const result = readWorkerArtifact(join(tempDir, 'nonexistent.ts'));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('does not exist or is not a regular file');
      }
    });

    it('fails when file contains binary NUL bytes', () => {
      const filePath = join(tempDir, 'binary.bin');
      writeFileSync(filePath, Buffer.from([0x00, 0x01, 0x02]));

      const result = readWorkerArtifact(filePath);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('binary (contains a NUL byte)');
      }
    });

    it('fails when file is empty', () => {
      const filePath = join(tempDir, 'empty.txt');
      writeFileSync(filePath, '', 'utf-8');

      const result = readWorkerArtifact(filePath);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('is empty');
      }
    });
  });

  describe('inlineWorkerArtifacts', () => {
    it('inlines multiple files with framing headers and digests', () => {
      const f1 = join(tempDir, 'file1.ts');
      const f2 = join(tempDir, 'file2.ts');
      writeFileSync(f1, 'const a = 1;\n', 'utf-8');
      writeFileSync(f2, 'const b = 2;\n', 'utf-8');

      const result = inlineWorkerArtifacts([f1, f2]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('===== BEGIN ARTIFACT: file1.ts =====');
        expect(result.value).toContain('const a = 1;');
        expect(result.value).toContain('===== END ARTIFACT =====');
        expect(result.value).toContain('===== BEGIN ARTIFACT: file2.ts =====');
        expect(result.value).toContain('const b = 2;');
      }
    });

    it('returns empty string when no files are provided', () => {
      const result = inlineWorkerArtifacts([]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('');
      }
    });

    it('fails if any file cannot be read', () => {
      const f1 = join(tempDir, 'file1.ts');
      writeFileSync(f1, 'const a = 1;\n', 'utf-8');

      const result = inlineWorkerArtifacts([f1, join(tempDir, 'missing.ts')]);
      expect(result.ok).toBe(false);
    });
  });
});
