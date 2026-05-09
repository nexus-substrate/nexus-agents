/**
 * Tests for sandbox detection (#2501).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { mockExistsSync, mockReadFileSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn<(path: string) => boolean>(),
  mockReadFileSync: vi.fn<(path: string, encoding: string) => string>(),
}));

vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}));

import { detectSandbox } from './sandbox-detection.js';

describe('detectSandbox', () => {
  let savedSandbox: string | undefined;
  let savedRoot: string | undefined;

  beforeEach(() => {
    savedSandbox = process.env['NEXUS_SANDBOX'];
    savedRoot = process.env['NEXUS_SANDBOX_ROOT'];
    delete process.env['NEXUS_SANDBOX'];
    delete process.env['NEXUS_SANDBOX_ROOT'];
    mockExistsSync.mockReset();
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReset();
    mockReadFileSync.mockReturnValue('');
  });

  afterEach(() => {
    if (savedSandbox === undefined) delete process.env['NEXUS_SANDBOX'];
    else process.env['NEXUS_SANDBOX'] = savedSandbox;
    if (savedRoot === undefined) delete process.env['NEXUS_SANDBOX_ROOT'];
    else process.env['NEXUS_SANDBOX_ROOT'] = savedRoot;
  });

  describe('explicit signal (NEXUS_SANDBOX env var)', () => {
    it('reports inactive when NEXUS_SANDBOX is unset', () => {
      const info = detectSandbox();
      expect(info.active).toBe(false);
      expect(info.flavor).toBeUndefined();
    });

    it('reports inactive when NEXUS_SANDBOX is empty string', () => {
      process.env['NEXUS_SANDBOX'] = '';
      const info = detectSandbox();
      expect(info.active).toBe(false);
      expect(info.flavor).toBeUndefined();
    });

    it('reports inactive when NEXUS_SANDBOX is whitespace-only', () => {
      process.env['NEXUS_SANDBOX'] = '   ';
      const info = detectSandbox();
      expect(info.active).toBe(false);
    });

    it('reports active with the flavor when NEXUS_SANDBOX is set', () => {
      process.env['NEXUS_SANDBOX'] = 'docker-opencode';
      const info = detectSandbox();
      expect(info.active).toBe(true);
      expect(info.flavor).toBe('docker-opencode');
    });

    it('trims whitespace around the flavor', () => {
      process.env['NEXUS_SANDBOX'] = '  codex  ';
      const info = detectSandbox();
      expect(info.flavor).toBe('codex');
    });
  });

  describe('NEXUS_SANDBOX_ROOT', () => {
    it('reports root when set', () => {
      process.env['NEXUS_SANDBOX'] = 'docker-opencode';
      process.env['NEXUS_SANDBOX_ROOT'] = '/projects';
      const info = detectSandbox();
      expect(info.root).toBe('/projects');
    });

    it('reports undefined root when unset', () => {
      process.env['NEXUS_SANDBOX'] = 'docker-opencode';
      const info = detectSandbox();
      expect(info.root).toBeUndefined();
    });

    it('reports undefined root when empty', () => {
      process.env['NEXUS_SANDBOX'] = 'docker-opencode';
      process.env['NEXUS_SANDBOX_ROOT'] = '';
      const info = detectSandbox();
      expect(info.root).toBeUndefined();
    });
  });

  describe('heuristic verification', () => {
    it('returns docker when /.dockerenv exists', () => {
      mockExistsSync.mockImplementation((p: string) => p === '/.dockerenv');
      const info = detectSandbox();
      expect(info.heuristicMatch).toBe('docker');
    });

    it('returns podman when /run/.containerenv exists', () => {
      mockExistsSync.mockImplementation((p: string) => p === '/run/.containerenv');
      const info = detectSandbox();
      expect(info.heuristicMatch).toBe('podman');
    });

    it('returns docker when /proc/1/cgroup contains docker', () => {
      mockExistsSync.mockImplementation((p: string) => p === '/proc/1/cgroup');
      mockReadFileSync.mockReturnValue('0::/docker/abc123\n');
      const info = detectSandbox();
      expect(info.heuristicMatch).toBe('docker');
    });

    it('returns docker when /proc/1/cgroup contains containerd', () => {
      mockExistsSync.mockImplementation((p: string) => p === '/proc/1/cgroup');
      mockReadFileSync.mockReturnValue('0::/containerd/foo\n');
      const info = detectSandbox();
      expect(info.heuristicMatch).toBe('docker');
    });

    it('returns unknown when no markers match', () => {
      mockExistsSync.mockReturnValue(false);
      const info = detectSandbox();
      expect(info.heuristicMatch).toBe('unknown');
    });

    it('returns null when fs check throws (non-Linux host with no /proc, etc.)', () => {
      mockExistsSync.mockImplementation(() => {
        throw new Error('EACCES');
      });
      const info = detectSandbox();
      expect(info.heuristicMatch).toBeNull();
    });

    it('runs heuristic independently of NEXUS_SANDBOX (verification, not gate)', () => {
      // Active by env var, but the heuristic still runs and reports unknown.
      process.env['NEXUS_SANDBOX'] = 'docker-opencode';
      mockExistsSync.mockReturnValue(false);
      const info = detectSandbox();
      expect(info.active).toBe(true);
      expect(info.heuristicMatch).toBe('unknown');
    });
  });
});
