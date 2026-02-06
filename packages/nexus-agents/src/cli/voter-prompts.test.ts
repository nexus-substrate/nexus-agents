/**
 * nexus-agents/cli - Voter System Prompts Tests
 *
 * Unit tests for voter role system prompts and reasoning templates.
 *
 * @module cli/voter-prompts.test
 */

import { describe, it, expect } from 'vitest';
import { VOTER_SYSTEM_PROMPTS, SIMULATED_VOTE_REASONING } from './voter-prompts.js';
import type { VoterRole } from './vote-types.js';

describe('voter-prompts', () => {
  describe('VOTER_SYSTEM_PROMPTS', () => {
    const allRoles: VoterRole[] = ['architect', 'security', 'devex', 'ai_ml', 'pm', 'catfish'];

    it('should define prompts for all voter roles', () => {
      expect(Object.keys(VOTER_SYSTEM_PROMPTS).sort()).toEqual(allRoles.sort());
    });

    it('should have non-empty prompts for all roles', () => {
      for (const role of allRoles) {
        expect(VOTER_SYSTEM_PROMPTS[role]).toBeTruthy();
        expect(VOTER_SYSTEM_PROMPTS[role].length).toBeGreaterThan(50);
      }
    });

    describe('architect prompt', () => {
      const prompt = VOTER_SYSTEM_PROMPTS.architect;

      it('should define architect role', () => {
        expect(prompt).toContain('Software Architect');
      });

      it('should include technical design criteria', () => {
        expect(prompt).toContain('Technical design quality');
        expect(prompt).toContain('architectural soundness');
      });

      it('should mention Result pattern and TypeScript', () => {
        expect(prompt).toContain('Result<T,E>');
        expect(prompt).toContain('TypeScript');
      });

      it('should include scalability and maintainability concerns', () => {
        expect(prompt).toContain('Scalability');
        expect(prompt).toContain('Maintainability');
      });
    });

    describe('security prompt', () => {
      const prompt = VOTER_SYSTEM_PROMPTS.security;

      it('should define security engineer role', () => {
        expect(prompt).toContain('Security Engineer');
      });

      it('should mention OWASP Top 10', () => {
        expect(prompt).toContain('OWASP Top 10');
      });

      it('should include input validation criteria', () => {
        expect(prompt).toContain('Input validation');
        expect(prompt).toContain('sanitization');
      });

      it('should mention path traversal and injection prevention', () => {
        expect(prompt).toContain('Path traversal');
        expect(prompt).toContain('injection prevention');
      });

      it('should include rate limiting concerns', () => {
        expect(prompt).toContain('Rate limiting');
        expect(prompt).toContain('resource exhaustion');
      });
    });

    describe('devex prompt', () => {
      const prompt = VOTER_SYSTEM_PROMPTS.devex;

      it('should define developer experience engineer role', () => {
        expect(prompt).toContain('Developer Experience Engineer');
      });

      it('should include API usability criteria', () => {
        expect(prompt).toContain('API usability');
        expect(prompt).toContain('ergonomics');
      });

      it('should mention documentation and learning curve', () => {
        expect(prompt).toContain('Documentation clarity');
        expect(prompt).toContain('Learning curve');
      });

      it('should focus on practical developer impact', () => {
        expect(prompt).toContain('practical developer impact');
      });
    });

    describe('ai_ml prompt', () => {
      const prompt = VOTER_SYSTEM_PROMPTS.ai_ml;

      it('should define AI/ML engineer role', () => {
        expect(prompt).toContain('AI/ML Engineer');
      });

      it('should include multi-agent coordination criteria', () => {
        expect(prompt).toContain('Multi-agent coordination');
      });

      it('should mention model selection and routing', () => {
        expect(prompt).toContain('Model selection');
        expect(prompt).toContain('routing strategies');
      });

      it('should include context management concerns', () => {
        expect(prompt).toContain('Context management');
        expect(prompt).toContain('token efficiency');
      });

      it('should mention consensus protocol design', () => {
        expect(prompt).toContain('Consensus protocol');
      });
    });

    describe('pm prompt', () => {
      const prompt = VOTER_SYSTEM_PROMPTS.pm;

      it('should define product manager role', () => {
        expect(prompt).toContain('Product Manager');
      });

      it('should include business value criteria', () => {
        expect(prompt).toContain('Business value');
        expect(prompt).toContain('user impact');
      });

      it('should mention resource requirements and timeline', () => {
        expect(prompt).toContain('Resource requirements');
        expect(prompt).toContain('timeline');
      });

      it('should include risk assessment', () => {
        expect(prompt).toContain('Risk assessment');
      });

      it('should balance value against effort', () => {
        expect(prompt).toContain('Balance value against effort');
        expect(prompt).toContain('pragmatic');
      });
    });

    describe('catfish prompt', () => {
      const prompt = VOTER_SYSTEM_PROMPTS.catfish;

      it('should define contrarian analyst role', () => {
        expect(prompt).toContain('Contrarian Analyst');
        expect(prompt).toContain('catfish agent');
      });

      it('should reference research paper on agreement bias', () => {
        expect(prompt).toContain('arXiv:2505.21503');
        expect(prompt).toContain('agreement bias');
      });

      it('should challenge hidden costs and assumptions', () => {
        expect(prompt).toContain('hidden costs');
        expect(prompt).toContain('assumptions');
      });

      it('should mention alternatives and what could go wrong', () => {
        expect(prompt).toContain('alternatives');
        expect(prompt).toContain('What could go wrong');
      });

      it('should allow approval after genuine scrutiny', () => {
        expect(prompt).toContain('you MAY approve');
        expect(prompt).toContain('genuine scrutiny');
      });

      it('should emphasize skeptical default posture', () => {
        expect(prompt).toContain('default posture is skeptical');
        expect(prompt).toContain('look for what others might miss');
      });
    });

    it('should have prompts with consistent structure', () => {
      for (const role of allRoles) {
        const prompt = VOTER_SYSTEM_PROMPTS[role];
        expect(prompt).toContain('You are');
        expect(prompt).toContain('evaluation criteria');
      }
    });
  });

  describe('SIMULATED_VOTE_REASONING', () => {
    const allRoles: VoterRole[] = ['architect', 'security', 'devex', 'ai_ml', 'pm', 'catfish'];

    it('should define reasoning for all voter roles', () => {
      expect(Object.keys(SIMULATED_VOTE_REASONING).sort()).toEqual(allRoles.sort());
    });

    it('should have non-empty reasoning for all roles', () => {
      for (const role of allRoles) {
        expect(SIMULATED_VOTE_REASONING[role]).toBeTruthy();
        expect(SIMULATED_VOTE_REASONING[role].length).toBeGreaterThan(10);
      }
    });

    it('should have concise reasoning templates', () => {
      for (const role of allRoles) {
        const reasoning = SIMULATED_VOTE_REASONING[role];
        expect(reasoning.length).toBeLessThan(100);
      }
    });

    it('should match role-specific concerns', () => {
      expect(SIMULATED_VOTE_REASONING.architect).toContain('architecture');
      expect(SIMULATED_VOTE_REASONING.security).toContain('security');
      expect(SIMULATED_VOTE_REASONING.devex).toContain('developer experience');
      expect(SIMULATED_VOTE_REASONING.ai_ml).toContain('AI/ML');
      expect(SIMULATED_VOTE_REASONING.pm).toContain('business value');
      expect(SIMULATED_VOTE_REASONING.catfish).toContain('assumptions');
    });

    it('should use past tense for completed actions', () => {
      expect(SIMULATED_VOTE_REASONING.architect).toContain('Evaluated');
      expect(SIMULATED_VOTE_REASONING.security).toContain('Reviewed');
      expect(SIMULATED_VOTE_REASONING.devex).toContain('Assessed');
      expect(SIMULATED_VOTE_REASONING.ai_ml).toContain('Analyzed');
      expect(SIMULATED_VOTE_REASONING.pm).toContain('Evaluated');
      expect(SIMULATED_VOTE_REASONING.catfish).toContain('Challenged');
    });
  });

  describe('type consistency', () => {
    it('should have matching keys between prompts and reasoning', () => {
      const promptKeys = Object.keys(VOTER_SYSTEM_PROMPTS).sort();
      const reasoningKeys = Object.keys(SIMULATED_VOTE_REASONING).sort();
      expect(promptKeys).toEqual(reasoningKeys);
    });

    it('should cover all VoterRole types', () => {
      const expectedRoles: VoterRole[] = [
        'architect',
        'security',
        'devex',
        'ai_ml',
        'pm',
        'catfish',
      ];

      for (const role of expectedRoles) {
        expect(VOTER_SYSTEM_PROMPTS[role]).toBeDefined();
        expect(SIMULATED_VOTE_REASONING[role]).toBeDefined();
      }
    });
  });
});
