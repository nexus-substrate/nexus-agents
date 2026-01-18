/**
 * Tests for custom expert loader
 *
 * Verifies loading and validation of custom experts from config.
 * (Source: Issue #300, CODING_STANDARDS.md)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import {
  loadCustomExperts,
  formatValidationErrors,
  type CustomExpertError,
} from './custom-expert-loader.js';

// Mock fs modules
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

describe('custom-expert-loader', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env['NEXUS_CONFIG_PATH'];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('loadCustomExperts', () => {
    it('should return empty result when no config file exists', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const result = loadCustomExperts();

      expect(result.experts).toEqual([]);
      expect(result.errors).toEqual([]);
      expect(result.configPath).toBeUndefined();
    });

    it('should load custom experts from valid YAML config', () => {
      const validConfig = `
experts:
  builtin: true
  custom:
    rust_expert:
      systemPrompt: "You are a Rust expert specializing in systems programming."
      tier: powerful
      domain: code
      capabilities:
        - task_execution
        - code_generation
      temperature: 0.2
`;
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(validConfig);

      const result = loadCustomExperts('/path/to/config.yaml');

      expect(result.errors).toEqual([]);
      expect(result.experts).toHaveLength(1);
      expect(result.experts[0]).toMatchObject({
        id: 'custom-rust_expert',
        name: 'Rust Expert',
        role: 'custom',
        primaryDomain: 'code',
        capabilities: ['task_execution', 'code_generation'],
        available: true,
      });
    });

    it('should load multiple custom experts', () => {
      const multiExpertConfig = `
experts:
  custom:
    api_expert:
      systemPrompt: "You are an API design expert."
      tier: balanced
      domain: architecture
      capabilities:
        - task_execution
    testing_guru:
      systemPrompt: "You are a testing expert."
      tier: fast
      domain: testing
      capabilities:
        - task_execution
        - code_review
`;
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(multiExpertConfig);

      const result = loadCustomExperts('/path/to/config.yaml');

      expect(result.errors).toEqual([]);
      expect(result.experts).toHaveLength(2);
      expect(result.experts.map((e) => e.id)).toContain('custom-api_expert');
      expect(result.experts.map((e) => e.id)).toContain('custom-testing_guru');
    });

    it('should return validation error for invalid tier', () => {
      const invalidTierConfig = `
experts:
  custom:
    bad_expert:
      systemPrompt: "Test expert"
      tier: super
      domain: code
      capabilities:
        - task_execution
`;
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(invalidTierConfig);

      const result = loadCustomExperts('/path/to/config.yaml');

      expect(result.experts).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        expertId: 'bad_expert',
        field: 'tier',
      });
      expect(result.errors[0]?.suggestion).toContain('fast');
      expect(result.errors[0]?.suggestion).toContain('balanced');
      expect(result.errors[0]?.suggestion).toContain('powerful');
    });

    it('should return validation error for invalid domain', () => {
      const invalidDomainConfig = `
experts:
  custom:
    bad_expert:
      systemPrompt: "Test expert"
      tier: balanced
      domain: invalid_domain
      capabilities:
        - task_execution
`;
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(invalidDomainConfig);

      const result = loadCustomExperts('/path/to/config.yaml');

      expect(result.errors.length).toBeGreaterThan(0);
      const domainError = result.errors.find((e) => e.field === 'domain');
      expect(domainError).toBeDefined();
      expect(domainError?.suggestion).toContain('code');
      expect(domainError?.suggestion).toContain('security');
    });

    it('should return validation error for missing systemPrompt', () => {
      const missingPromptConfig = `
experts:
  custom:
    bad_expert:
      tier: balanced
      domain: code
      capabilities:
        - task_execution
`;
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(missingPromptConfig);

      const result = loadCustomExperts('/path/to/config.yaml');

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.field === 'systemPrompt')).toBe(true);
    });

    it('should return validation error for systemPrompt exceeding max length', () => {
      const longPrompt = 'x'.repeat(5000); // Exceeds 4000 char limit
      const longPromptConfig = `
experts:
  custom:
    verbose_expert:
      systemPrompt: "${longPrompt}"
      tier: balanced
      domain: code
      capabilities:
        - task_execution
`;
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(longPromptConfig);

      const result = loadCustomExperts('/path/to/config.yaml');

      expect(result.errors.length).toBeGreaterThan(0);
      const promptError = result.errors.find((e) => e.field === 'systemPrompt');
      expect(promptError).toBeDefined();
      expect(promptError?.suggestion).toContain('4000');
    });

    it('should return validation error for empty capabilities array', () => {
      const emptyCapabilitiesConfig = `
experts:
  custom:
    no_caps_expert:
      systemPrompt: "Test expert"
      tier: balanced
      domain: code
      capabilities: []
`;
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(emptyCapabilitiesConfig);

      const result = loadCustomExperts('/path/to/config.yaml');

      expect(result.errors.length).toBeGreaterThan(0);
      const capsError = result.errors.find((e) => e.field === 'capabilities');
      expect(capsError).toBeDefined();
    });

    it('should return validation error for invalid expert ID format', () => {
      const invalidIdConfig = `
experts:
  custom:
    Invalid-Expert-ID:
      systemPrompt: "Test expert"
      tier: balanced
      domain: code
      capabilities:
        - task_execution
`;
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(invalidIdConfig);

      const result = loadCustomExperts('/path/to/config.yaml');

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatchObject({
        expertId: 'Invalid-Expert-ID',
        field: 'id',
      });
      expect(result.errors[0]?.suggestion).toContain('lowercase');
    });

    it('should handle YAML parse errors gracefully', () => {
      const invalidYaml = `
experts:
  custom:
    bad_yaml:
      - this: is
      invalid: yaml: syntax
`;
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(invalidYaml);

      const result = loadCustomExperts('/path/to/config.yaml');

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]?.field).toBe('yaml');
    });

    it('should handle file read errors gracefully', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = loadCustomExperts('/path/to/config.yaml');

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]?.message).toContain('Permission denied');
    });

    it('should use NEXUS_CONFIG_PATH environment variable', () => {
      // Use a relative path within cwd (path traversal protection applies)
      process.env['NEXUS_CONFIG_PATH'] = 'custom/path/config.yaml';
      const validConfig = `
experts:
  custom:
    env_expert:
      systemPrompt: "Test expert"
      tier: balanced
      domain: code
      capabilities:
        - task_execution
`;
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(validConfig);

      const result = loadCustomExperts();

      expect(result.configPath).toContain('custom/path/config.yaml');
      expect(result.experts).toHaveLength(1);
    });

    it('should apply default values for optional fields', () => {
      const minimalConfig = `
experts:
  custom:
    minimal_expert:
      systemPrompt: "Minimal expert definition"
`;
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(minimalConfig);

      const result = loadCustomExperts('/path/to/config.yaml');

      expect(result.errors).toEqual([]);
      expect(result.experts).toHaveLength(1);
      expect(result.experts[0]).toMatchObject({
        primaryDomain: 'general', // default
        capabilities: ['task_execution'], // default
        weight: 1.0, // default
        available: true, // default
      });
    });

    it('should return empty when config has no experts section', () => {
      const noExpertsConfig = `
models:
  default: claude-sonnet-4
logging:
  level: info
`;
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(noExpertsConfig);

      const result = loadCustomExperts('/path/to/config.yaml');

      expect(result.experts).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it('should return empty when experts.custom is not defined', () => {
      const noCustomConfig = `
experts:
  builtin: true
`;
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(noCustomConfig);

      const result = loadCustomExperts('/path/to/config.yaml');

      expect(result.experts).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it('should handle secondary domains correctly', () => {
      const secondaryDomainsConfig = `
experts:
  custom:
    fullstack_expert:
      systemPrompt: "Full-stack expert"
      tier: balanced
      domain: code
      secondaryDomains:
        - testing
        - architecture
      capabilities:
        - task_execution
`;
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(secondaryDomainsConfig);

      const result = loadCustomExperts('/path/to/config.yaml');

      expect(result.experts).toHaveLength(1);
      expect(result.experts[0]?.secondaryDomains).toEqual(['testing', 'architecture']);
    });

    it('should load valid experts and report errors for invalid ones', () => {
      const mixedConfig = `
experts:
  custom:
    valid_expert:
      systemPrompt: "Valid expert"
      tier: balanced
      domain: code
      capabilities:
        - task_execution
    invalid_expert:
      systemPrompt: "Invalid expert"
      tier: superfast
      domain: code
      capabilities:
        - task_execution
`;
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(mixedConfig);

      const result = loadCustomExperts('/path/to/config.yaml');

      expect(result.experts).toHaveLength(1);
      expect(result.experts[0]?.id).toBe('custom-valid_expert');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.expertId).toBe('invalid_expert');
    });
  });

  describe('formatValidationErrors', () => {
    it('should return empty string for no errors', () => {
      const result = formatValidationErrors([]);
      expect(result).toBe('');
    });

    it('should format single error correctly', () => {
      const errors: CustomExpertError[] = [
        {
          expertId: 'test_expert',
          field: 'tier',
          message: "Invalid tier 'super'",
          suggestion: 'Valid options: fast, balanced, powerful',
        },
      ];

      const result = formatValidationErrors(errors);

      expect(result).toContain('Custom expert validation errors:');
      expect(result).toContain("Invalid tier 'super'");
      expect(result).toContain('Expert: test_expert');
      expect(result).toContain('Field: tier');
      expect(result).toContain('Suggestion: Valid options: fast, balanced, powerful');
    });

    it('should format multiple errors correctly', () => {
      const errors: CustomExpertError[] = [
        {
          expertId: 'expert1',
          field: 'tier',
          message: 'Invalid tier',
        },
        {
          expertId: 'expert2',
          field: 'domain',
          message: 'Invalid domain',
          suggestion: 'Use valid domain',
        },
      ];

      const result = formatValidationErrors(errors);

      expect(result).toContain('Expert: expert1');
      expect(result).toContain('Expert: expert2');
      expect(result).toContain('Invalid tier');
      expect(result).toContain('Invalid domain');
    });

    it('should not show expert field for config-level errors', () => {
      const errors: CustomExpertError[] = [
        {
          expertId: 'config',
          field: 'file',
          message: 'Failed to read config file',
        },
      ];

      const result = formatValidationErrors(errors);

      expect(result).not.toContain('Expert: config');
      expect(result).toContain('Failed to read config file');
    });
  });

  describe('Path Traversal Prevention (Issue #353)', () => {
    const MALICIOUS_PATHS = [
      '../../../etc/passwd',
      '../../../../../../../etc/passwd',
      'foo/../../../etc/passwd',
      './foo/../../../etc/passwd',
      'config/../../etc/passwd',
    ];

    const ABSOLUTE_ESCAPE_PATHS = ['/etc/passwd', '/tmp/../etc/passwd'];

    beforeEach(() => {
      vi.clearAllMocks();
      delete process.env['NEXUS_CONFIG_PATH'];
    });

    MALICIOUS_PATHS.forEach((maliciousPath) => {
      it(`should reject path traversal via env: ${maliciousPath}`, () => {
        process.env['NEXUS_CONFIG_PATH'] = maliciousPath;
        vi.mocked(existsSync).mockReturnValue(true);

        const result = loadCustomExperts();

        expect(result.errors.length).toBeGreaterThan(0);
        const securityError = result.errors.find(
          (e) => e.message.toLowerCase().includes('traversal') || e.field === 'path'
        );
        expect(securityError).toBeDefined();
        expect(securityError?.message).toContain('traversal');
      });
    });

    ABSOLUTE_ESCAPE_PATHS.forEach((absolutePath) => {
      it(`should reject absolute paths that escape cwd via env: ${absolutePath}`, () => {
        process.env['NEXUS_CONFIG_PATH'] = absolutePath;
        vi.mocked(existsSync).mockReturnValue(true);

        const result = loadCustomExperts();

        // Absolute paths outside cwd should be rejected
        expect(result.errors.length).toBeGreaterThan(0);
        const securityError = result.errors.find(
          (e) => e.message.toLowerCase().includes('traversal') || e.field === 'path'
        );
        expect(securityError).toBeDefined();
      });
    });

    it('should allow valid relative paths via env', () => {
      process.env['NEXUS_CONFIG_PATH'] = 'config/nexus-agents.yaml';
      const validConfig = `
experts:
  custom:
    test_expert:
      systemPrompt: "Test expert"
      tier: balanced
      domain: code
      capabilities:
        - task_execution
`;
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(validConfig);

      const result = loadCustomExperts();

      // Should not have security errors
      const securityError = result.errors.find(
        (e) => e.message.toLowerCase().includes('traversal') || e.field === 'path'
      );
      expect(securityError).toBeUndefined();
      expect(result.experts).toHaveLength(1);
    });

    it('should allow same-directory path via env', () => {
      process.env['NEXUS_CONFIG_PATH'] = './nexus-agents.yaml';
      const validConfig = `
experts:
  custom:
    test_expert:
      systemPrompt: "Test expert"
`;
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(validConfig);

      const result = loadCustomExperts();

      // Should not have security errors
      const securityError = result.errors.find(
        (e) => e.message.toLowerCase().includes('traversal') || e.field === 'path'
      );
      expect(securityError).toBeUndefined();
    });

    it('should include helpful suggestion for path traversal errors', () => {
      process.env['NEXUS_CONFIG_PATH'] = '../../../etc/passwd';
      vi.mocked(existsSync).mockReturnValue(true);

      const result = loadCustomExperts();

      const securityError = result.errors.find((e) => e.field === 'path');
      expect(securityError).toBeDefined();
      expect(securityError?.suggestion).toContain('current working directory');
    });
  });
});
