/**
 * nexus-agents/config - Expert Configuration Schemas Tests
 *
 * Tests for expert definitions, custom experts, and related schemas.
 */

import { describe, it, expect } from 'vitest';
import {
  VALID_EXPERT_TIERS,
  VALID_EXPERT_DOMAINS,
  MAX_SYSTEM_PROMPT_LENGTH,
  CustomExpertDefinitionSchema,
  ExpertDefinitionSchema,
  ExpertConfigSchema,
  type CustomExpertDefinition,
  type ExpertDefinition,
  type ExpertConfig,
  type ExpertTier,
  type ExpertDomain,
} from './schemas-expert.js';

describe('schemas-expert', () => {
  describe('Constants', () => {
    it('exports VALID_EXPERT_TIERS with expected values', () => {
      expect(VALID_EXPERT_TIERS).toEqual(['fast', 'balanced', 'powerful']);
    });

    it('exports VALID_EXPERT_DOMAINS with expected values', () => {
      expect(VALID_EXPERT_DOMAINS).toEqual([
        'code',
        'security',
        'architecture',
        'documentation',
        'testing',
        'general',
      ]);
    });

    it('exports MAX_SYSTEM_PROMPT_LENGTH as 4000', () => {
      expect(MAX_SYSTEM_PROMPT_LENGTH).toBe(4000);
    });
  });

  describe('CustomExpertDefinitionSchema', () => {
    function createValidExpert(): CustomExpertDefinition {
      return {
        systemPrompt: 'You are a helpful assistant',
        tier: 'balanced',
        domain: 'general',
        capabilities: ['task_execution'],
        temperature: 0.3,
        weight: 1.0,
        available: true,
      };
    }

    describe('systemPrompt validation', () => {
      it('accepts valid system prompt', () => {
        const result = CustomExpertDefinitionSchema.safeParse(createValidExpert());
        expect(result.success).toBe(true);
      });

      it('rejects empty system prompt', () => {
        const expert = createValidExpert();
        expert.systemPrompt = '';
        const result = CustomExpertDefinitionSchema.safeParse(expert);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toContain('required');
        }
      });

      it('rejects system prompt exceeding MAX_SYSTEM_PROMPT_LENGTH', () => {
        const expert = createValidExpert();
        expert.systemPrompt = 'a'.repeat(MAX_SYSTEM_PROMPT_LENGTH + 1);
        const result = CustomExpertDefinitionSchema.safeParse(expert);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]!.message).toContain('at most 4000 characters');
        }
      });

      it('accepts system prompt at MAX_SYSTEM_PROMPT_LENGTH', () => {
        const expert = createValidExpert();
        expert.systemPrompt = 'a'.repeat(MAX_SYSTEM_PROMPT_LENGTH);
        const result = CustomExpertDefinitionSchema.safeParse(expert);
        expect(result.success).toBe(true);
      });
    });

    describe('tier validation', () => {
      it('accepts all valid tiers', () => {
        const tiers: ExpertTier[] = ['fast', 'balanced', 'powerful'];
        for (const tier of tiers) {
          const expert = createValidExpert();
          expert.tier = tier;
          const result = CustomExpertDefinitionSchema.safeParse(expert);
          expect(result.success).toBe(true);
        }
      });

      it('defaults to balanced', () => {
        const expert = createValidExpert();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (expert as any).tier;
        const result = CustomExpertDefinitionSchema.parse(expert);
        expect(result.tier).toBe('balanced');
      });

      it('rejects invalid tier', () => {
        const expert = createValidExpert();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (expert as any).tier = 'invalid';
        const result = CustomExpertDefinitionSchema.safeParse(expert);
        expect(result.success).toBe(false);
      });
    });

    describe('domain validation', () => {
      it('accepts all valid domains', () => {
        const domains: ExpertDomain[] = [
          'code',
          'security',
          'architecture',
          'documentation',
          'testing',
          'general',
        ];
        for (const domain of domains) {
          const expert = createValidExpert();
          expert.domain = domain;
          const result = CustomExpertDefinitionSchema.safeParse(expert);
          expect(result.success).toBe(true);
        }
      });

      it('defaults to general', () => {
        const expert = createValidExpert();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (expert as any).domain;
        const result = CustomExpertDefinitionSchema.parse(expert);
        expect(result.domain).toBe('general');
      });

      it('rejects invalid domain', () => {
        const expert = createValidExpert();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (expert as any).domain = 'invalid';
        const result = CustomExpertDefinitionSchema.safeParse(expert);
        expect(result.success).toBe(false);
      });
    });

    describe('secondaryDomains validation', () => {
      it('accepts valid secondary domains array', () => {
        const expert = createValidExpert();
        expert.secondaryDomains = ['code', 'testing'];
        const result = CustomExpertDefinitionSchema.safeParse(expert);
        expect(result.success).toBe(true);
      });

      it('rejects invalid secondary domains', () => {
        const expert = createValidExpert();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expert.secondaryDomains = ['invalid'] as any;
        const result = CustomExpertDefinitionSchema.safeParse(expert);
        expect(result.success).toBe(false);
      });

      it('accepts empty secondary domains array', () => {
        const expert = createValidExpert();
        expert.secondaryDomains = [];
        const result = CustomExpertDefinitionSchema.safeParse(expert);
        expect(result.success).toBe(true);
      });
    });

    describe('capabilities validation', () => {
      it('accepts valid capabilities array', () => {
        const expert = createValidExpert();
        expert.capabilities = ['code_review', 'testing', 'analysis'];
        const result = CustomExpertDefinitionSchema.safeParse(expert);
        expect(result.success).toBe(true);
      });

      it('defaults to task_execution', () => {
        const expert = createValidExpert();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (expert as any).capabilities;
        const result = CustomExpertDefinitionSchema.parse(expert);
        expect(result.capabilities).toEqual(['task_execution']);
      });

      it('rejects empty capabilities array', () => {
        const expert = createValidExpert();
        expert.capabilities = [];
        const result = CustomExpertDefinitionSchema.safeParse(expert);
        expect(result.success).toBe(false);
      });

      it('rejects capabilities with empty strings', () => {
        const expert = createValidExpert();
        expert.capabilities = [''];
        const result = CustomExpertDefinitionSchema.safeParse(expert);
        expect(result.success).toBe(false);
      });
    });

    describe('temperature validation', () => {
      it('accepts temperature at minimum (0)', () => {
        const expert = createValidExpert();
        expert.temperature = 0;
        const result = CustomExpertDefinitionSchema.safeParse(expert);
        expect(result.success).toBe(true);
      });

      it('accepts temperature at maximum (1)', () => {
        const expert = createValidExpert();
        expert.temperature = 1;
        const result = CustomExpertDefinitionSchema.safeParse(expert);
        expect(result.success).toBe(true);
      });

      it('accepts temperature at midpoint (0.5)', () => {
        const expert = createValidExpert();
        expert.temperature = 0.5;
        const result = CustomExpertDefinitionSchema.safeParse(expert);
        expect(result.success).toBe(true);
      });

      it('defaults to 0.3', () => {
        const expert = createValidExpert();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (expert as any).temperature;
        const result = CustomExpertDefinitionSchema.parse(expert);
        expect(result.temperature).toBe(0.3);
      });

      it('rejects temperature below 0', () => {
        const expert = createValidExpert();
        expert.temperature = -0.1;
        const result = CustomExpertDefinitionSchema.safeParse(expert);
        expect(result.success).toBe(false);
      });

      it('rejects temperature above 1', () => {
        const expert = createValidExpert();
        expert.temperature = 1.1;
        const result = CustomExpertDefinitionSchema.safeParse(expert);
        expect(result.success).toBe(false);
      });
    });

    describe('tools validation', () => {
      it('accepts valid tools array', () => {
        const expert = createValidExpert();
        expert.tools = ['tool1', 'tool2'];
        const result = CustomExpertDefinitionSchema.safeParse(expert);
        expect(result.success).toBe(true);
      });

      it('accepts empty tools array', () => {
        const expert = createValidExpert();
        expert.tools = [];
        const result = CustomExpertDefinitionSchema.safeParse(expert);
        expect(result.success).toBe(true);
      });

      it('is optional', () => {
        const expert = createValidExpert();
        delete expert.tools;
        const result = CustomExpertDefinitionSchema.safeParse(expert);
        expect(result.success).toBe(true);
      });
    });

    describe('weight validation', () => {
      it('accepts weight at minimum (0)', () => {
        const expert = createValidExpert();
        expert.weight = 0;
        const result = CustomExpertDefinitionSchema.safeParse(expert);
        expect(result.success).toBe(true);
      });

      it('accepts weight at maximum (1)', () => {
        const expert = createValidExpert();
        expert.weight = 1;
        const result = CustomExpertDefinitionSchema.safeParse(expert);
        expect(result.success).toBe(true);
      });

      it('defaults to 1.0', () => {
        const expert = createValidExpert();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (expert as any).weight;
        const result = CustomExpertDefinitionSchema.parse(expert);
        expect(result.weight).toBe(1.0);
      });

      it('rejects weight below 0', () => {
        const expert = createValidExpert();
        expert.weight = -0.1;
        const result = CustomExpertDefinitionSchema.safeParse(expert);
        expect(result.success).toBe(false);
      });

      it('rejects weight above 1', () => {
        const expert = createValidExpert();
        expert.weight = 1.1;
        const result = CustomExpertDefinitionSchema.safeParse(expert);
        expect(result.success).toBe(false);
      });
    });

    describe('available validation', () => {
      it('accepts true', () => {
        const expert = createValidExpert();
        expert.available = true;
        const result = CustomExpertDefinitionSchema.safeParse(expert);
        expect(result.success).toBe(true);
      });

      it('accepts false', () => {
        const expert = createValidExpert();
        expert.available = false;
        const result = CustomExpertDefinitionSchema.safeParse(expert);
        expect(result.success).toBe(true);
      });

      it('defaults to true', () => {
        const expert = createValidExpert();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (expert as any).available;
        const result = CustomExpertDefinitionSchema.parse(expert);
        expect(result.available).toBe(true);
      });
    });

    describe('description validation', () => {
      it('accepts valid description', () => {
        const expert = createValidExpert();
        expert.description = 'A helpful assistant';
        const result = CustomExpertDefinitionSchema.safeParse(expert);
        expect(result.success).toBe(true);
      });

      it('is optional', () => {
        const expert = createValidExpert();
        delete expert.description;
        const result = CustomExpertDefinitionSchema.safeParse(expert);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('ExpertDefinitionSchema (legacy)', () => {
    function createValidLegacyExpert(): ExpertDefinition {
      return {
        prompt: 'You are a helpful assistant',
        tier: 'balanced',
        temperature: 0.3,
      };
    }

    it('accepts valid legacy expert', () => {
      const result = ExpertDefinitionSchema.safeParse(createValidLegacyExpert());
      expect(result.success).toBe(true);
    });

    it('rejects empty prompt', () => {
      const expert = createValidLegacyExpert();
      expert.prompt = '';
      const result = ExpertDefinitionSchema.safeParse(expert);
      expect(result.success).toBe(false);
    });

    it('accepts valid tiers', () => {
      const tiers: ExpertTier[] = ['fast', 'balanced', 'powerful'];
      for (const tier of tiers) {
        const expert = createValidLegacyExpert();
        expert.tier = tier;
        const result = ExpertDefinitionSchema.safeParse(expert);
        expect(result.success).toBe(true);
      }
    });

    it('defaults tier to balanced', () => {
      const expert = createValidLegacyExpert();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (expert as any).tier;
      const result = ExpertDefinitionSchema.parse(expert);
      expect(result.tier).toBe('balanced');
    });

    it('accepts temperature range 0-1', () => {
      const expert = createValidLegacyExpert();
      expert.temperature = 0.5;
      const result = ExpertDefinitionSchema.safeParse(expert);
      expect(result.success).toBe(true);
    });

    it('defaults temperature to 0.3', () => {
      const expert = createValidLegacyExpert();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (expert as any).temperature;
      const result = ExpertDefinitionSchema.parse(expert);
      expect(result.temperature).toBe(0.3);
    });

    it('rejects temperature below 0', () => {
      const expert = createValidLegacyExpert();
      expert.temperature = -0.1;
      const result = ExpertDefinitionSchema.safeParse(expert);
      expect(result.success).toBe(false);
    });

    it('rejects temperature above 1', () => {
      const expert = createValidLegacyExpert();
      expert.temperature = 1.1;
      const result = ExpertDefinitionSchema.safeParse(expert);
      expect(result.success).toBe(false);
    });

    it('accepts optional tools array', () => {
      const expert = createValidLegacyExpert();
      expert.tools = ['tool1', 'tool2'];
      const result = ExpertDefinitionSchema.safeParse(expert);
      expect(result.success).toBe(true);
    });

    it('accepts missing tools', () => {
      const expert = createValidLegacyExpert();
      delete expert.tools;
      const result = ExpertDefinitionSchema.safeParse(expert);
      expect(result.success).toBe(true);
    });
  });

  describe('ExpertConfigSchema', () => {
    function createValidConfig(): ExpertConfig {
      return {
        builtin: true,
      };
    }

    it('accepts valid config with builtin only', () => {
      const result = ExpertConfigSchema.safeParse(createValidConfig());
      expect(result.success).toBe(true);
    });

    it('defaults builtin to true', () => {
      const config = {};
      const result = ExpertConfigSchema.parse(config);
      expect(result.builtin).toBe(true);
    });

    it('accepts builtin false', () => {
      const config = createValidConfig();
      config.builtin = false;
      const result = ExpertConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('accepts valid custom experts', () => {
      const config = createValidConfig();
      config.custom = {
        my_expert: {
          systemPrompt: 'You are an expert',
          tier: 'balanced',
          domain: 'code',
          capabilities: ['code_review'],
          temperature: 0.5,
          weight: 1.0,
          available: true,
        },
      };
      const result = ExpertConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('accepts multiple custom experts', () => {
      const config = createValidConfig();
      config.custom = {
        expert_one: {
          systemPrompt: 'Expert one',
          tier: 'fast',
          domain: 'code',
          capabilities: ['coding'],
          temperature: 0.3,
          weight: 1.0,
          available: true,
        },
        expert_two: {
          systemPrompt: 'Expert two',
          tier: 'powerful',
          domain: 'security',
          capabilities: ['security_audit'],
          temperature: 0.2,
          weight: 0.9,
          available: false,
        },
      };
      const result = ExpertConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('rejects expert ID with uppercase letters', () => {
      const config = createValidConfig();
      config.custom = {
        MyExpert: {
          systemPrompt: 'Expert',
          tier: 'balanced',
          domain: 'general',
          capabilities: ['task'],
          temperature: 0.3,
          weight: 1.0,
          available: true,
        },
      };
      const result = ExpertConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('rejects expert ID starting with number', () => {
      const config = createValidConfig();
      config.custom = {
        '1expert': {
          systemPrompt: 'Expert',
          tier: 'balanced',
          domain: 'general',
          capabilities: ['task'],
          temperature: 0.3,
          weight: 1.0,
          available: true,
        },
      };
      const result = ExpertConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('accepts expert ID with underscores and numbers', () => {
      const config = createValidConfig();
      config.custom = {
        my_expert_v2: {
          systemPrompt: 'Expert',
          tier: 'balanced',
          domain: 'general',
          capabilities: ['task'],
          temperature: 0.3,
          weight: 1.0,
          available: true,
        },
      };
      const result = ExpertConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('rejects expert ID with hyphens', () => {
      const config = createValidConfig();
      config.custom = {
        'my-expert': {
          systemPrompt: 'Expert',
          tier: 'balanced',
          domain: 'general',
          capabilities: ['task'],
          temperature: 0.3,
          weight: 1.0,
          available: true,
        },
      };
      const result = ExpertConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('custom is optional', () => {
      const config = createValidConfig();
      delete config.custom;
      const result = ExpertConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });
});
