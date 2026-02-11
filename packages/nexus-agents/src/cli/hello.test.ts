/**
 * Tests for Hello Command
 *
 * Verifies the hello command displays correct system information
 * and works without requiring API keys.
 *
 * (Source: Issue #423 - Hello World Command)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { helloCommand, gatherSystemInfo, printHelloResult, type HelloResult } from './hello.js';

describe('Hello Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('gatherSystemInfo()', () => {
    it('should return version from VERSION constant', () => {
      const result = gatherSystemInfo();

      expect(result.version).toBeDefined();
      expect(typeof result.version).toBe('string');
      expect(result.version).toMatch(/^\d+\.\d+\.\d+|^dev$/);
    });

    it('should return Node.js version from process.version', () => {
      const result = gatherSystemInfo();

      expect(result.nodeVersion).toBe(process.version);
      expect(result.nodeVersion).toMatch(/^v\d+\.\d+\.\d+/);
    });

    it('should return platform from process.platform', () => {
      const result = gatherSystemInfo();

      expect(result.platform).toBe(process.platform);
    });

    it('should return architecture from process.arch', () => {
      const result = gatherSystemInfo();

      expect(result.arch).toBe(process.arch);
    });

    it('should count API keys correctly when none configured', () => {
      // Store original values
      const originalAnthropicKey = process.env['ANTHROPIC_API_KEY'];
      const originalOpenaiKey = process.env['OPENAI_API_KEY'];
      const originalGoogleKey = process.env['GOOGLE_AI_API_KEY'];

      // Clear all API keys
      delete process.env['ANTHROPIC_API_KEY'];
      delete process.env['OPENAI_API_KEY'];
      delete process.env['GOOGLE_AI_API_KEY'];

      try {
        const result = gatherSystemInfo();

        expect(result.apiKeysConfigured).toBe(0);
        expect(result.apiKeysTotal).toBe(3);
      } finally {
        // Restore original values
        if (originalAnthropicKey !== undefined) {
          process.env['ANTHROPIC_API_KEY'] = originalAnthropicKey;
        }
        if (originalOpenaiKey !== undefined) {
          process.env['OPENAI_API_KEY'] = originalOpenaiKey;
        }
        if (originalGoogleKey !== undefined) {
          process.env['GOOGLE_AI_API_KEY'] = originalGoogleKey;
        }
      }
    });

    it('should count API keys correctly when some configured', () => {
      // Store original value
      const originalAnthropicKey = process.env['ANTHROPIC_API_KEY'];

      // Set one API key
      process.env['ANTHROPIC_API_KEY'] = 'test-key-123';

      try {
        const result = gatherSystemInfo();

        expect(result.apiKeysConfigured).toBeGreaterThanOrEqual(1);
        expect(result.apiKeysTotal).toBe(3);
      } finally {
        // Restore original value
        if (originalAnthropicKey !== undefined) {
          process.env['ANTHROPIC_API_KEY'] = originalAnthropicKey;
        } else {
          delete process.env['ANTHROPIC_API_KEY'];
        }
      }
    });

    it('should not count empty string as configured API key', () => {
      const originalAnthropicKey = process.env['ANTHROPIC_API_KEY'];
      const originalOpenaiKey = process.env['OPENAI_API_KEY'];
      const originalGoogleKey = process.env['GOOGLE_AI_API_KEY'];

      // Set empty strings
      process.env['ANTHROPIC_API_KEY'] = '';
      process.env['OPENAI_API_KEY'] = '';
      process.env['GOOGLE_AI_API_KEY'] = '';

      try {
        const result = gatherSystemInfo();

        expect(result.apiKeysConfigured).toBe(0);
      } finally {
        // Restore original values
        if (originalAnthropicKey !== undefined) {
          process.env['ANTHROPIC_API_KEY'] = originalAnthropicKey;
        } else {
          delete process.env['ANTHROPIC_API_KEY'];
        }
        if (originalOpenaiKey !== undefined) {
          process.env['OPENAI_API_KEY'] = originalOpenaiKey;
        } else {
          delete process.env['OPENAI_API_KEY'];
        }
        if (originalGoogleKey !== undefined) {
          process.env['GOOGLE_AI_API_KEY'] = originalGoogleKey;
        } else {
          delete process.env['GOOGLE_AI_API_KEY'];
        }
      }
    });
  });

  describe('printHelloResult()', () => {
    it('should write output to stdout', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const result: HelloResult = {
        version: '2.4.0',
        nodeVersion: 'v22.0.0',
        platform: 'linux',
        arch: 'x64',
        apiKeysConfigured: 1,
        apiKeysTotal: 3,
      };

      printHelloResult(result);

      expect(writeSpy).toHaveBeenCalled();
      const output = writeSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('Welcome to Nexus Agents');
      expect(output).toContain('v2.4.0');
      expect(output).toContain('v22.0.0');
      expect(output).toContain('linux');
      expect(output).toContain('x64');
      expect(output).toContain('1 of 3');

      writeSpy.mockRestore();
    });

    it('should show quick start steps', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const result: HelloResult = {
        version: '2.4.0',
        nodeVersion: 'v22.0.0',
        platform: 'darwin',
        arch: 'arm64',
        apiKeysConfigured: 0,
        apiKeysTotal: 3,
      };

      printHelloResult(result);

      const output = writeSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('Quick Start');
      expect(output).toContain('nexus-agents setup');
      expect(output).toContain('nexus-agents doctor');
      expect(output).toContain('nexus-agents --help');

      writeSpy.mockRestore();
    });

    it('should show API key hint when none configured', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const result: HelloResult = {
        version: '2.4.0',
        nodeVersion: 'v22.0.0',
        platform: 'linux',
        arch: 'x64',
        apiKeysConfigured: 0,
        apiKeysTotal: 3,
      };

      printHelloResult(result);

      const output = writeSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('Tip');
      expect(output).toContain('ANTHROPIC_API_KEY');

      writeSpy.mockRestore();
    });

    it('should not show API key hint when keys configured', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const result: HelloResult = {
        version: '2.4.0',
        nodeVersion: 'v22.0.0',
        platform: 'linux',
        arch: 'x64',
        apiKeysConfigured: 2,
        apiKeysTotal: 3,
      };

      printHelloResult(result);

      const output = writeSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).not.toContain('Tip:');

      writeSpy.mockRestore();
    });

    it('should show documentation link', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const result: HelloResult = {
        version: '2.4.0',
        nodeVersion: 'v22.0.0',
        platform: 'linux',
        arch: 'x64',
        apiKeysConfigured: 1,
        apiKeysTotal: 3,
      };

      printHelloResult(result);

      const output = writeSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('github.com/williamzujkowski/nexus-agents');

      writeSpy.mockRestore();
    });
  });

  describe('helloCommand()', () => {
    it('should always return 0 (success)', () => {
      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const exitCode = helloCommand();

      expect(exitCode).toBe(0);
    });

    it('should call printHelloResult with gathered system info', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      helloCommand();

      // Verify output includes actual system info
      const output = writeSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('Welcome to Nexus Agents');
      expect(output).toContain(process.version);
      expect(output).toContain(process.platform);

      writeSpy.mockRestore();
    });
  });
});
