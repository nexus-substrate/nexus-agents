/**
 * Tests for Request Tier Classifier
 *
 * @module mcp/gateway/tier-classifier.test
 */

import { describe, it, expect } from 'vitest';
import {
  classifyRequestTier,
  RequestTier,
  TOOL_TIER_MAP,
  type TierOverrides,
} from './tier-classifier.js';

// ============================================================================
// Tier mapping for all 19 registered MCP tools
// ============================================================================

describe('classifyRequestTier', () => {
  describe('Tier 1 (DIRECT) — read-only, no orchestration', () => {
    const tier1Tools = [
      'list_experts',
      'list_workflows',
      'memory_query',
      'memory_stats',
      'weather_report',
      'research_query',
      'research_analyze',
      'research_catalog_review',
    ];

    for (const tool of tier1Tools) {
      it(`classifies ${tool} as DIRECT`, () => {
        expect(classifyRequestTier(tool, {})).toBe(RequestTier.DIRECT);
      });
    }
  });

  describe('Tier 2 (ANALYZED) — requires model selection', () => {
    const tier2Tools = [
      'delegate_to_model',
      'create_expert',
      'execute_expert',
      'research_add',
      'research_discover',
    ];

    for (const tool of tier2Tools) {
      it(`classifies ${tool} as ANALYZED`, () => {
        expect(classifyRequestTier(tool, {})).toBe(RequestTier.ANALYZED);
      });
    }
  });

  describe('Tier 3 (ORCHESTRATED) — full orchestration', () => {
    const tier3Tools = [
      'orchestrate',
      'consensus_vote',
      'execute_spec',
      'run_workflow',
      'run_graph_workflow',
      'issue_triage',
    ];

    for (const tool of tier3Tools) {
      it(`classifies ${tool} as ORCHESTRATED`, () => {
        expect(classifyRequestTier(tool, {})).toBe(RequestTier.ORCHESTRATED);
      });
    }
  });

  describe('unknown tools', () => {
    it('defaults to ANALYZED for unknown tools', () => {
      expect(classifyRequestTier('unknown_tool', {})).toBe(RequestTier.ANALYZED);
    });
  });
});

// ============================================================================
// Security/architecture promotion to Tier 3
// ============================================================================

describe('tier promotion', () => {
  describe('security keywords promote to Tier 3', () => {
    it('promotes delegate_to_model with security task', () => {
      const result = classifyRequestTier('delegate_to_model', {
        task: 'Review this code for security vulnerabilities',
      });
      expect(result).toBe(RequestTier.ORCHESTRATED);
    });

    it('promotes create_expert with security role', () => {
      const result = classifyRequestTier('create_expert', {
        role: 'security_expert',
      });
      expect(result).toBe(RequestTier.ORCHESTRATED);
    });

    it('promotes on CVE references', () => {
      const result = classifyRequestTier('delegate_to_model', {
        task: 'Investigate CVE-2024-12345 impact',
      });
      expect(result).toBe(RequestTier.ORCHESTRATED);
    });
  });

  describe('architecture keywords promote to Tier 3', () => {
    it('promotes delegate_to_model with architecture task', () => {
      const result = classifyRequestTier('delegate_to_model', {
        task: 'Design the new microservice architecture',
      });
      expect(result).toBe(RequestTier.ORCHESTRATED);
    });

    it('promotes create_expert with architecture role', () => {
      const result = classifyRequestTier('create_expert', {
        role: 'architecture_expert',
      });
      expect(result).toBe(RequestTier.ORCHESTRATED);
    });

    it('promotes on breaking change mentions', () => {
      const result = classifyRequestTier('delegate_to_model', {
        task: 'Plan the breaking API change for v3',
      });
      expect(result).toBe(RequestTier.ORCHESTRATED);
    });
  });

  describe('no promotion for Tier 1 tools', () => {
    it('does not promote list_experts even with security params', () => {
      const result = classifyRequestTier('list_experts', {
        task: 'security vulnerability scan',
      });
      expect(result).toBe(RequestTier.DIRECT);
    });
  });

  describe('no false promotion', () => {
    it('does not promote on unrelated content', () => {
      const result = classifyRequestTier('delegate_to_model', {
        task: 'Write a unit test for the login form',
      });
      expect(result).toBe(RequestTier.ANALYZED);
    });
  });
});

// ============================================================================
// Tier overrides
// ============================================================================

describe('tier overrides', () => {
  it('applies override to promote a tool', () => {
    const overrides: TierOverrides = {
      memory_query: RequestTier.ANALYZED,
    };
    const result = classifyRequestTier('memory_query', {}, overrides);
    expect(result).toBe(RequestTier.ANALYZED);
  });

  it('applies override to demote a tool', () => {
    const overrides: TierOverrides = {
      orchestrate: RequestTier.ANALYZED,
    };
    const result = classifyRequestTier('orchestrate', {}, overrides);
    expect(result).toBe(RequestTier.ANALYZED);
  });

  it('override does not prevent security promotion', () => {
    const overrides: TierOverrides = {
      delegate_to_model: RequestTier.DIRECT,
    };
    const result = classifyRequestTier(
      'delegate_to_model',
      { task: 'security audit of the codebase' },
      overrides
    );
    // Security promotion overrides the override
    expect(result).toBe(RequestTier.ORCHESTRATED);
  });
});

// ============================================================================
// TOOL_TIER_MAP coverage
// ============================================================================

describe('TOOL_TIER_MAP', () => {
  it('contains entries for all 19 registered tools', () => {
    expect(Object.keys(TOOL_TIER_MAP).length).toBe(19);
  });

  it('only contains valid RequestTier values', () => {
    for (const tier of Object.values(TOOL_TIER_MAP)) {
      expect([RequestTier.DIRECT, RequestTier.ANALYZED, RequestTier.ORCHESTRATED]).toContain(tier);
    }
  });
});
