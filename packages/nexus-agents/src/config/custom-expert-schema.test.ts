/**
 * Tests for custom expert schema validation
 *
 * Verifies Zod schema validation for custom expert definitions.
 * (Source: Issue #300, CODING_STANDARDS.md)
 */

import { describe, it, expect } from 'vitest';
import {
  CustomExpertDefinitionSchema,
  ExpertConfigSchema,
  VALID_EXPERT_TIERS,
  VALID_EXPERT_DOMAINS,
  MAX_SYSTEM_PROMPT_LENGTH,
} from './schemas.js';

describe('CustomExpertDefinitionSchema', () => {
  describe('valid configurations', () => {
    it('should accept minimal valid configuration', () => {
      const config = {
        systemPrompt: 'You are a helpful expert.',
      };

      const result = CustomExpertDefinitionSchema.safeParse(config);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tier).toBe('balanced'); // default
        expect(result.data.domain).toBe('general'); // default
        expect(result.data.capabilities).toEqual(['task_execution']); // default
        expect(result.data.temperature).toBe(0.3); // default
        expect(result.data.weight).toBe(1.0); // default
        expect(result.data.available).toBe(true); // default
      }
    });

    it('should accept full configuration with all fields', () => {
      const config = {
        systemPrompt: 'You are a Rust systems programming expert.',
        tier: 'powerful',
        domain: 'code',
        secondaryDomains: ['security', 'architecture'],
        capabilities: ['task_execution', 'code_generation', 'code_review'],
        temperature: 0.2,
        tools: ['rust_analyzer', 'cargo'],
        description: 'Expert in Rust and systems programming',
        weight: 0.9,
        available: true,
      };

      const result = CustomExpertDefinitionSchema.safeParse(config);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toMatchObject(config);
      }
    });

    it('should accept all valid tier values', () => {
      for (const tier of VALID_EXPERT_TIERS) {
        const config = {
          systemPrompt: 'Test expert',
          tier,
        };

        const result = CustomExpertDefinitionSchema.safeParse(config);
        expect(result.success).toBe(true);
      }
    });

    it('should accept all valid domain values', () => {
      for (const domain of VALID_EXPERT_DOMAINS) {
        const config = {
          systemPrompt: 'Test expert',
          domain,
        };

        const result = CustomExpertDefinitionSchema.safeParse(config);
        expect(result.success).toBe(true);
      }
    });

    it('should accept system prompt at max length', () => {
      const config = {
        systemPrompt: 'x'.repeat(MAX_SYSTEM_PROMPT_LENGTH),
      };

      const result = CustomExpertDefinitionSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });

  describe('invalid configurations', () => {
    it('should reject missing systemPrompt', () => {
      const config = {
        tier: 'balanced',
        domain: 'code',
      };

      const result = CustomExpertDefinitionSchema.safeParse(config);

      expect(result.success).toBe(false);
    });

    it('should reject empty systemPrompt', () => {
      const config = {
        systemPrompt: '',
      };

      const result = CustomExpertDefinitionSchema.safeParse(config);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('required');
      }
    });

    it('should reject systemPrompt exceeding max length', () => {
      const config = {
        systemPrompt: 'x'.repeat(MAX_SYSTEM_PROMPT_LENGTH + 1),
      };

      const result = CustomExpertDefinitionSchema.safeParse(config);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(String(MAX_SYSTEM_PROMPT_LENGTH));
      }
    });

    it('should reject invalid tier with actionable error message', () => {
      const config = {
        systemPrompt: 'Test expert',
        tier: 'super',
      };

      const result = CustomExpertDefinitionSchema.safeParse(config);

      expect(result.success).toBe(false);
      if (!result.success) {
        const message = result.error.issues[0]?.message ?? '';
        expect(message).toContain('Invalid tier');
        expect(message).toContain('fast');
        expect(message).toContain('balanced');
        expect(message).toContain('powerful');
      }
    });

    it('should reject invalid domain with actionable error message', () => {
      const config = {
        systemPrompt: 'Test expert',
        domain: 'invalid_domain',
      };

      const result = CustomExpertDefinitionSchema.safeParse(config);

      expect(result.success).toBe(false);
      if (!result.success) {
        const message = result.error.issues[0]?.message ?? '';
        expect(message).toContain('Invalid domain');
        expect(message).toContain('code');
        expect(message).toContain('security');
      }
    });

    it('should reject empty capabilities array', () => {
      const config = {
        systemPrompt: 'Test expert',
        capabilities: [],
      };

      const result = CustomExpertDefinitionSchema.safeParse(config);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('At least one capability');
      }
    });

    it('should reject temperature below 0', () => {
      const config = {
        systemPrompt: 'Test expert',
        temperature: -0.1,
      };

      const result = CustomExpertDefinitionSchema.safeParse(config);

      expect(result.success).toBe(false);
    });

    it('should reject temperature above 1', () => {
      const config = {
        systemPrompt: 'Test expert',
        temperature: 1.5,
      };

      const result = CustomExpertDefinitionSchema.safeParse(config);

      expect(result.success).toBe(false);
    });

    it('should reject weight below 0', () => {
      const config = {
        systemPrompt: 'Test expert',
        weight: -0.5,
      };

      const result = CustomExpertDefinitionSchema.safeParse(config);

      expect(result.success).toBe(false);
    });

    it('should reject weight above 1', () => {
      const config = {
        systemPrompt: 'Test expert',
        weight: 2.0,
      };

      const result = CustomExpertDefinitionSchema.safeParse(config);

      expect(result.success).toBe(false);
    });

    it('should reject invalid secondary domain values', () => {
      const config = {
        systemPrompt: 'Test expert',
        secondaryDomains: ['code', 'invalid_domain'],
      };

      const result = CustomExpertDefinitionSchema.safeParse(config);

      expect(result.success).toBe(false);
    });
  });
});

describe('ExpertConfigSchema', () => {
  it('should accept config with builtin only', () => {
    const config = {
      builtin: true,
    };

    const result = ExpertConfigSchema.safeParse(config);

    expect(result.success).toBe(true);
  });

  it('should accept config with custom experts', () => {
    const config = {
      builtin: true,
      custom: {
        rust_expert: {
          systemPrompt: 'Rust expert',
          tier: 'powerful',
          domain: 'code',
          capabilities: ['task_execution'],
        },
      },
    };

    const result = ExpertConfigSchema.safeParse(config);

    expect(result.success).toBe(true);
  });

  it('should default builtin to true', () => {
    const config = {};

    const result = ExpertConfigSchema.safeParse(config);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.builtin).toBe(true);
    }
  });

  it('should allow disabling builtin experts', () => {
    const config = {
      builtin: false,
      custom: {
        custom_expert: {
          systemPrompt: 'Custom only',
          capabilities: ['task_execution'],
        },
      },
    };

    const result = ExpertConfigSchema.safeParse(config);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.builtin).toBe(false);
    }
  });
});

describe('constants', () => {
  it('should have valid expert tiers', () => {
    expect(VALID_EXPERT_TIERS).toContain('fast');
    expect(VALID_EXPERT_TIERS).toContain('balanced');
    expect(VALID_EXPERT_TIERS).toContain('powerful');
    expect(VALID_EXPERT_TIERS).toHaveLength(3);
  });

  it('should have valid expert domains', () => {
    expect(VALID_EXPERT_DOMAINS).toContain('code');
    expect(VALID_EXPERT_DOMAINS).toContain('security');
    expect(VALID_EXPERT_DOMAINS).toContain('architecture');
    expect(VALID_EXPERT_DOMAINS).toContain('documentation');
    expect(VALID_EXPERT_DOMAINS).toContain('testing');
    expect(VALID_EXPERT_DOMAINS).toContain('general');
    expect(VALID_EXPERT_DOMAINS).toHaveLength(6);
  });

  it('should have reasonable max system prompt length', () => {
    expect(MAX_SYSTEM_PROMPT_LENGTH).toBe(4000);
    expect(MAX_SYSTEM_PROMPT_LENGTH).toBeGreaterThan(100);
    expect(MAX_SYSTEM_PROMPT_LENGTH).toBeLessThanOrEqual(10000);
  });
});
