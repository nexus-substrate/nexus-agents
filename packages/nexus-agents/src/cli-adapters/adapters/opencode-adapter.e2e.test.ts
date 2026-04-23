/**
 * OpenCode CLI Adapter — E2E Tests
 *
 * Tests real OpenCode CLI invocation (not mocked).
 * Gated behind OPENCODE_E2E=true environment variable.
 * Run via: OPENCODE_E2E=true pnpm vitest run --config vitest.config.opencode-e2e.ts
 *
 * (Source: Issue #1243)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { OpenCodeCliAdapter } from './opencode-adapter.js';
import { OpenCodeResponseParser } from '../parsers/opencode-parser.js';

const OPENCODE_E2E = process.env['OPENCODE_E2E'] === 'true';

function isOpenCodeAvailable(): boolean {
  try {
    execSync('opencode --version', { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!OPENCODE_E2E)('OpenCode E2E', () => {
  let adapter: OpenCodeCliAdapter;

  beforeAll(() => {
    adapter = new OpenCodeCliAdapter();
  });

  afterAll(async () => {
    await adapter.dispose();
  });

  describe('CLI availability', () => {
    it('should detect opencode on PATH', () => {
      expect(isOpenCodeAvailable()).toBe(true);
    });

    it('should return a valid version string', async () => {
      const version = await adapter.getVersion();

      expect(version).toBeDefined();
      expect(version).toMatch(/^\d+\.\d+\.\d+/);
    });

    it('should pass health check', async () => {
      const status = await adapter.healthCheck();

      expect(status.healthy).toBe(true);
      expect(status.version).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe('model listing', () => {
    it('should list models via opencode models command', () => {
      const output = execSync('opencode models', {
        timeout: 30_000,
        encoding: 'utf-8',
      });

      // Should have at least one model
      const lines = output
        .trim()
        .split('\n')
        .filter((l: string) => l.trim() !== '');
      expect(lines.length).toBeGreaterThanOrEqual(1);

      // Each line should be in provider/model format
      for (const line of lines) {
        expect(line).toMatch(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9._-]+$/);
      }
    });
  });

  describe('NDJSON parsing against real output', () => {
    it('should parse real opencode run --format json output', () => {
      // Get real NDJSON output from opencode (using free-tier model)
      let output: string;
      try {
        output = execSync(
          'opencode run --format json -m opencode/big-pickle "Respond with exactly: OK"',
          {
            timeout: 60_000,
            encoding: 'utf-8',
            env: { ...process.env, NO_COLOR: '1' },
          }
        );
      } catch (error: unknown) {
        // If the model isn't available, skip gracefully
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('rate limit') || msg.includes('unavailable')) {
          console.warn('Model rate-limited or unavailable, skipping NDJSON parse test');
          return;
        }
        throw error;
      }

      // Parse with our parser
      const parser = new OpenCodeResponseParser();
      const parsed = parser.parse(output);

      // Should successfully parse
      expect(parsed).not.toBeNull();
      if (parsed !== null) {
        expect(typeof parsed.content).toBe('string');
        expect(parsed.content.length).toBeGreaterThan(0);
      }
    });

    it('should extract response text from real output', () => {
      let output: string;
      try {
        output = execSync('opencode run --format json -m opencode/big-pickle "Say hello"', {
          timeout: 60_000,
          encoding: 'utf-8',
          env: { ...process.env, NO_COLOR: '1' },
        });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('rate limit') || msg.includes('unavailable')) {
          console.warn('Model rate-limited or unavailable, skipping');
          return;
        }
        throw error;
      }

      const parser = new OpenCodeResponseParser();
      const text = parser.extractResponse(output);

      expect(text).not.toBeNull();
      if (text !== null) {
        expect(text.length).toBeGreaterThan(0);
      }
    });
  });

  describe('adapter execution', () => {
    it('should execute a task via adapter and return Result', async () => {
      const result = await adapter.execute({
        content: 'Respond with exactly one word: OK',
        model: 'opencode/big-pickle',
      });

      if (!result.ok) {
        // Rate limit or model unavailability is acceptable in CI
        const isTransient =
          result.error.message.includes('rate limit') ||
          result.error.message.includes('unavailable') ||
          result.error.code === 'TIMEOUT';

        if (isTransient) {
          console.warn('Transient error in adapter execution, acceptable:', result.error.message);
          return;
        }

        // Non-transient errors should fail the test
        expect.fail(`Adapter execution failed: ${result.error.message} (${result.error.code})`);
      }

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(typeof result.value.text).toBe('string');
        expect(result.value.text.length).toBeGreaterThan(0);
      }
    });
  });

  describe('custom provider config validation', () => {
    it('should handle unknown custom model format with fallback info', () => {
      // Use a genuinely unregistered model id so the fallback branch runs.
      // 'custom/claude-opus-4-6' is now present in the canonical registry
      // (opencode-custom-opus, 1M context) and therefore does not hit the
      // fallback — which broke the original assertion.
      const customAdapter = new OpenCodeCliAdapter({
        model: 'custom/unregistered-model-x',
      });

      const info = customAdapter.getModelInfo();

      // Unknown custom model returns fallback info
      expect(info.id).toBe('custom/unregistered-model-x');
      expect(info.contextWindow).toBe(200_000);
    });
  });
});
