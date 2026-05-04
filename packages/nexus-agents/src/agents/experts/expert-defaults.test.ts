/**
 * Tests for DEFAULT_EXPERTS registry.
 *
 * (Source: Issue #2341 — DEFAULT_EXPERTS missing research / qa / data-visualization
 * even though BuiltInExpertType declared all 12.)
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_EXPERTS } from './expert-defaults.js';
import { BuiltInExpertTypeSchema } from './expert-config.js';
import type { AgentRole } from '../../core/index.js';

// Mapping from BuiltInExpertType literal → expected DEFAULT_EXPERTS role name.
// Single source of truth for the contract test below.
const BUILT_IN_TYPE_TO_ROLE: ReadonlyArray<readonly [string, AgentRole]> = [
  ['code', 'code_expert'],
  ['architecture', 'architecture_expert'],
  ['security', 'security_expert'],
  ['documentation', 'documentation_expert'],
  ['testing', 'testing_expert'],
  ['devops', 'devops_expert'],
  ['research', 'research_expert'],
  ['pm', 'pm_expert'],
  ['ux', 'ux_expert'],
  ['infrastructure', 'infrastructure_expert'],
  ['qa', 'qa_expert'],
  ['data-visualization', 'data_visualization_expert'],
];

describe('DEFAULT_EXPERTS', () => {
  it('has an entry for every BuiltInExpertType (#2341 drift gate)', () => {
    const definedRoles = new Set<AgentRole>(DEFAULT_EXPERTS.map((e) => e.role));
    for (const [type, role] of BUILT_IN_TYPE_TO_ROLE) {
      // Sanity: the type itself must be a valid BuiltInExpertType.
      expect(BuiltInExpertTypeSchema.safeParse(type).success).toBe(true);
      // Contract: DEFAULT_EXPERTS must include the matching role.
      expect(definedRoles.has(role), `DEFAULT_EXPERTS missing role for '${type}' (${role})`).toBe(
        true
      );
    }
  });

  it('has unique ids', () => {
    const ids = DEFAULT_EXPERTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique roles', () => {
    const roles = DEFAULT_EXPERTS.map((e) => e.role);
    expect(new Set(roles).size).toBe(roles.length);
  });
});
