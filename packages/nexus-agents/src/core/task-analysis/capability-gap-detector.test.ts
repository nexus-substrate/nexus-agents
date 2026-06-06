/**
 * Tests for Capability Gap Detector (Issue #906)
 */

import { describe, it, expect } from 'vitest';
import {
  detectCapabilityGaps,
  getAvailableToolCount,
  getAvailableExpertCount,
} from './capability-gap-detector.js';
import { REGISTERED_TOOL_NAMES } from '../../mcp/tools/index.js';
import { BuiltInExpertTypeSchema } from '../../agents/experts/expert-config.js';

/** Canonical expert role names, derived as `{type}_expert` from the type union. */
const CANONICAL_EXPERT_ROLES = BuiltInExpertTypeSchema.options.map((t) => `${t}_expert`);

// ============================================================================
// detectCapabilityGaps
// ============================================================================

describe('detectCapabilityGaps', () => {
  it('reports all satisfied when tools and experts are available', () => {
    const report = detectCapabilityGaps({
      tools: ['orchestrate', 'create_expert'],
      experts: ['code_expert', 'security_expert'],
    });
    expect(report.allSatisfied).toBe(true);
    expect(report.gaps).toHaveLength(0);
    expect(report.available.tools).toEqual(['orchestrate', 'create_expert']);
    expect(report.available.experts).toEqual(['code_expert', 'security_expert']);
  });

  it('detects tool gaps', () => {
    const report = detectCapabilityGaps({
      tools: ['orchestrate', 'nonexistent_tool'],
      experts: [],
    });
    expect(report.allSatisfied).toBe(false);
    expect(report.gaps).toHaveLength(1);
    expect(report.gaps[0]?.type).toBe('tool');
    expect(report.gaps[0]?.name).toBe('nonexistent_tool');
    expect(report.available.tools).toEqual(['orchestrate']);
  });

  it('detects expert gaps', () => {
    const report = detectCapabilityGaps({
      tools: [],
      experts: ['code_expert', 'ml_expert'],
    });
    expect(report.allSatisfied).toBe(false);
    expect(report.gaps).toHaveLength(1);
    expect(report.gaps[0]?.type).toBe('expert');
    expect(report.gaps[0]?.name).toBe('ml_expert');
    expect(report.gaps[0]?.suggestion).toContain('code_expert');
  });

  it('detects both tool and expert gaps', () => {
    const report = detectCapabilityGaps({
      tools: ['deploy'],
      experts: ['data_expert'],
    });
    expect(report.allSatisfied).toBe(false);
    expect(report.gaps).toHaveLength(2);
    const types = report.gaps.map((g) => g.type);
    expect(types).toContain('tool');
    expect(types).toContain('expert');
  });

  it('provides suggestion for known gap: deploy', () => {
    const report = detectCapabilityGaps({
      tools: ['deploy'],
      experts: [],
    });
    expect(report.gaps[0]?.suggestion).toContain('run_graph_workflow');
  });

  it('provides suggestion for known gap: data_expert', () => {
    const report = detectCapabilityGaps({
      tools: [],
      experts: ['data_expert'],
    });
    expect(report.gaps[0]?.suggestion).toContain('research_expert');
  });

  it('provides generic suggestion for unknown gaps', () => {
    const report = detectCapabilityGaps({
      tools: ['completely_unknown'],
      experts: [],
    });
    expect(report.gaps[0]?.suggestion).toContain('orchestrate');
  });

  it('handles empty required capabilities', () => {
    const report = detectCapabilityGaps({
      tools: [],
      experts: [],
    });
    expect(report.allSatisfied).toBe(true);
    expect(report.gaps).toHaveLength(0);
    expect(report.available.tools).toHaveLength(0);
    expect(report.available.experts).toHaveLength(0);
  });

  it('recognizes a real tool that was previously missing from the registry (#3553)', () => {
    // `search_codebase` is a registered tool that the stale literal omitted —
    // it must not be falsely reported as a gap.
    const report = detectCapabilityGaps({ tools: ['search_codebase', 'pr_review'], experts: [] });
    expect(report.allSatisfied).toBe(true);
    expect(report.gaps).toHaveLength(0);
  });
});

// ============================================================================
// Registry freshness — derived from canonical sources, fails on drift (#3553)
// ============================================================================

describe('registry freshness vs canonical sources', () => {
  it('recognizes every registered MCP tool', () => {
    const report = detectCapabilityGaps({ tools: [...REGISTERED_TOOL_NAMES], experts: [] });
    expect(report.allSatisfied).toBe(true);
    expect(report.available.tools).toHaveLength(REGISTERED_TOOL_NAMES.length);
  });

  it('recognizes every built-in expert role', () => {
    const report = detectCapabilityGaps({ tools: [], experts: CANONICAL_EXPERT_ROLES });
    expect(report.allSatisfied).toBe(true);
    expect(report.available.experts).toHaveLength(CANONICAL_EXPERT_ROLES.length);
  });

  it('available tool count matches the canonical registry', () => {
    expect(getAvailableToolCount()).toBe(REGISTERED_TOOL_NAMES.length);
  });

  it('available expert count matches the canonical expert types', () => {
    expect(getAvailableExpertCount()).toBe(CANONICAL_EXPERT_ROLES.length);
  });
});
