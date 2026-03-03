/**
 * Unit tests for repo-security-plan-tool.ts MCP tool wrapper.
 *
 * Tests the handler's input validation, success path, and error handling.
 * Mocks generateSecurityPlan to avoid external API calls.
 *
 * @module mcp/tools/repo-security-plan-tool.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RepoSecurityPlan } from './repo-security-plan-types.js';

// Mock the security plan generator
const mockGenerateSecurityPlan = vi.fn<[unknown], Promise<RepoSecurityPlan>>();

vi.mock('./repo-security-plan.js', () => ({
  generateSecurityPlan: (...args: unknown[]) => mockGenerateSecurityPlan(args[0]),
}));

// Import handler after mock setup — we need to test it directly
// The handler is not exported, so we test via the registration path
vi.mock('../middleware/tool-wrapper.js', () => ({
  wrapToolWithTimeout: (_name: string, fn: unknown) => fn,
  toSdkCallback: (fn: unknown) => fn,
  getToolTimeout: () => 30000,
}));

vi.mock('../middleware/secure-handler.js', () => ({
  createSecureHandler: (
    fn: (args: unknown, ctx: unknown) => unknown,
    opts: Record<string, unknown>
  ) => {
    // Return a handler that passes through to the original with a context
    return (args: unknown) =>
      fn(args, {
        logger: opts['logger'],
        requestId: 'test-req',
        toolName: opts['toolName'],
      });
  },
}));

// ============================================================================
// Test Setup
// ============================================================================

const SAMPLE_PLAN: RepoSecurityPlan = {
  repo: 'owner/repo',
  language: 'TypeScript',
  framework: 'Node.js',
  ciProvider: 'github-actions',
  existingTooling: ['eslint'],
  recommendations: [
    {
      name: 'semgrep',
      displayName: 'Semgrep',
      category: 'sast',
      license: 'LGPL-2.1',
      pricingModel: 'freemium',
      rationale: 'Multi-language SAST scanner',
      priority: 'critical',
      ciSnippet: 'uses: returntocorp/semgrep-action@v1',
    },
  ],
  conflicts: [],
  coverage: [{ category: 'sast', covered: true, scanners: ['semgrep'] }],
  gapsSummary: [],
};

describe('repo-security-plan-tool', () => {
  beforeEach(() => {
    mockGenerateSecurityPlan.mockReset();
  });

  describe('handler', () => {
    async function callHandler(args: unknown): Promise<{
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    }> {
      // Dynamically import to get the registered handler
      const { registerRepoSecurityPlanTool } = await import('./repo-security-plan-tool.js');

      let capturedHandler: ((args: unknown) => Promise<unknown>) | undefined;

      const mockServer = {
        registerTool: (
          _name: string,
          _schema: unknown,
          handler: (args: unknown) => Promise<unknown>
        ) => {
          capturedHandler = handler;
        },
      };

      const mockRateLimiter = {
        tryConsume: () => ({ allowed: true, remaining: 99 }),
      };

      registerRepoSecurityPlanTool(mockServer as never, { rateLimiter: mockRateLimiter as never });

      if (capturedHandler === undefined) {
        throw new Error('Handler was not registered');
      }

      return capturedHandler(args) as Promise<{
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      }>;
    }

    it('returns validation error for invalid input', async () => {
      const result = await callHandler({});
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Validation error');
    });

    it('returns validation error for missing repo field', async () => {
      const result = await callHandler({ maxScanners: 5 });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Validation error');
    });

    it('returns security plan on success', async () => {
      mockGenerateSecurityPlan.mockResolvedValueOnce(SAMPLE_PLAN);

      const result = await callHandler({ repo: 'owner/repo' });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0]?.text ?? '{}') as RepoSecurityPlan;
      expect(parsed.repo).toBe('owner/repo');
      expect(parsed.recommendations).toHaveLength(1);
      expect(parsed.recommendations[0]?.name).toBe('semgrep');
    });

    it('passes categories and maxScanners to generator', async () => {
      mockGenerateSecurityPlan.mockResolvedValueOnce(SAMPLE_PLAN);

      await callHandler({
        repo: 'owner/repo',
        categories: ['sast', 'sca'],
        maxScanners: 5,
      });

      expect(mockGenerateSecurityPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          repo: 'owner/repo',
          categories: ['sast', 'sca'],
          maxScanners: 5,
        })
      );
    });

    it('returns error response when generator throws', async () => {
      mockGenerateSecurityPlan.mockRejectedValueOnce(new Error('GitHub API unavailable'));

      const result = await callHandler({ repo: 'owner/repo' });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('failed');
    });
  });

  describe('registerRepoSecurityPlanTool', () => {
    it('registers tool with correct name', async () => {
      const { registerRepoSecurityPlanTool } = await import('./repo-security-plan-tool.js');

      let registeredName = '';
      const mockServer = {
        registerTool: (name: string) => {
          registeredName = name;
        },
      };

      const mockRateLimiter = {
        tryConsume: () => ({ allowed: true, remaining: 99 }),
      };

      registerRepoSecurityPlanTool(mockServer as never, { rateLimiter: mockRateLimiter as never });

      expect(registeredName).toBe('repo_security_plan');
    });
  });
});
