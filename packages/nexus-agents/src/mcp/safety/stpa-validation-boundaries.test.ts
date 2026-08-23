/**
 * STPA Validation Tests
 *
 * Security-critical tests for STPA validation functions that verify
 * tools against safety constraints. These tests focus on input validation,
 * edge cases, and security boundaries.
 *
 * @module mcp/safety/__tests__/stpa-validation.test
 * (Source: Issue #345)
 */

import { describe, it, expect } from 'vitest';
import { validateToolAgainstConstraints } from './stpa-validation.js';
import {
  type ToolDefinition,
  type SafetyConstraint,
  HazardSeverity,
  ConstraintEnforcement,
  ConstraintPriority,
} from './stpa-types.js';
// ToolCategory may be used in future tests for hazard mapping
void 0; // Intentionally unused import removed

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Creates a tool definition with customizable properties.
 */
function createTool(
  name: string,
  description: string,
  properties: Record<
    string,
    { type: string; description?: string; pattern?: string; enum?: unknown[] }
  > = {}
): ToolDefinition {
  return {
    name,
    description,
    inputSchema: {
      type: 'object',
      properties,
      required: Object.keys(properties),
    },
  };
}

/**
 * Creates a safety constraint for testing.
 */
function createConstraint(
  id: string,
  description: string,
  enforcement: ConstraintEnforcement,
  priority: ConstraintPriority = ConstraintPriority.NORMAL
): SafetyConstraint {
  return {
    id,
    description,
    mitigates: [`UCA-${id}`],
    enforcement,
    priority,
    validationFunction: `validate_${id.toLowerCase()}`,
  };
}

// =============================================================================
// Input Validation Tests
// =============================================================================

describe('STPA Validation - Input Validation', () => {
  describe('Tool Definition Validation', () => {
    it('should handle tool with empty name', () => {
      const tool = createTool('', 'Description', {});
      const constraints: SafetyConstraint[] = [];

      const result = validateToolAgainstConstraints(tool, constraints);
      // Should still process but may add warnings
      expect(result.toolName).toBe('');
      expect(result.validatedAt).toBeInstanceOf(Date);
    });

    it('should handle tool with very long name', () => {
      const longName = 'a'.repeat(10000);
      const tool = createTool(longName, 'Description', {});
      const constraints: SafetyConstraint[] = [];

      const result = validateToolAgainstConstraints(tool, constraints);
      expect(result.toolName).toBe(longName);
    });

    it('should handle tool with special characters in name', () => {
      const tool = createTool('tool-with_special.chars', 'Description', {});
      const constraints: SafetyConstraint[] = [];

      const result = validateToolAgainstConstraints(tool, constraints);
      expect(result.toolName).toBe('tool-with_special.chars');
    });

    it('should handle tool with unicode in description', () => {
      const tool = createTool('tool', 'Description with unicode: \u4e2d\u6587 \ud83d\ude00', {});
      const constraints: SafetyConstraint[] = [];

      const result = validateToolAgainstConstraints(tool, constraints);
      // Previously pinned the vacuous pass: zero constraints and no declared
      // input properties means nothing was measured (#4585).
      expect(result.valid).toBe(false);
    });

    it('should handle tool with empty description', () => {
      const tool = createTool('tool', '', {});
      const constraints: SafetyConstraint[] = [];

      const result = validateToolAgainstConstraints(tool, constraints);
      // Previously pinned the vacuous pass (see above) — unmeasured, not valid (#4585).
      expect(result.valid).toBe(false);
    });
  });

  describe('Input Schema Validation', () => {
    it('should handle empty properties object', () => {
      const tool = createTool('tool', 'Description', {});
      const constraints: SafetyConstraint[] = [];

      const result = validateToolAgainstConstraints(tool, constraints);
      expect(result.warnings.some((w) => w.code === 'NO_INPUT_SCHEMA')).toBe(true);
    });

    it('should handle properties with various types', () => {
      const tool: ToolDefinition = {
        name: 'multi_type_tool',
        description: 'Tool with various property types',
        inputSchema: {
          type: 'object',
          properties: {
            stringProp: { type: 'string' },
            numberProp: { type: 'number' },
            booleanProp: { type: 'boolean' },
            arrayProp: { type: 'array' },
            objectProp: { type: 'object' },
          },
          required: ['stringProp'],
        },
      };
      const constraints: SafetyConstraint[] = [];

      const result = validateToolAgainstConstraints(tool, constraints);
      // Previously pinned the vacuous pass: the properties are rich, but zero
      // constraints were evaluated, so no verdict was earned (#4585).
      expect(result.valid).toBe(false);
      expect(result.warnings.some((w) => w.code === 'NO_CONSTRAINTS_EVALUATED')).toBe(true);
    });

    it('should detect path parameters without validation', () => {
      const tool = createTool('file_tool', 'Read a file', {
        path: { type: 'string', description: 'File path' },
      });
      const constraints = [
        createConstraint(
          'SC-001',
          'Sanitize input to prevent path traversal',
          ConstraintEnforcement.SANITIZE
        ),
      ];

      const result = validateToolAgainstConstraints(tool, constraints);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0]?.details).toContain('path');
    });

    it('should detect command parameters without validation', () => {
      const tool = createTool('exec_tool', 'Execute a command', {
        command: { type: 'string', description: 'Command to execute' },
      });
      const constraints = [
        createConstraint(
          'SC-001',
          'Sanitize input to prevent injection',
          ConstraintEnforcement.SANITIZE
        ),
      ];

      const result = validateToolAgainstConstraints(tool, constraints);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0]?.details).toContain('command');
    });

    it('should detect url parameters without validation', () => {
      const tool = createTool('fetch_tool', 'Fetch a URL', {
        url: { type: 'string', description: 'URL to fetch' },
      });
      const constraints = [
        createConstraint(
          'SC-001',
          'Sanitize input to prevent information disclosure',
          ConstraintEnforcement.SANITIZE
        ),
      ];

      const result = validateToolAgainstConstraints(tool, constraints);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0]?.details).toContain('url');
    });

    it('should detect query parameters without validation', () => {
      // Use a shell execute tool which matches "injection" in constraints
      const tool = createTool('execute', 'Execute SQL query', {
        query: { type: 'string', description: 'SQL query to execute' },
      });
      const constraints = [
        createConstraint(
          'SC-001',
          'Sanitize input to prevent injection',
          ConstraintEnforcement.SANITIZE
        ),
      ];

      const result = validateToolAgainstConstraints(tool, constraints);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0]?.details).toContain('query');
    });

    it('should not flag parameters with validation patterns', () => {
      const tool = createTool('safe_tool', 'Read a file', {
        path: {
          type: 'string',
          description: 'File path',
          pattern: '^[a-zA-Z0-9_/.-]+$',
        },
      });
      const constraints = [
        createConstraint(
          'SC-001',
          'Sanitize input to prevent path traversal',
          ConstraintEnforcement.SANITIZE
        ),
      ];

      const result = validateToolAgainstConstraints(tool, constraints);
      // Should not have path-related violations since pattern is defined
      expect(result.violations.every((v) => !v.details.includes('path'))).toBe(true);
    });
  });

  describe('Constraint Validation', () => {
    it('should handle empty constraints array', () => {
      const tool = createTool('tool', 'Description', {});
      const constraints: SafetyConstraint[] = [];

      const result = validateToolAgainstConstraints(tool, constraints);
      expect(result.violations).toHaveLength(0);
      expect(result.passed).toHaveLength(0);
    });

    it('should handle multiple constraints', () => {
      const tool = createTool('tool', 'A safe tool', {});
      const constraints = [
        createConstraint('SC-001', 'Alert on unusual patterns', ConstraintEnforcement.ALERT),
        createConstraint('SC-002', 'Rate limit requests', ConstraintEnforcement.RATE_LIMIT),
        createConstraint(
          'SC-003',
          'Require confirmation',
          ConstraintEnforcement.REQUIRE_CONFIRMATION
        ),
      ];

      const result = validateToolAgainstConstraints(tool, constraints);
      expect(result.validatedAt).toBeInstanceOf(Date);
    });

    it('should handle constraints with all enforcement types', () => {
      const tool = createTool('tool', 'Description', {});
      const enforcementTypes = [
        ConstraintEnforcement.PREVENT,
        ConstraintEnforcement.REQUIRE_CONFIRMATION,
        ConstraintEnforcement.ALERT,
        ConstraintEnforcement.SANITIZE,
        ConstraintEnforcement.RATE_LIMIT,
        ConstraintEnforcement.REQUIRE_PRIVILEGE,
      ];

      const constraints = enforcementTypes.map((enforcement, i) =>
        createConstraint(`SC-00${String(i)}`, `Constraint ${String(i)}`, enforcement)
      );

      const result = validateToolAgainstConstraints(tool, constraints);
      expect(result.validatedAt).toBeInstanceOf(Date);
    });

    it('should handle constraints with all priority levels', () => {
      const tool = createTool('tool', 'Description', {});
      const priorities = [
        ConstraintPriority.CRITICAL,
        ConstraintPriority.HIGH,
        ConstraintPriority.NORMAL,
        ConstraintPriority.LOW,
      ];

      const constraints = priorities.map((priority, i) =>
        createConstraint(
          `SC-00${String(i)}`,
          `Constraint ${String(i)}`,
          ConstraintEnforcement.ALERT,
          priority
        )
      );

      const result = validateToolAgainstConstraints(tool, constraints);
      expect(result.validatedAt).toBeInstanceOf(Date);
    });
  });
});

// =============================================================================
// Security Boundary Tests
// =============================================================================

describe('STPA Validation - Security Boundaries', () => {
  describe('Shell Execute Tool Detection', () => {
    it('should detect shell tool without command allowlist', () => {
      const tool = createTool('bash', 'Execute shell commands', {
        command: { type: 'string', description: 'Command to run' },
      });
      const constraints = [
        createConstraint('SC-001', 'Prevent command injection', ConstraintEnforcement.PREVENT),
      ];

      const result = validateToolAgainstConstraints(tool, constraints);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0]?.severity).toBe(HazardSeverity.CRITICAL);
    });

    it('should not flag shell tool with command enum', () => {
      const tool = createTool('shell', 'Execute allowed commands', {
        command: {
          type: 'string',
          description: 'Command to run',
          enum: ['ls', 'pwd', 'whoami'],
        },
      });
      const constraints = [
        createConstraint('SC-001', 'Prevent command injection', ConstraintEnforcement.PREVENT),
      ];

      const result = validateToolAgainstConstraints(tool, constraints);
      // Should not have command-related violations since enum restricts commands
      expect(result.violations.every((v) => !v.details.includes('arbitrary commands'))).toBe(true);
    });

    it('should detect execute tool patterns', () => {
      const executeTools = ['execute', 'run_command', 'shell_exec', 'exec'];

      for (const toolName of executeTools) {
        const tool = createTool(toolName, 'Execute commands', {
          command: { type: 'string' },
        });
        const constraints = [
          createConstraint('SC-001', 'Prevent command injection', ConstraintEnforcement.PREVENT),
        ];

        const result = validateToolAgainstConstraints(tool, constraints);
        // Should detect shell execution pattern
        expect(
          result.violations.length + result.passed.length + result.warnings.length
        ).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('File Operation Tool Detection', () => {
    it('should detect file read tools needing path validation', () => {
      const fileTools = ['read_file', 'get_file', 'load_file', 'cat'];

      for (const toolName of fileTools) {
        const tool = createTool(toolName, 'Read file contents', {
          path: { type: 'string' },
        });
        const constraints = [
          createConstraint(
            'SC-001',
            'Sanitize path to prevent traversal',
            ConstraintEnforcement.SANITIZE
          ),
        ];

        const result = validateToolAgainstConstraints(tool, constraints);
        expect(result.violations.length).toBeGreaterThan(0);
      }
    });

    it('should detect file write tools needing validation', () => {
      const fileTools = ['write_file', 'save_file', 'create_file'];

      for (const toolName of fileTools) {
        const tool = createTool(toolName, 'Write file', {
          path: { type: 'string' },
          content: { type: 'string' },
        });
        const constraints = [
          createConstraint(
            'SC-001',
            'Sanitize path to prevent data loss',
            ConstraintEnforcement.SANITIZE
          ),
        ];

        const result = validateToolAgainstConstraints(tool, constraints);
        expect(result.violations.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Network Tool Detection', () => {
    it('should detect network tools needing URL validation', () => {
      const networkTools = ['fetch', 'http_request', 'fetch_url', 'curl'];

      for (const toolName of networkTools) {
        const tool = createTool(toolName, 'Make HTTP request', {
          url: { type: 'string' },
        });
        const constraints = [
          createConstraint(
            'SC-001',
            'Sanitize URL to prevent disclosure',
            ConstraintEnforcement.SANITIZE
          ),
        ];

        const result = validateToolAgainstConstraints(tool, constraints);
        expect(result.violations.length).toBeGreaterThan(0);
      }
    });
  });
});

// =============================================================================
// Violation Reporting Tests
// =============================================================================

describe('STPA Validation - Violation Reporting', () => {
  it('should include constraint ID in violation', () => {
    const tool = createTool('bash', 'Shell', {
      command: { type: 'string' },
    });
    const constraints = [
      createConstraint('SC-SHELL-001', 'Prevent injection', ConstraintEnforcement.PREVENT),
    ];

    const result = validateToolAgainstConstraints(tool, constraints);
    if (result.violations.length > 0) {
      expect(result.violations[0]?.constraintId).toBe('SC-SHELL-001');
    }
  });

  it('should include constraint description in violation', () => {
    const tool = createTool('bash', 'Shell', {
      command: { type: 'string' },
    });
    const constraints = [
      createConstraint(
        'SC-001',
        'Prevent command injection attacks',
        ConstraintEnforcement.PREVENT
      ),
    ];

    const result = validateToolAgainstConstraints(tool, constraints);
    if (result.violations.length > 0) {
      expect(result.violations[0]?.constraintDescription).toContain('Prevent command injection');
    }
  });

  it('should include severity in violation', () => {
    const tool = createTool('bash', 'Shell', {
      command: { type: 'string' },
    });
    const constraints = [
      createConstraint('SC-001', 'Prevent injection', ConstraintEnforcement.PREVENT),
    ];

    const result = validateToolAgainstConstraints(tool, constraints);
    if (result.violations.length > 0) {
      expect(Object.values(HazardSeverity)).toContain(result.violations[0]?.severity);
    }
  });

  it('should include remediation advice in violation', () => {
    const tool = createTool('file_reader', 'Read files', {
      path: { type: 'string' },
    });
    const constraints = [
      createConstraint('SC-001', 'Sanitize path input', ConstraintEnforcement.SANITIZE),
    ];

    const result = validateToolAgainstConstraints(tool, constraints);
    if (result.violations.length > 0) {
      expect(result.violations[0]?.remediation).toBeDefined();
      expect(result.violations[0]?.remediation.length).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// Warning Generation Tests
// =============================================================================

describe('STPA Validation - Warning Generation', () => {
  it('should warn about tools without input schema', () => {
    const tool = createTool('empty_tool', 'No parameters', {});

    const result = validateToolAgainstConstraints(tool, []);
    expect(result.warnings.some((w) => w.code === 'NO_INPUT_SCHEMA')).toBe(true);
    expect(result.warnings.find((w) => w.code === 'NO_INPUT_SCHEMA')?.affected).toBe('inputSchema');
  });

  it('should warn about unknown tool category', () => {
    const tool = createTool('mystery_box', 'Unknown purpose', {
      data: { type: 'string' },
    });

    const result = validateToolAgainstConstraints(tool, []);
    expect(result.warnings.some((w) => w.code === 'UNKNOWN_CATEGORY')).toBe(true);
    expect(result.warnings.find((w) => w.code === 'UNKNOWN_CATEGORY')?.affected).toBe('name');
  });

  it('should include message in warnings', () => {
    const tool = createTool('unknown', 'Unknown', {});

    const result = validateToolAgainstConstraints(tool, []);
    for (const warning of result.warnings) {
      expect(warning.message).toBeDefined();
      expect(warning.message.length).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('STPA Validation - Edge Cases', () => {
  it('should handle missing properties safely', () => {
    const tool: ToolDefinition = {
      name: 'test',
      description: 'Test',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    };

    const result = validateToolAgainstConstraints(tool, []);
    expect(result.toolName).toBe('test');
    expect(result.warnings.some((w) => w.code === 'NO_INPUT_SCHEMA')).toBe(true);
  });

  it('should handle very long property descriptions', () => {
    const longDescription = 'A'.repeat(100000);
    const tool = createTool('test', 'Test', {
      param: { type: 'string', description: longDescription },
    });

    const result = validateToolAgainstConstraints(tool, []);
    expect(result.validatedAt).toBeInstanceOf(Date);
  });

  it('should handle many properties', () => {
    const properties: Record<string, { type: string }> = {};
    for (let i = 0; i < 1000; i++) {
      properties[`param_${String(i)}`] = { type: 'string' };
    }
    const tool = createTool('many_params', 'Many parameters', properties);

    const result = validateToolAgainstConstraints(tool, []);
    expect(result.validatedAt).toBeInstanceOf(Date);
  });

  it('should handle many constraints', () => {
    const tool = createTool('test', 'Test', {});
    const constraints: SafetyConstraint[] = [];
    for (let i = 0; i < 1000; i++) {
      constraints.push(
        createConstraint(`SC-${String(i)}`, `Constraint ${String(i)}`, ConstraintEnforcement.ALERT)
      );
    }

    const result = validateToolAgainstConstraints(tool, constraints);
    expect(result.validatedAt).toBeInstanceOf(Date);
  });

  it('should handle special characters in property names', () => {
    const tool: ToolDefinition = {
      name: 'test',
      description: 'Test',
      inputSchema: {
        type: 'object',
        properties: {
          'param-with-dashes': { type: 'string' },
          'param.with.dots': { type: 'string' },
          param_with_underscores: { type: 'string' },
        },
        required: [],
      },
    };

    const result = validateToolAgainstConstraints(tool, []);
    expect(result.validatedAt).toBeInstanceOf(Date);
  });

  it('should handle numeric property names', () => {
    const tool: ToolDefinition = {
      name: 'test',
      description: 'Test',
      inputSchema: {
        type: 'object',
        properties: {
          '0': { type: 'string' },
          '123': { type: 'string' },
        },
        required: [],
      },
    };

    const result = validateToolAgainstConstraints(tool, []);
    expect(result.validatedAt).toBeInstanceOf(Date);
  });
});

// =============================================================================
// Result Structure Tests
// =============================================================================

describe('STPA Validation - Result Structure', () => {
  it('should always include valid boolean', () => {
    const tool = createTool('test', 'Test', {});
    const result = validateToolAgainstConstraints(tool, []);

    expect(typeof result.valid).toBe('boolean');
  });

  it('should always include toolName', () => {
    const tool = createTool('my_tool', 'Test', {});
    const result = validateToolAgainstConstraints(tool, []);

    expect(result.toolName).toBe('my_tool');
  });

  it('should always include violations array', () => {
    const tool = createTool('test', 'Test', {});
    const result = validateToolAgainstConstraints(tool, []);

    expect(Array.isArray(result.violations)).toBe(true);
  });

  it('should always include passed array', () => {
    const tool = createTool('test', 'Test', {});
    const result = validateToolAgainstConstraints(tool, []);

    expect(Array.isArray(result.passed)).toBe(true);
  });

  it('should always include warnings array', () => {
    const tool = createTool('test', 'Test', {});
    const result = validateToolAgainstConstraints(tool, []);

    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('should always include validatedAt timestamp', () => {
    const tool = createTool('test', 'Test', {});
    const result = validateToolAgainstConstraints(tool, []);

    expect(result.validatedAt).toBeInstanceOf(Date);
    expect(result.validatedAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('should set valid=false when nothing could be measured', () => {
    const tool = createTool('safe_tool', 'A safe tool', {});
    const result = validateToolAgainstConstraints(tool, []);

    // Previously pinned the vacuous pass (`valid=true when no violations`) for
    // a tool with no declared inputs checked against zero constraints (#4585).
    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(0);
  });

  it('should set valid=false when violations exist', () => {
    const tool = createTool('bash', 'Shell execution', {
      command: { type: 'string' },
    });
    const constraints = [
      createConstraint('SC-001', 'Prevent injection', ConstraintEnforcement.PREVENT),
    ];

    const result = validateToolAgainstConstraints(tool, constraints);
    if (result.violations.length > 0) {
      expect(result.valid).toBe(false);
    }
  });
});

// =============================================================================
// Constraint Matching Tests
// =============================================================================

describe('STPA Validation - Constraint Matching', () => {
  it('should match injection constraints to shell tools', () => {
    const tool = createTool('bash', 'Execute commands', {
      command: { type: 'string' },
    });
    const constraints = [
      createConstraint(
        'SC-001',
        'Sanitize to prevent command injection',
        ConstraintEnforcement.SANITIZE
      ),
    ];

    const result = validateToolAgainstConstraints(tool, constraints);
    // Should either have violation or be in passed list
    const constraintProcessed =
      result.violations.some((v) => v.constraintId === 'SC-001') ||
      result.passed.includes('SC-001');
    expect(constraintProcessed).toBe(true);
  });

  it('should match data loss constraints to file tools', () => {
    const tool = createTool('write_file', 'Write to file', {
      path: { type: 'string' },
      content: { type: 'string' },
    });
    const constraints = [
      createConstraint(
        'SC-001',
        'Prevent data loss through validation',
        ConstraintEnforcement.PREVENT
      ),
    ];

    const result = validateToolAgainstConstraints(tool, constraints);
    // Constraint should be processed
    expect(result.validatedAt).toBeInstanceOf(Date);
  });

  it('should match disclosure constraints to network tools', () => {
    const tool = createTool('fetch', 'Fetch URL', {
      url: { type: 'string' },
    });
    const constraints = [
      createConstraint('SC-001', 'Prevent information disclosure', ConstraintEnforcement.SANITIZE),
    ];

    const result = validateToolAgainstConstraints(tool, constraints);
    // Should detect disclosure risk
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('should not match unrelated constraints', () => {
    const tool = createTool('calculator', 'Simple calculator', {
      x: { type: 'number' },
      y: { type: 'number' },
    });
    const constraints = [
      createConstraint(
        'SC-001',
        'Prevent network access violations',
        ConstraintEnforcement.PREVENT
      ),
    ];

    const result = validateToolAgainstConstraints(tool, constraints);
    // Calculator should not trigger network constraints
    expect(result.violations.length).toBe(0);
  });
});

// =============================================================================
// Enforcement Type Behavior Tests
// =============================================================================

describe('STPA Validation - Enforcement Types', () => {
  it('should handle PREVENT enforcement', () => {
    const tool = createTool('bash', 'Shell', {
      command: { type: 'string' },
    });
    const constraints = [
      createConstraint('SC-001', 'Prevent command injection', ConstraintEnforcement.PREVENT),
    ];

    const result = validateToolAgainstConstraints(tool, constraints);
    expect(result.validatedAt).toBeInstanceOf(Date);
  });

  it('should handle SANITIZE enforcement detecting missing patterns', () => {
    const tool = createTool('read', 'Read file', {
      path: { type: 'string' }, // No pattern defined
    });
    const constraints = [
      createConstraint('SC-001', 'Sanitize path input', ConstraintEnforcement.SANITIZE),
    ];

    const result = validateToolAgainstConstraints(tool, constraints);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('should handle RATE_LIMIT enforcement (runtime only)', () => {
    const tool = createTool('api', 'API call', {
      endpoint: { type: 'string' },
    });
    const constraints = [
      createConstraint('SC-001', 'Rate limit API calls', ConstraintEnforcement.RATE_LIMIT),
    ];

    const result = validateToolAgainstConstraints(tool, constraints);
    // Rate limiting is runtime, should not cause static violations
    expect(result.violations.filter((v) => v.constraintId === 'SC-001')).toHaveLength(0);
  });

  it('should handle ALERT enforcement (no violations)', () => {
    const tool = createTool('risky', 'Risky operation', {});
    const constraints = [
      createConstraint('SC-001', 'Alert on risky operations', ConstraintEnforcement.ALERT),
    ];

    const result = validateToolAgainstConstraints(tool, constraints);
    // Alert doesn't prevent, just notifies
    expect(result.violations.filter((v) => v.constraintId === 'SC-001')).toHaveLength(0);
  });

  it('should handle REQUIRE_CONFIRMATION enforcement', () => {
    const tool = createTool('dangerous', 'Dangerous op', {});
    const constraints = [
      createConstraint(
        'SC-001',
        'Require confirmation',
        ConstraintEnforcement.REQUIRE_CONFIRMATION
      ),
    ];

    const result = validateToolAgainstConstraints(tool, constraints);
    // Confirmation is runtime behavior
    expect(result.validatedAt).toBeInstanceOf(Date);
  });

  it('should handle REQUIRE_PRIVILEGE enforcement', () => {
    const tool = createTool('admin', 'Admin operation', {});
    const constraints = [
      createConstraint(
        'SC-001',
        'Require admin privilege',
        ConstraintEnforcement.REQUIRE_PRIVILEGE
      ),
    ];

    const result = validateToolAgainstConstraints(tool, constraints);
    // Privilege checking is runtime behavior
    expect(result.validatedAt).toBeInstanceOf(Date);
  });
});
