/**
 * Tests for Capability Gap Detector (Issue #906)
 */

import { describe, it, expect } from 'vitest';
import {
  detectCapabilityGaps,
  getAvailableToolCount,
  getAvailableExpertCount,
} from './capability-gap-detector.js';

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

  it('recognizes all 21 MCP tools', () => {
    const allTools = [
      'orchestrate',
      'create_expert',
      'execute_expert',
      'run_workflow',
      'delegate_to_model',
      'list_experts',
      'list_workflows',
      'consensus_vote',
      'research_query',
      'research_add',
      'research_discover',
      'research_analyze',
      'research_catalog_review',
      'memory_query',
      'memory_stats',
      'weather_report',
      'issue_triage',
      'run_graph_workflow',
      'execute_spec',
      'registry_import',
      'query_trace',
    ];
    const report = detectCapabilityGaps({ tools: allTools, experts: [] });
    expect(report.allSatisfied).toBe(true);
    expect(report.available.tools).toHaveLength(21);
  });

  it('recognizes all 9 expert roles', () => {
    const allExperts = [
      'code_expert',
      'architecture_expert',
      'security_expert',
      'documentation_expert',
      'testing_expert',
      'devops_expert',
      'research_expert',
      'pm_expert',
      'ux_expert',
    ];
    const report = detectCapabilityGaps({ tools: [], experts: allExperts });
    expect(report.allSatisfied).toBe(true);
    expect(report.available.experts).toHaveLength(9);
  });
});

// ============================================================================
// Registry counts
// ============================================================================

describe('registry counts', () => {
  it('has 21 available tools', () => {
    expect(getAvailableToolCount()).toBe(21);
  });

  it('has 9 available experts', () => {
    expect(getAvailableExpertCount()).toBe(9);
  });
});
