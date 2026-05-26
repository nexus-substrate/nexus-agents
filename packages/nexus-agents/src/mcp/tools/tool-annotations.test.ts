/**
 * Tests for MCP Tool Annotations Registry
 *
 * @module mcp/tools/tool-annotations.test
 * (Source: Issue #993 — Document MCP tool side effects in schema metadata)
 */

import { describe, it, expect } from 'vitest';
import {
  TOOL_ANNOTATIONS,
  getToolAnnotations,
  getMcpAnnotations,
  getSideEffectsByCategory,
  type ToolSideEffectsEntry,
} from './tool-annotations.js';
import { REGISTERED_TOOLS } from '../../cli-server-tools.js';

describe('tool-annotations', () => {
  describe('TOOL_ANNOTATIONS registry', () => {
    it('has an entry for every registered tool', () => {
      for (const toolName of REGISTERED_TOOLS) {
        expect(TOOL_ANNOTATIONS[toolName], `Missing annotation for ${toolName}`).toBeDefined();
      }
    });

    it('has no extra entries beyond registered tools', () => {
      const annotatedTools = Object.keys(TOOL_ANNOTATIONS);
      const registered = new Set<string>(REGISTERED_TOOLS);
      for (const tool of annotatedTools) {
        expect(registered.has(tool), `Extra annotation for ${tool}`).toBe(true);
      }
    });

    it('has exactly 40 tool entries', () => {
      expect(Object.keys(TOOL_ANNOTATIONS)).toHaveLength(40);
    });

    it('every entry has valid annotations shape', () => {
      for (const [name, entry] of Object.entries(TOOL_ANNOTATIONS)) {
        expect(entry.annotations, `${name} missing annotations`).toBeDefined();
        expect(typeof entry.annotations.readOnlyHint, `${name} readOnlyHint`).toBe('boolean');
        expect(typeof entry.annotations.destructiveHint, `${name} destructiveHint`).toBe('boolean');
      }
    });

    it('every entry has at least one side effect', () => {
      for (const [name, entry] of Object.entries(TOOL_ANNOTATIONS)) {
        expect(entry.sideEffects.length, `${name} has no side effects`).toBeGreaterThan(0);
      }
    });

    it('all side effects have valid categories', () => {
      const validCategories = new Set(['explicit', 'implicit', 'coupling']);
      for (const [name, entry] of Object.entries(TOOL_ANNOTATIONS)) {
        for (const se of entry.sideEffects) {
          expect(validCategories.has(se.category), `${name}: invalid category ${se.category}`).toBe(
            true
          );
          expect(se.description.length, `${name}: empty description`).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('read-only tools', () => {
    const readOnlyTools = [
      'delegate_to_model',
      'list_experts',
      'list_workflows',
      'research_query',
      'research_analyze',
      'memory_query',
      'memory_stats',
      'weather_report',
      'issue_triage',
      'query_trace',
      'research_discover',
    ];

    it('marks read-only tools correctly', () => {
      for (const name of readOnlyTools) {
        const entry = TOOL_ANNOTATIONS[name] as ToolSideEffectsEntry;
        expect(entry.annotations.readOnlyHint, `${name} should be readOnly`).toBe(true);
        expect(entry.annotations.destructiveHint, `${name} should not be destructive`).toBe(false);
      }
    });
  });

  describe('state-mutating tools', () => {
    const mutatingTools = [
      'orchestrate',
      'create_expert',
      'execute_expert',
      'run_workflow',
      'consensus_vote',
      'research_add',
      'research_catalog_review',
      'run_graph_workflow',
      'execute_spec',
      'registry_import',
    ];

    it('marks state-mutating tools correctly', () => {
      for (const name of mutatingTools) {
        const entry = TOOL_ANNOTATIONS[name] as ToolSideEffectsEntry;
        expect(entry.annotations.readOnlyHint, `${name} should not be readOnly`).toBe(false);
      }
    });
  });

  describe('open-world tools', () => {
    const openWorldTools = [
      'orchestrate',
      'execute_expert',
      'run_workflow',
      'consensus_vote',
      'research_add',
      'research_discover',
      'issue_triage',
      'run_graph_workflow',
      'execute_spec',
    ];

    it('marks tools that interact with external systems', () => {
      for (const name of openWorldTools) {
        const entry = TOOL_ANNOTATIONS[name] as ToolSideEffectsEntry;
        expect(entry.annotations.openWorldHint, `${name} should be openWorld`).toBe(true);
      }
    });
  });

  describe('getToolAnnotations', () => {
    it('returns entry for known tool', () => {
      const entry = getToolAnnotations('orchestrate');
      expect(entry).toBeDefined();
      expect(entry?.annotations.readOnlyHint).toBe(false);
      expect(entry?.sideEffects.length).toBeGreaterThan(0);
    });

    it('returns undefined for unknown tool', () => {
      expect(getToolAnnotations('nonexistent_tool')).toBeUndefined();
    });
  });

  describe('getMcpAnnotations', () => {
    it('returns only MCP annotations (no side effects)', () => {
      const annotations = getMcpAnnotations('list_experts');
      expect(annotations).toBeDefined();
      expect(annotations?.readOnlyHint).toBe(true);
      expect(annotations?.idempotentHint).toBe(true);
      // Should not have sideEffects property
      expect((annotations as Record<string, unknown>)['sideEffects']).toBeUndefined();
    });

    it('returns undefined for unknown tool', () => {
      expect(getMcpAnnotations('nonexistent')).toBeUndefined();
    });
  });

  describe('getSideEffectsByCategory', () => {
    it('filters by explicit category', () => {
      const effects = getSideEffectsByCategory('orchestrate', 'explicit');
      expect(effects.length).toBeGreaterThan(0);
      for (const se of effects) {
        expect(se.category).toBe('explicit');
      }
    });

    it('filters by implicit category', () => {
      const effects = getSideEffectsByCategory('orchestrate', 'implicit');
      expect(effects.length).toBeGreaterThan(0);
      for (const se of effects) {
        expect(se.category).toBe('implicit');
      }
    });

    it('filters by coupling category', () => {
      const effects = getSideEffectsByCategory('create_expert', 'coupling');
      expect(effects.length).toBeGreaterThan(0);
      for (const se of effects) {
        expect(se.category).toBe('coupling');
      }
    });

    it('returns empty array for unknown tool', () => {
      expect(getSideEffectsByCategory('nonexistent', 'explicit')).toEqual([]);
    });

    it('returns empty array when no effects match category', () => {
      // delegate_to_model has no explicit side effects
      const effects = getSideEffectsByCategory('delegate_to_model', 'explicit');
      expect(effects).toEqual([]);
    });
  });

  describe('no tool is marked destructive', () => {
    it('none of our tools are destructive', () => {
      for (const [name, entry] of Object.entries(TOOL_ANNOTATIONS)) {
        expect(entry.annotations.destructiveHint, `${name} should not be destructive`).toBe(false);
      }
    });
  });
});
