/**
 * nexus-agents/mcp/safety - Hazard Catalog Tests
 *
 * Comprehensive tests for the hazard catalog module.
 * This is a SECURITY-CRITICAL module defining safety hazards for STPA analysis.
 *
 * Tests verify:
 * - Hazard structure and required fields
 * - Hazard ID patterns and uniqueness
 * - HAZARD_CATALOG mapping completeness
 * - getHazardsForTool function behavior
 * - Enum value validity
 */

import { describe, it, expect } from 'vitest';
import {
  // Hazard arrays
  FILE_READ_HAZARDS,
  FILE_WRITE_HAZARDS,
  FILE_DELETE_HAZARDS,
  SHELL_EXECUTE_HAZARDS,
  NETWORK_HAZARDS,
  DATABASE_HAZARDS,
  AUTH_HAZARDS,
  ORCHESTRATION_HAZARDS,
  // HAZARD_CATALOG map
  HAZARD_CATALOG,
  // Main lookup function
  getHazardsForTool,
  // Tool categories
  ToolCategory,
} from './hazard-catalog.js';
import { HazardCategory, HazardSeverity, HazardLikelihood, type Hazard } from './stpa-types.js';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Valid HazardSeverity enum values for validation.
 */
const VALID_SEVERITIES = Object.values(HazardSeverity);

/**
 * Valid HazardLikelihood enum values for validation.
 */
const VALID_LIKELIHOODS = Object.values(HazardLikelihood);

/**
 * Valid HazardCategory enum values for validation.
 */
const VALID_CATEGORIES = Object.values(HazardCategory);

/**
 * Validates that a hazard has all required fields with correct types.
 */
function validateHazardStructure(hazard: Hazard): void {
  // Required string fields
  expect(hazard.id).toBeDefined();
  expect(typeof hazard.id).toBe('string');
  expect(hazard.id.length).toBeGreaterThan(0);

  expect(hazard.description).toBeDefined();
  expect(typeof hazard.description).toBe('string');
  expect(hazard.description.length).toBeGreaterThan(0);

  // Enum fields
  expect(hazard.category).toBeDefined();
  expect(VALID_CATEGORIES).toContain(hazard.category);

  expect(hazard.severity).toBeDefined();
  expect(VALID_SEVERITIES).toContain(hazard.severity);

  expect(hazard.likelihood).toBeDefined();
  expect(VALID_LIKELIHOODS).toContain(hazard.likelihood);

  // Array fields
  expect(hazard.triggerConditions).toBeDefined();
  expect(Array.isArray(hazard.triggerConditions)).toBe(true);
  expect(hazard.triggerConditions.length).toBeGreaterThan(0);

  expect(hazard.consequences).toBeDefined();
  expect(Array.isArray(hazard.consequences)).toBe(true);
  expect(hazard.consequences.length).toBeGreaterThan(0);
}

/**
 * Collects all hazard IDs from all hazard arrays.
 */
function getAllHazardIds(): string[] {
  return [
    ...FILE_READ_HAZARDS,
    ...FILE_WRITE_HAZARDS,
    ...FILE_DELETE_HAZARDS,
    ...SHELL_EXECUTE_HAZARDS,
    ...NETWORK_HAZARDS,
    ...DATABASE_HAZARDS,
    ...AUTH_HAZARDS,
    ...ORCHESTRATION_HAZARDS,
  ].map((h) => h.id);
}

// =============================================================================
// Hazard Array Count Tests
// =============================================================================

describe('Hazard Array Counts', () => {
  it('should have exactly 3 FILE_READ_HAZARDS', () => {
    expect(FILE_READ_HAZARDS).toHaveLength(3);
  });

  it('should have exactly 4 FILE_WRITE_HAZARDS', () => {
    expect(FILE_WRITE_HAZARDS).toHaveLength(4);
  });

  it('should have exactly 2 FILE_DELETE_HAZARDS', () => {
    expect(FILE_DELETE_HAZARDS).toHaveLength(2);
  });

  it('should have exactly 5 SHELL_EXECUTE_HAZARDS', () => {
    expect(SHELL_EXECUTE_HAZARDS).toHaveLength(5);
  });

  it('should have exactly 3 NETWORK_HAZARDS', () => {
    expect(NETWORK_HAZARDS).toHaveLength(3);
  });

  it('should have exactly 3 DATABASE_HAZARDS', () => {
    expect(DATABASE_HAZARDS).toHaveLength(3);
  });

  it('should have exactly 2 AUTH_HAZARDS', () => {
    expect(AUTH_HAZARDS).toHaveLength(2);
  });

  it('should have exactly 3 ORCHESTRATION_HAZARDS', () => {
    expect(ORCHESTRATION_HAZARDS).toHaveLength(3);
  });
});

// =============================================================================
// Hazard Structure Validation Tests
// =============================================================================

describe('FILE_READ_HAZARDS Structure', () => {
  it.each(FILE_READ_HAZARDS.map((h, i) => [h.id, h, i] as const))(
    'hazard %s should have all required fields with correct types',
    (_id, hazard) => {
      validateHazardStructure(hazard);
    }
  );

  it('should have hazards with H-FR- prefix', () => {
    for (const hazard of FILE_READ_HAZARDS) {
      expect(hazard.id).toMatch(/^H-FR-\d{3}$/);
    }
  });
});

describe('FILE_WRITE_HAZARDS Structure', () => {
  it.each(FILE_WRITE_HAZARDS.map((h, i) => [h.id, h, i] as const))(
    'hazard %s should have all required fields with correct types',
    (_id, hazard) => {
      validateHazardStructure(hazard);
    }
  );

  it('should have hazards with H-FW- prefix', () => {
    for (const hazard of FILE_WRITE_HAZARDS) {
      expect(hazard.id).toMatch(/^H-FW-\d{3}$/);
    }
  });
});

describe('FILE_DELETE_HAZARDS Structure', () => {
  it.each(FILE_DELETE_HAZARDS.map((h, i) => [h.id, h, i] as const))(
    'hazard %s should have all required fields with correct types',
    (_id, hazard) => {
      validateHazardStructure(hazard);
    }
  );

  it('should have hazards with H-FD- prefix', () => {
    for (const hazard of FILE_DELETE_HAZARDS) {
      expect(hazard.id).toMatch(/^H-FD-\d{3}$/);
    }
  });
});

describe('SHELL_EXECUTE_HAZARDS Structure', () => {
  it.each(SHELL_EXECUTE_HAZARDS.map((h, i) => [h.id, h, i] as const))(
    'hazard %s should have all required fields with correct types',
    (_id, hazard) => {
      validateHazardStructure(hazard);
    }
  );

  it('should have hazards with H-SH- prefix', () => {
    for (const hazard of SHELL_EXECUTE_HAZARDS) {
      expect(hazard.id).toMatch(/^H-SH-\d{3}$/);
    }
  });
});

describe('NETWORK_HAZARDS Structure', () => {
  it.each(NETWORK_HAZARDS.map((h, i) => [h.id, h, i] as const))(
    'hazard %s should have all required fields with correct types',
    (_id, hazard) => {
      validateHazardStructure(hazard);
    }
  );

  it('should have hazards with H-NET- prefix', () => {
    for (const hazard of NETWORK_HAZARDS) {
      expect(hazard.id).toMatch(/^H-NET-\d{3}$/);
    }
  });
});

describe('DATABASE_HAZARDS Structure', () => {
  it.each(DATABASE_HAZARDS.map((h, i) => [h.id, h, i] as const))(
    'hazard %s should have all required fields with correct types',
    (_id, hazard) => {
      validateHazardStructure(hazard);
    }
  );

  it('should have hazards with H-DB- prefix', () => {
    for (const hazard of DATABASE_HAZARDS) {
      expect(hazard.id).toMatch(/^H-DB-\d{3}$/);
    }
  });
});

describe('AUTH_HAZARDS Structure', () => {
  it.each(AUTH_HAZARDS.map((h, i) => [h.id, h, i] as const))(
    'hazard %s should have all required fields with correct types',
    (_id, hazard) => {
      validateHazardStructure(hazard);
    }
  );

  it('should have hazards with H-AUTH- prefix', () => {
    for (const hazard of AUTH_HAZARDS) {
      expect(hazard.id).toMatch(/^H-AUTH-\d{3}$/);
    }
  });
});

describe('ORCHESTRATION_HAZARDS Structure', () => {
  it.each(ORCHESTRATION_HAZARDS.map((h, i) => [h.id, h, i] as const))(
    'hazard %s should have all required fields with correct types',
    (_id, hazard) => {
      validateHazardStructure(hazard);
    }
  );

  it('should have hazards with H-ORCH- prefix', () => {
    for (const hazard of ORCHESTRATION_HAZARDS) {
      expect(hazard.id).toMatch(/^H-ORCH-\d{3}$/);
    }
  });
});

// =============================================================================
// Hazard ID Pattern Tests
// =============================================================================

describe('Hazard ID Patterns', () => {
  it('should follow H-XX-NNN pattern for all hazards', () => {
    const allHazards = [
      ...FILE_READ_HAZARDS,
      ...FILE_WRITE_HAZARDS,
      ...FILE_DELETE_HAZARDS,
      ...SHELL_EXECUTE_HAZARDS,
      ...NETWORK_HAZARDS,
      ...DATABASE_HAZARDS,
      ...AUTH_HAZARDS,
      ...ORCHESTRATION_HAZARDS,
    ];

    for (const hazard of allHazards) {
      // Pattern: H-<2-4 uppercase letters>-<3 digits>
      expect(hazard.id).toMatch(/^H-[A-Z]{2,5}-\d{3}$/);
    }
  });

  it('should have no duplicate hazard IDs across all categories', () => {
    const allIds = getAllHazardIds();
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });

  it('should have sequential IDs within each category', () => {
    const hazardArrays = [
      { name: 'FILE_READ', hazards: FILE_READ_HAZARDS, prefix: 'H-FR-' },
      { name: 'FILE_WRITE', hazards: FILE_WRITE_HAZARDS, prefix: 'H-FW-' },
      { name: 'FILE_DELETE', hazards: FILE_DELETE_HAZARDS, prefix: 'H-FD-' },
      { name: 'SHELL_EXECUTE', hazards: SHELL_EXECUTE_HAZARDS, prefix: 'H-SH-' },
      { name: 'NETWORK', hazards: NETWORK_HAZARDS, prefix: 'H-NET-' },
      { name: 'DATABASE', hazards: DATABASE_HAZARDS, prefix: 'H-DB-' },
      { name: 'AUTH', hazards: AUTH_HAZARDS, prefix: 'H-AUTH-' },
      { name: 'ORCHESTRATION', hazards: ORCHESTRATION_HAZARDS, prefix: 'H-ORCH-' },
    ];

    for (const { hazards, prefix } of hazardArrays) {
      const ids = hazards.map((h) => {
        const numPart = h.id.replace(prefix, '');
        return parseInt(numPart, 10);
      });
      for (let i = 0; i < ids.length; i++) {
        expect(ids[i]).toBe(i + 1);
      }
    }
  });
});

// =============================================================================
// HAZARD_CATALOG Map Tests
// =============================================================================

describe('HAZARD_CATALOG Map', () => {
  it('should contain all ToolCategory keys', () => {
    const allToolCategories = Object.values(ToolCategory);

    for (const category of allToolCategories) {
      expect(HAZARD_CATALOG.has(category)).toBe(true);
    }
  });

  it('should map FILE_READ category to FILE_READ_HAZARDS', () => {
    const hazards = HAZARD_CATALOG.get(ToolCategory.FILE_READ);
    expect(hazards).toBe(FILE_READ_HAZARDS);
  });

  it('should map FILE_WRITE category to FILE_WRITE_HAZARDS', () => {
    const hazards = HAZARD_CATALOG.get(ToolCategory.FILE_WRITE);
    expect(hazards).toBe(FILE_WRITE_HAZARDS);
  });

  it('should map FILE_DELETE category to FILE_DELETE_HAZARDS', () => {
    const hazards = HAZARD_CATALOG.get(ToolCategory.FILE_DELETE);
    expect(hazards).toBe(FILE_DELETE_HAZARDS);
  });

  it('should map SHELL_EXECUTE category to SHELL_EXECUTE_HAZARDS', () => {
    const hazards = HAZARD_CATALOG.get(ToolCategory.SHELL_EXECUTE);
    expect(hazards).toBe(SHELL_EXECUTE_HAZARDS);
  });

  it('should map NETWORK_REQUEST category to NETWORK_HAZARDS', () => {
    const hazards = HAZARD_CATALOG.get(ToolCategory.NETWORK_REQUEST);
    expect(hazards).toBe(NETWORK_HAZARDS);
  });

  it('should map DATABASE_QUERY category to DATABASE_HAZARDS', () => {
    const hazards = HAZARD_CATALOG.get(ToolCategory.DATABASE_QUERY);
    expect(hazards).toBe(DATABASE_HAZARDS);
  });

  it('should map DATABASE_MODIFY category to DATABASE_HAZARDS', () => {
    const hazards = HAZARD_CATALOG.get(ToolCategory.DATABASE_MODIFY);
    expect(hazards).toBe(DATABASE_HAZARDS);
  });

  it('should map AUTHENTICATION category to AUTH_HAZARDS', () => {
    const hazards = HAZARD_CATALOG.get(ToolCategory.AUTHENTICATION);
    expect(hazards).toBe(AUTH_HAZARDS);
  });

  it('should map ORCHESTRATION category to ORCHESTRATION_HAZARDS', () => {
    const hazards = HAZARD_CATALOG.get(ToolCategory.ORCHESTRATION);
    expect(hazards).toBe(ORCHESTRATION_HAZARDS);
  });

  it('should map MEMORY category to empty array', () => {
    const hazards = HAZARD_CATALOG.get(ToolCategory.MEMORY);
    expect(hazards).toEqual([]);
  });

  it('should map UNKNOWN category to empty array', () => {
    const hazards = HAZARD_CATALOG.get(ToolCategory.UNKNOWN);
    expect(hazards).toEqual([]);
  });

  it('should be a ReadonlyMap', () => {
    // TypeScript ensures this at compile time, but we verify runtime behavior
    expect(HAZARD_CATALOG).toBeInstanceOf(Map);
    // Verify we cannot modify the values (they are readonly arrays)
    const hazards = HAZARD_CATALOG.get(ToolCategory.FILE_READ);
    expect(Object.isFrozen(hazards)).toBe(false); // Not frozen, but typed as readonly
  });
});

// =============================================================================
// getHazardsForTool Tests - File Operations
// =============================================================================

describe('getHazardsForTool - File Read Tools', () => {
  it('should return hazards for read_file', () => {
    const hazards = getHazardsForTool('read_file');
    expect(hazards.length).toBeGreaterThan(0);
    expect(hazards).toEqual(FILE_READ_HAZARDS);
  });

  it('should return hazards for get_file', () => {
    const hazards = getHazardsForTool('get_file');
    expect(hazards.length).toBeGreaterThan(0);
  });

  it('should return hazards for load_file', () => {
    const hazards = getHazardsForTool('load_file');
    expect(hazards.length).toBeGreaterThan(0);
  });

  it('should return hazards for cat command', () => {
    const hazards = getHazardsForTool('cat');
    expect(hazards.length).toBeGreaterThan(0);
  });

  it('should return hazards for head command', () => {
    const hazards = getHazardsForTool('head');
    expect(hazards.length).toBeGreaterThan(0);
  });

  it('should return hazards for tail command', () => {
    const hazards = getHazardsForTool('tail');
    expect(hazards.length).toBeGreaterThan(0);
  });
});

describe('getHazardsForTool - File Write Tools', () => {
  it('should return hazards for write_file', () => {
    const hazards = getHazardsForTool('write_file');
    expect(hazards.length).toBeGreaterThan(0);
    expect(hazards).toEqual(FILE_WRITE_HAZARDS);
  });

  it('should return hazards for save_file', () => {
    const hazards = getHazardsForTool('save_file');
    expect(hazards.length).toBeGreaterThan(0);
  });

  it('should return hazards for create_file', () => {
    const hazards = getHazardsForTool('create_file');
    expect(hazards.length).toBeGreaterThan(0);
  });

  it('should return hazards for edit_file', () => {
    const hazards = getHazardsForTool('edit_file');
    expect(hazards.length).toBeGreaterThan(0);
  });

  it('should return hazards for append', () => {
    const hazards = getHazardsForTool('append');
    expect(hazards.length).toBeGreaterThan(0);
  });
});

describe('getHazardsForTool - File Delete Tools', () => {
  it('should return hazards for delete_file', () => {
    const hazards = getHazardsForTool('delete_file');
    expect(hazards.length).toBeGreaterThan(0);
    expect(hazards).toEqual(FILE_DELETE_HAZARDS);
  });

  it('should return hazards for remove_file', () => {
    const hazards = getHazardsForTool('remove_file');
    expect(hazards.length).toBeGreaterThan(0);
  });

  it('should return hazards for rm command', () => {
    const hazards = getHazardsForTool('rm');
    expect(hazards.length).toBeGreaterThan(0);
  });

  it('should return hazards for unlink', () => {
    const hazards = getHazardsForTool('unlink');
    expect(hazards.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// getHazardsForTool Tests - Shell Tools
// =============================================================================

describe('getHazardsForTool - Shell Tools', () => {
  it('should return hazards for bash', () => {
    const hazards = getHazardsForTool('bash');
    expect(hazards.length).toBeGreaterThan(0);
    expect(hazards).toEqual(SHELL_EXECUTE_HAZARDS);
  });

  it('should return hazards for shell', () => {
    const hazards = getHazardsForTool('shell');
    expect(hazards.length).toBeGreaterThan(0);
  });

  it('should return hazards for execute', () => {
    const hazards = getHazardsForTool('execute');
    expect(hazards.length).toBeGreaterThan(0);
  });

  it('should return hazards for exec', () => {
    const hazards = getHazardsForTool('exec');
    expect(hazards.length).toBeGreaterThan(0);
  });

  it('should return hazards for run_command', () => {
    const hazards = getHazardsForTool('run_command');
    expect(hazards.length).toBeGreaterThan(0);
  });

  it('should return hazards for spawn', () => {
    const hazards = getHazardsForTool('spawn');
    expect(hazards.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// getHazardsForTool Tests - Network Tools
// =============================================================================

describe('getHazardsForTool - Network Tools', () => {
  it('should return hazards for fetch', () => {
    const hazards = getHazardsForTool('fetch');
    expect(hazards.length).toBeGreaterThan(0);
    expect(hazards).toEqual(NETWORK_HAZARDS);
  });

  it('should return hazards for http', () => {
    const hazards = getHazardsForTool('http');
    expect(hazards.length).toBeGreaterThan(0);
  });

  it('should return hazards for http_request', () => {
    const hazards = getHazardsForTool('http_request');
    expect(hazards.length).toBeGreaterThan(0);
  });

  it('should return hazards for curl', () => {
    const hazards = getHazardsForTool('curl');
    expect(hazards.length).toBeGreaterThan(0);
  });

  it('should return hazards for wget', () => {
    const hazards = getHazardsForTool('wget');
    expect(hazards.length).toBeGreaterThan(0);
  });

  it('should return hazards for request', () => {
    const hazards = getHazardsForTool('request');
    expect(hazards.length).toBeGreaterThan(0);
  });

  it('should return hazards for api_call', () => {
    const hazards = getHazardsForTool('api_call');
    expect(hazards.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// getHazardsForTool Tests - Database Tools
// =============================================================================

describe('getHazardsForTool - Database Tools', () => {
  it('should return hazards for query', () => {
    const hazards = getHazardsForTool('query');
    expect(hazards.length).toBeGreaterThan(0);
    expect(hazards).toEqual(DATABASE_HAZARDS);
  });

  it('should return hazards for select', () => {
    const hazards = getHazardsForTool('select');
    expect(hazards.length).toBeGreaterThan(0);
  });

  it('should return hazards for find', () => {
    const hazards = getHazardsForTool('find');
    expect(hazards.length).toBeGreaterThan(0);
  });

  it('should return hazards for search', () => {
    const hazards = getHazardsForTool('search');
    expect(hazards.length).toBeGreaterThan(0);
  });

  it('should return hazards for insert', () => {
    const hazards = getHazardsForTool('insert');
    expect(hazards.length).toBeGreaterThan(0);
    expect(hazards).toEqual(DATABASE_HAZARDS);
  });

  it('should return hazards for update', () => {
    const hazards = getHazardsForTool('update');
    expect(hazards.length).toBeGreaterThan(0);
  });

  it('should return hazards for drop', () => {
    const hazards = getHazardsForTool('drop');
    expect(hazards.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// getHazardsForTool Tests - Auth Tools
// =============================================================================

describe('getHazardsForTool - Authentication Tools', () => {
  it('should return hazards for auth', () => {
    const hazards = getHazardsForTool('auth');
    expect(hazards.length).toBeGreaterThan(0);
    expect(hazards).toEqual(AUTH_HAZARDS);
  });

  it('should return hazards for login', () => {
    const hazards = getHazardsForTool('login');
    expect(hazards.length).toBeGreaterThan(0);
  });

  it('should return hazards for logout', () => {
    const hazards = getHazardsForTool('logout');
    expect(hazards.length).toBeGreaterThan(0);
  });

  it('should return hazards for token', () => {
    const hazards = getHazardsForTool('token');
    expect(hazards.length).toBeGreaterThan(0);
  });

  it('should return hazards for credential', () => {
    const hazards = getHazardsForTool('credential');
    expect(hazards.length).toBeGreaterThan(0);
  });

  it('should return hazards for password', () => {
    const hazards = getHazardsForTool('password');
    expect(hazards.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// getHazardsForTool Tests - Orchestration Tools
// =============================================================================

describe('getHazardsForTool - Orchestration Tools', () => {
  it('should return hazards for orchestrate', () => {
    const hazards = getHazardsForTool('orchestrate');
    expect(hazards.length).toBeGreaterThan(0);
    expect(hazards).toEqual(ORCHESTRATION_HAZARDS);
  });

  it('should return hazards for delegate', () => {
    const hazards = getHazardsForTool('delegate');
    expect(hazards.length).toBeGreaterThan(0);
  });

  it('should return hazards for create_expert', () => {
    const hazards = getHazardsForTool('create_expert');
    expect(hazards.length).toBeGreaterThan(0);
  });

  it('should return hazards for run_workflow', () => {
    const hazards = getHazardsForTool('run_workflow');
    expect(hazards.length).toBeGreaterThan(0);
  });

  it('should return hazards for agent', () => {
    const hazards = getHazardsForTool('agent');
    expect(hazards.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// getHazardsForTool Tests - Unknown Tools
// =============================================================================

describe('getHazardsForTool - Unknown Tools', () => {
  it('should return empty array for completely unknown tool', () => {
    const hazards = getHazardsForTool('unknown_tool_xyz');
    expect(hazards).toHaveLength(0);
  });

  it('should return empty array for random string', () => {
    const hazards = getHazardsForTool('abc123');
    expect(hazards).toHaveLength(0);
  });

  it('should return empty array for empty string', () => {
    const hazards = getHazardsForTool('');
    expect(hazards).toHaveLength(0);
  });

  it('should return empty array for whitespace-only string', () => {
    const hazards = getHazardsForTool('   ');
    expect(hazards).toHaveLength(0);
  });

  it('should return empty array for my_custom_tool', () => {
    const hazards = getHazardsForTool('my_custom_tool');
    expect(hazards).toHaveLength(0);
  });
});

// =============================================================================
// getHazardsForTool Tests - Case Insensitivity
// =============================================================================

describe('getHazardsForTool - Case Insensitivity', () => {
  it('should handle uppercase tool names', () => {
    const hazards = getHazardsForTool('READ_FILE');
    expect(hazards.length).toBeGreaterThan(0);
  });

  it('should handle mixed case tool names', () => {
    const hazards = getHazardsForTool('Read_File');
    expect(hazards.length).toBeGreaterThan(0);
  });

  it('should handle camelCase tool names', () => {
    const hazards = getHazardsForTool('readFile');
    expect(hazards.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// Severity and Likelihood Enum Value Tests
// =============================================================================

describe('Severity Enum Values', () => {
  it('should use valid HazardSeverity values in all hazards', () => {
    const allHazards = [
      ...FILE_READ_HAZARDS,
      ...FILE_WRITE_HAZARDS,
      ...FILE_DELETE_HAZARDS,
      ...SHELL_EXECUTE_HAZARDS,
      ...NETWORK_HAZARDS,
      ...DATABASE_HAZARDS,
      ...AUTH_HAZARDS,
      ...ORCHESTRATION_HAZARDS,
    ];

    for (const hazard of allHazards) {
      expect(VALID_SEVERITIES).toContain(hazard.severity);
    }
  });

  it('should have CRITICAL severity for high-risk hazards', () => {
    // Path traversal, command injection, SQL injection should be CRITICAL
    const criticalHazards = [
      FILE_READ_HAZARDS[0], // Path traversal
      SHELL_EXECUTE_HAZARDS[0], // Command injection
      DATABASE_HAZARDS[0], // SQL injection
    ];

    for (const hazard of criticalHazards) {
      expect(hazard?.severity).toBe(HazardSeverity.CRITICAL);
    }
  });
});

describe('Likelihood Enum Values', () => {
  it('should use valid HazardLikelihood values in all hazards', () => {
    const allHazards = [
      ...FILE_READ_HAZARDS,
      ...FILE_WRITE_HAZARDS,
      ...FILE_DELETE_HAZARDS,
      ...SHELL_EXECUTE_HAZARDS,
      ...NETWORK_HAZARDS,
      ...DATABASE_HAZARDS,
      ...AUTH_HAZARDS,
      ...ORCHESTRATION_HAZARDS,
    ];

    for (const hazard of allHazards) {
      expect(VALID_LIKELIHOODS).toContain(hazard.likelihood);
    }
  });
});

describe('Category Enum Values', () => {
  it('should use valid HazardCategory values in all hazards', () => {
    const allHazards = [
      ...FILE_READ_HAZARDS,
      ...FILE_WRITE_HAZARDS,
      ...FILE_DELETE_HAZARDS,
      ...SHELL_EXECUTE_HAZARDS,
      ...NETWORK_HAZARDS,
      ...DATABASE_HAZARDS,
      ...AUTH_HAZARDS,
      ...ORCHESTRATION_HAZARDS,
    ];

    for (const hazard of allHazards) {
      expect(VALID_CATEGORIES).toContain(hazard.category);
    }
  });

  it('should have appropriate categories for each hazard array', () => {
    // FILE_READ_HAZARDS should include INFORMATION_DISCLOSURE
    expect(
      FILE_READ_HAZARDS.some((h) => h.category === HazardCategory.INFORMATION_DISCLOSURE)
    ).toBe(true);

    // FILE_WRITE_HAZARDS should include DATA_LOSS
    expect(FILE_WRITE_HAZARDS.some((h) => h.category === HazardCategory.DATA_LOSS)).toBe(true);

    // FILE_DELETE_HAZARDS should include DATA_LOSS
    expect(FILE_DELETE_HAZARDS.some((h) => h.category === HazardCategory.DATA_LOSS)).toBe(true);

    // SHELL_EXECUTE_HAZARDS should include INJECTION
    expect(SHELL_EXECUTE_HAZARDS.some((h) => h.category === HazardCategory.INJECTION)).toBe(true);

    // NETWORK_HAZARDS should include UNAUTHORIZED_EXECUTION (SSRF)
    expect(NETWORK_HAZARDS.some((h) => h.category === HazardCategory.UNAUTHORIZED_EXECUTION)).toBe(
      true
    );

    // DATABASE_HAZARDS should include INJECTION
    expect(DATABASE_HAZARDS.some((h) => h.category === HazardCategory.INJECTION)).toBe(true);

    // AUTH_HAZARDS should include INFORMATION_DISCLOSURE
    expect(AUTH_HAZARDS.some((h) => h.category === HazardCategory.INFORMATION_DISCLOSURE)).toBe(
      true
    );

    // ORCHESTRATION_HAZARDS should include INJECTION (prompt injection)
    expect(ORCHESTRATION_HAZARDS.some((h) => h.category === HazardCategory.INJECTION)).toBe(true);
  });
});

// =============================================================================
// Content Validation Tests
// =============================================================================

describe('Hazard Content Validation', () => {
  it('should have non-empty trigger conditions for all hazards', () => {
    const allHazards = [
      ...FILE_READ_HAZARDS,
      ...FILE_WRITE_HAZARDS,
      ...FILE_DELETE_HAZARDS,
      ...SHELL_EXECUTE_HAZARDS,
      ...NETWORK_HAZARDS,
      ...DATABASE_HAZARDS,
      ...AUTH_HAZARDS,
      ...ORCHESTRATION_HAZARDS,
    ];

    for (const hazard of allHazards) {
      expect(hazard.triggerConditions.length).toBeGreaterThan(0);
      for (const condition of hazard.triggerConditions) {
        expect(typeof condition).toBe('string');
        expect(condition.length).toBeGreaterThan(0);
      }
    }
  });

  it('should have non-empty consequences for all hazards', () => {
    const allHazards = [
      ...FILE_READ_HAZARDS,
      ...FILE_WRITE_HAZARDS,
      ...FILE_DELETE_HAZARDS,
      ...SHELL_EXECUTE_HAZARDS,
      ...NETWORK_HAZARDS,
      ...DATABASE_HAZARDS,
      ...AUTH_HAZARDS,
      ...ORCHESTRATION_HAZARDS,
    ];

    for (const hazard of allHazards) {
      expect(hazard.consequences.length).toBeGreaterThan(0);
      for (const consequence of hazard.consequences) {
        expect(typeof consequence).toBe('string');
        expect(consequence.length).toBeGreaterThan(0);
      }
    }
  });

  it('should have descriptive descriptions for all hazards', () => {
    const allHazards = [
      ...FILE_READ_HAZARDS,
      ...FILE_WRITE_HAZARDS,
      ...FILE_DELETE_HAZARDS,
      ...SHELL_EXECUTE_HAZARDS,
      ...NETWORK_HAZARDS,
      ...DATABASE_HAZARDS,
      ...AUTH_HAZARDS,
      ...ORCHESTRATION_HAZARDS,
    ];

    for (const hazard of allHazards) {
      // Description should be at least 20 characters for meaningful content
      expect(hazard.description.length).toBeGreaterThanOrEqual(20);
    }
  });
});

// =============================================================================
// Memory Category Tests
// =============================================================================

describe('Memory Category Hazards', () => {
  it('should return empty array for memory tools (low-risk)', () => {
    const hazards = getHazardsForTool('memory');
    expect(hazards).toHaveLength(0);
  });

  it('should return empty array for store tools', () => {
    const hazards = getHazardsForTool('store');
    expect(hazards).toHaveLength(0);
  });

  it('should return empty array for retrieve tools', () => {
    const hazards = getHazardsForTool('retrieve');
    expect(hazards).toHaveLength(0);
  });

  it('should return empty array for cache tools', () => {
    const hazards = getHazardsForTool('cache');
    expect(hazards).toHaveLength(0);
  });

  it('should return empty array for session tools', () => {
    const hazards = getHazardsForTool('session');
    expect(hazards).toHaveLength(0);
  });
});

// =============================================================================
// Edge Cases and Security Tests
// =============================================================================

describe('Edge Cases', () => {
  it('should handle tool names with special characters', () => {
    // These should not crash, even if they return empty
    expect(() => getHazardsForTool('tool-with-dash')).not.toThrow();
    expect(() => getHazardsForTool('tool.with.dot')).not.toThrow();
    expect(() => getHazardsForTool('tool_with_underscore')).not.toThrow();
  });

  it('should handle very long tool names', () => {
    const longName = 'a'.repeat(1000);
    expect(() => getHazardsForTool(longName)).not.toThrow();
  });

  it('should handle unicode characters in tool names', () => {
    expect(() => getHazardsForTool('read_file_\u00e9')).not.toThrow();
    expect(() => getHazardsForTool('\u4e2d\u6587')).not.toThrow();
  });

  it('should return readonly arrays from HAZARD_CATALOG', () => {
    const hazards = HAZARD_CATALOG.get(ToolCategory.FILE_READ);
    expect(hazards).toBeDefined();
    // TypeScript enforces readonly at compile time
    // We can verify the array reference is correct
    expect(hazards).toBe(FILE_READ_HAZARDS);
  });
});

describe('Security Validation', () => {
  it('should include path traversal hazard for file read', () => {
    const hazards = getHazardsForTool('read_file');
    const pathTraversalHazard = hazards.find(
      (h) =>
        h.description.toLowerCase().includes('path traversal') ||
        h.triggerConditions.some((t) => t.toLowerCase().includes('path traversal'))
    );
    expect(pathTraversalHazard).toBeDefined();
  });

  it('should include command injection hazard for shell execute', () => {
    const hazards = getHazardsForTool('bash');
    const injectionHazard = hazards.find((h) => h.category === HazardCategory.INJECTION);
    expect(injectionHazard).toBeDefined();
  });

  it('should include SQL injection hazard for database query', () => {
    const hazards = getHazardsForTool('query');
    const sqlInjectionHazard = hazards.find(
      (h) => h.category === HazardCategory.INJECTION && h.description.toLowerCase().includes('sql')
    );
    expect(sqlInjectionHazard).toBeDefined();
  });

  it('should include SSRF hazard for network tools', () => {
    const hazards = getHazardsForTool('fetch');
    const ssrfHazard = hazards.find(
      (h) =>
        h.description.toLowerCase().includes('ssrf') ||
        h.description.toLowerCase().includes('server-side request forgery')
    );
    expect(ssrfHazard).toBeDefined();
  });

  it('should include credential exposure hazard for auth tools', () => {
    const hazards = getHazardsForTool('auth');
    const credentialHazard = hazards.find((h) =>
      h.description.toLowerCase().includes('credential')
    );
    expect(credentialHazard).toBeDefined();
  });

  it('should include prompt injection hazard for orchestration tools', () => {
    const hazards = getHazardsForTool('orchestrate');
    const promptInjectionHazard = hazards.find(
      (h) =>
        h.category === HazardCategory.INJECTION && h.description.toLowerCase().includes('prompt')
    );
    expect(promptInjectionHazard).toBeDefined();
  });
});
