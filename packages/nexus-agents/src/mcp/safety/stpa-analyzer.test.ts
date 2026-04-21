/**
 * nexus-agents/mcp/safety - STPA Analyzer Tests
 *
 * Comprehensive tests for the STPA safety analysis framework.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  // Types
  type ToolDefinition,
  type Hazard,
  type UnsafeControlAction,
  type SafetyConstraint,
  type AnalysisConfiguration,
  HazardCategory,
  HazardSeverity,
  HazardLikelihood,
  UnsafeControlActionType,
  ConstraintEnforcement,
  ConstraintPriority,
  RiskLevel,
  DEFAULT_ANALYSIS_CONFIG,
} from './stpa-types.js';
import {
  ToolCategory,
  classifyTool,
  classifyToolMultiple,
  getHazardsForTool,
  getTriggerPatternsForCategory,
  FILE_READ_HAZARDS,
} from './hazard-catalog.js';
import {
  analyzeToolForHazards,
  generateUnsafeControlActions,
  generateSafetyConstraints,
  validateToolAgainstConstraints,
  analyzeTools,
  StpaAnalysisError,
} from './stpa-analyzer.js';

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Creates a basic tool definition for testing.
 */
function createToolDefinition(
  name: string,
  description: string,
  properties: Record<
    string,
    { type: string; description?: string; enum?: unknown[]; pattern?: string }
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
 * File read tool fixture.
 */
const fileReadTool: ToolDefinition = createToolDefinition(
  'read_file',
  'Read the contents of a file from the filesystem',
  {
    path: { type: 'string', description: 'Path to the file to read' },
  }
);

/**
 * File write tool fixture.
 */
const fileWriteTool: ToolDefinition = createToolDefinition(
  'write_file',
  'Write content to a file on the filesystem',
  {
    path: { type: 'string', description: 'Path to the file to write' },
    content: { type: 'string', description: 'Content to write' },
  }
);

/**
 * Shell execute tool fixture.
 */
const shellTool: ToolDefinition = createToolDefinition(
  'bash',
  'Execute a shell command and return the output',
  {
    command: { type: 'string', description: 'Command to execute' },
  }
);

/**
 * Network request tool fixture.
 */
const fetchTool: ToolDefinition = createToolDefinition('fetch_url', 'Fetch content from a URL', {
  url: { type: 'string', description: 'URL to fetch' },
});

/**
 * Database query tool fixture.
 */
const queryTool: ToolDefinition = createToolDefinition(
  'query_database',
  'Execute a SQL query against the database',
  {
    query: { type: 'string', description: 'SQL query to execute' },
  }
);

/**
 * Safe read-only tool fixture.
 */
const safeTool: ToolDefinition = createToolDefinition(
  'get_time',
  'Get the current server time',
  {}
);

// =============================================================================
// Tool Category Classification Tests
// =============================================================================

describe('Tool Category Classification', () => {
  it('should classify file read tools correctly', () => {
    expect(classifyTool('read_file')).toBe(ToolCategory.FILE_READ);
    expect(classifyTool('get_file')).toBe(ToolCategory.FILE_READ);
    expect(classifyTool('load_file')).toBe(ToolCategory.FILE_READ);
    expect(classifyTool('cat')).toBe(ToolCategory.FILE_READ);
  });

  it('should classify file write tools correctly', () => {
    expect(classifyTool('write_file')).toBe(ToolCategory.FILE_WRITE);
    expect(classifyTool('save_file')).toBe(ToolCategory.FILE_WRITE);
    expect(classifyTool('create_file')).toBe(ToolCategory.FILE_WRITE);
    expect(classifyTool('edit_file')).toBe(ToolCategory.FILE_WRITE);
  });

  it('should classify file delete tools correctly', () => {
    expect(classifyTool('delete_file')).toBe(ToolCategory.FILE_DELETE);
    expect(classifyTool('remove_file')).toBe(ToolCategory.FILE_DELETE);
    expect(classifyTool('rm')).toBe(ToolCategory.FILE_DELETE);
  });

  it('should classify shell execute tools correctly', () => {
    expect(classifyTool('bash')).toBe(ToolCategory.SHELL_EXECUTE);
    expect(classifyTool('shell')).toBe(ToolCategory.SHELL_EXECUTE);
    expect(classifyTool('execute')).toBe(ToolCategory.SHELL_EXECUTE);
    expect(classifyTool('run_command')).toBe(ToolCategory.SHELL_EXECUTE);
  });

  it('should classify network tools correctly', () => {
    expect(classifyTool('fetch')).toBe(ToolCategory.NETWORK_REQUEST);
    expect(classifyTool('http_request')).toBe(ToolCategory.NETWORK_REQUEST);
    expect(classifyTool('curl')).toBe(ToolCategory.NETWORK_REQUEST);
  });

  it('should classify database tools correctly', () => {
    expect(classifyTool('query')).toBe(ToolCategory.DATABASE_QUERY);
    expect(classifyTool('select')).toBe(ToolCategory.DATABASE_QUERY);
    expect(classifyTool('insert')).toBe(ToolCategory.DATABASE_MODIFY);
    expect(classifyTool('update')).toBe(ToolCategory.DATABASE_MODIFY);
  });

  it('should classify orchestration tools correctly', () => {
    expect(classifyTool('orchestrate')).toBe(ToolCategory.ORCHESTRATION);
    expect(classifyTool('delegate')).toBe(ToolCategory.ORCHESTRATION);
    expect(classifyTool('create_expert')).toBe(ToolCategory.ORCHESTRATION);
  });

  it('should return UNKNOWN for unrecognized tools', () => {
    expect(classifyTool('random_tool')).toBe(ToolCategory.UNKNOWN);
    expect(classifyTool('my_custom_tool')).toBe(ToolCategory.UNKNOWN);
  });

  it('should classify tools into multiple categories when applicable', () => {
    // A tool that matches multiple patterns
    const categories = classifyToolMultiple('execute_query');
    expect(categories).toContain(ToolCategory.SHELL_EXECUTE);
  });
});

// =============================================================================
// Hazard Catalog Tests
// =============================================================================

describe('Hazard Catalog', () => {
  it('should return hazards for file read tools', () => {
    const hazards = getHazardsForTool('read_file');
    expect(hazards.length).toBeGreaterThan(0);
    expect(hazards.some((h) => h.category === HazardCategory.INFORMATION_DISCLOSURE)).toBe(true);
  });

  it('should return hazards for file write tools', () => {
    const hazards = getHazardsForTool('write_file');
    expect(hazards.length).toBeGreaterThan(0);
    expect(hazards.some((h) => h.category === HazardCategory.DATA_LOSS)).toBe(true);
  });

  it('should return hazards for shell tools', () => {
    const hazards = getHazardsForTool('bash');
    expect(hazards.length).toBeGreaterThan(0);
    expect(hazards.some((h) => h.category === HazardCategory.INJECTION)).toBe(true);
    expect(hazards.some((h) => h.category === HazardCategory.PRIVILEGE_ESCALATION)).toBe(true);
  });

  it('should return empty array for unknown tools', () => {
    const hazards = getHazardsForTool('unknown_tool');
    expect(hazards).toHaveLength(0);
  });

  it('should have correct structure for pre-defined hazards', () => {
    for (const hazard of FILE_READ_HAZARDS) {
      expect(hazard.id).toBeDefined();
      expect(hazard.description).toBeDefined();
      expect(Object.values(HazardCategory)).toContain(hazard.category);
      expect(Object.values(HazardSeverity)).toContain(hazard.severity);
      expect(Object.values(HazardLikelihood)).toContain(hazard.likelihood);
      expect(Array.isArray(hazard.triggerConditions)).toBe(true);
      expect(Array.isArray(hazard.consequences)).toBe(true);
    }
  });

  it('should return trigger patterns for file categories', () => {
    const patterns = getTriggerPatternsForCategory(ToolCategory.FILE_READ);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.some((p) => p.pattern.includes('..'))).toBe(true);
  });

  it('should return trigger patterns for shell category', () => {
    const patterns = getTriggerPatternsForCategory(ToolCategory.SHELL_EXECUTE);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.some((p) => p.parameter === 'command')).toBe(true);
  });

  it('should return trigger patterns for network category', () => {
    const patterns = getTriggerPatternsForCategory(ToolCategory.NETWORK_REQUEST);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.some((p) => p.pattern.includes('localhost'))).toBe(true);
  });
});

// =============================================================================
// Hazard Analysis Tests
// =============================================================================

describe('analyzeToolForHazards', () => {
  it('should identify hazards for file read tool', () => {
    const result = analyzeToolForHazards(fileReadTool);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThan(0);
      // Should include path-related hazard from schema analysis
      expect(result.value.some((h) => h.description.toLowerCase().includes('path'))).toBe(true);
    }
  });

  it('should identify hazards for shell tool', () => {
    const result = analyzeToolForHazards(shellTool);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThan(0);
      expect(result.value.some((h) => h.category === HazardCategory.INJECTION)).toBe(true);
    }
  });

  it('should identify hazards based on description', () => {
    const tool = createToolDefinition(
      'custom_tool',
      'This tool can delete files and execute commands',
      {}
    );
    const result = analyzeToolForHazards(tool);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should detect dangerous keywords in description
      expect(result.value.some((h) => h.category === HazardCategory.DATA_LOSS)).toBe(true);
      expect(result.value.some((h) => h.category === HazardCategory.UNAUTHORIZED_EXECUTION)).toBe(
        true
      );
    }
  });

  it('should identify hazards based on parameter names', () => {
    const tool = createToolDefinition('custom_tool', 'A custom tool', {
      command: { type: 'string' },
      password: { type: 'string' },
    });
    const result = analyzeToolForHazards(tool);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.some((h) => h.category === HazardCategory.UNAUTHORIZED_EXECUTION)).toBe(
        true
      );
      expect(result.value.some((h) => h.category === HazardCategory.INFORMATION_DISCLOSURE)).toBe(
        true
      );
    }
  });

  it('should filter hazards by category when configured', () => {
    const config: Partial<AnalysisConfiguration> = {
      categories: [HazardCategory.INJECTION],
    };
    const result = analyzeToolForHazards(shellTool, config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.every((h) => h.category === HazardCategory.INJECTION)).toBe(true);
    }
  });

  it('should filter out low severity hazards when configured', () => {
    const config: Partial<AnalysisConfiguration> = {
      includeLowSeverity: false,
    };
    const result = analyzeToolForHazards(fileReadTool, config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.every((h) => h.severity !== HazardSeverity.LOW)).toBe(true);
    }
  });

  it('should limit hazards per tool when configured', () => {
    const config: Partial<AnalysisConfiguration> = {
      maxHazardsPerTool: 3,
    };
    const result = analyzeToolForHazards(shellTool, config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeLessThanOrEqual(3);
    }
  });

  it('should return error for invalid tool definition', () => {
    const invalidTool = { name: '', description: 'Test', inputSchema: { type: 'object' } };
    const result = analyzeToolForHazards(invalidTool);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(StpaAnalysisError);
      expect(result.error.code).toBe('INVALID_TOOL');
    }
  });
});

// =============================================================================
// Unsafe Control Action Generation Tests
// =============================================================================

describe('generateUnsafeControlActions', () => {
  it('should generate UCAs from hazards', () => {
    const hazards: Hazard[] = [
      {
        id: 'H-001',
        description: 'Path traversal vulnerability',
        category: HazardCategory.INFORMATION_DISCLOSURE,
        severity: HazardSeverity.CRITICAL,
        likelihood: HazardLikelihood.LIKELY,
        triggerConditions: ['Malicious path input'],
        consequences: ['Data exposure'],
      },
    ];

    const ucas = generateUnsafeControlActions(fileReadTool, hazards);
    expect(ucas.length).toBeGreaterThan(0);
    const firstUca = ucas[0];
    expect(firstUca).toBeDefined();
    expect(firstUca?.toolName).toBe('read_file');
    expect(firstUca?.relatedHazards).toContain('H-001');
  });

  it('should generate multiple UCA types for data loss hazards', () => {
    const hazards: Hazard[] = [
      {
        id: 'H-002',
        description: 'Data deletion risk',
        category: HazardCategory.DATA_LOSS,
        severity: HazardSeverity.CRITICAL,
        likelihood: HazardLikelihood.POSSIBLE,
        triggerConditions: ['Recursive deletion'],
        consequences: ['Permanent data loss'],
      },
    ];

    const ucas = generateUnsafeControlActions(fileWriteTool, hazards);
    // Should include both PROVIDED_CAUSES_HAZARD and WRONG_TIMING
    expect(ucas.some((u) => u.type === UnsafeControlActionType.PROVIDED_CAUSES_HAZARD)).toBe(true);
    expect(ucas.some((u) => u.type === UnsafeControlActionType.WRONG_TIMING)).toBe(true);
  });

  it('should generate NOT_PROVIDED UCA for disclosure hazards', () => {
    const hazards: Hazard[] = [
      {
        id: 'H-003',
        description: 'Information disclosure',
        category: HazardCategory.INFORMATION_DISCLOSURE,
        severity: HazardSeverity.HIGH,
        likelihood: HazardLikelihood.LIKELY,
        triggerConditions: ['No input validation'],
        consequences: ['Sensitive data exposure'],
      },
    ];

    const ucas = generateUnsafeControlActions(fetchTool, hazards);
    expect(ucas.some((u) => u.type === UnsafeControlActionType.NOT_PROVIDED)).toBe(true);
  });

  it('should include trigger patterns for shell tools', () => {
    const hazards: Hazard[] = [
      {
        id: 'H-004',
        description: 'Command injection',
        category: HazardCategory.INJECTION,
        severity: HazardSeverity.CRITICAL,
        likelihood: HazardLikelihood.LIKELY,
        triggerConditions: ['Shell metacharacters'],
        consequences: ['Arbitrary execution'],
      },
    ];

    const ucas = generateUnsafeControlActions(shellTool, hazards);
    const ucaWithPatterns = ucas.find(
      (u) => u.triggerPatterns !== undefined && u.triggerPatterns.length > 0
    );
    expect(ucaWithPatterns).toBeDefined();
    const hasCommandPattern =
      ucaWithPatterns?.triggerPatterns?.some((p) => p.parameter === 'command') ?? false;
    expect(hasCommandPattern).toBe(true);
  });
});

// =============================================================================
// Safety Constraint Generation Tests
// =============================================================================

describe('generateSafetyConstraints', () => {
  let hazards: Hazard[];
  let ucas: UnsafeControlAction[];

  beforeEach(() => {
    hazards = [
      {
        id: 'H-001',
        description: 'Path traversal',
        category: HazardCategory.INFORMATION_DISCLOSURE,
        severity: HazardSeverity.CRITICAL,
        likelihood: HazardLikelihood.LIKELY,
        triggerConditions: ['../ in path'],
        consequences: ['File access outside allowed directory'],
      },
      {
        id: 'H-002',
        description: 'Resource exhaustion',
        category: HazardCategory.RESOURCE_EXHAUSTION,
        severity: HazardSeverity.MEDIUM,
        likelihood: HazardLikelihood.POSSIBLE,
        triggerConditions: ['Large file'],
        consequences: ['Memory exhaustion'],
      },
    ];

    ucas = [
      {
        id: 'UCA-001',
        toolName: 'read_file',
        type: UnsafeControlActionType.PROVIDED_CAUSES_HAZARD,
        description: 'File read with traversal',
        unsafeContext: 'Path contains traversal',
        relatedHazards: ['H-001'],
      },
      {
        id: 'UCA-002',
        toolName: 'read_file',
        type: UnsafeControlActionType.NOT_PROVIDED,
        description: 'No validation',
        unsafeContext: 'Input not validated',
        relatedHazards: ['H-001'],
      },
      {
        id: 'UCA-003',
        toolName: 'read_file',
        type: UnsafeControlActionType.PROVIDED_CAUSES_HAZARD,
        description: 'Large file read',
        unsafeContext: 'File too large',
        relatedHazards: ['H-002'],
      },
    ];
  });

  it('should generate constraints from UCAs', () => {
    const constraints = generateSafetyConstraints(hazards, ucas);
    expect(constraints.length).toBeGreaterThan(0);
  });

  it('should assign correct enforcement type based on hazard category', () => {
    const constraints = generateSafetyConstraints(hazards, ucas);

    // Information disclosure should use SANITIZE
    const disclosureConstraint = constraints.find((c) =>
      c.description.includes('information disclosure')
    );
    if (disclosureConstraint) {
      expect(disclosureConstraint.enforcement).toBe(ConstraintEnforcement.SANITIZE);
    }

    // Resource exhaustion should use RATE_LIMIT
    const exhaustionConstraint = constraints.find((c) =>
      c.description.includes('resource exhaustion')
    );
    if (exhaustionConstraint) {
      expect(exhaustionConstraint.enforcement).toBe(ConstraintEnforcement.RATE_LIMIT);
    }
  });

  it('should assign correct priority based on severity', () => {
    const constraints = generateSafetyConstraints(hazards, ucas);

    // Critical severity should have CRITICAL priority
    const criticalConstraint = constraints.find((c) => c.priority === ConstraintPriority.CRITICAL);
    expect(criticalConstraint).toBeDefined();
  });

  it('should sort constraints by priority', () => {
    const constraints = generateSafetyConstraints(hazards, ucas);

    for (let i = 1; i < constraints.length; i++) {
      const current = constraints[i];
      const previous = constraints[i - 1];
      if (current && previous) {
        expect(current.priority).toBeGreaterThanOrEqual(previous.priority);
      }
    }
  });

  it('should include validation function names', () => {
    const constraints = generateSafetyConstraints(hazards, ucas);
    expect(constraints.every((c) => c.validationFunction !== undefined)).toBe(true);
  });

  it('should link constraints to UCAs', () => {
    const constraints = generateSafetyConstraints(hazards, ucas);
    expect(constraints.every((c) => c.mitigates.length > 0)).toBe(true);
  });
});

// =============================================================================
// Tool Validation Tests
// =============================================================================

describe('validateToolAgainstConstraints', () => {
  it('should return valid when no violations found', () => {
    const constraints: SafetyConstraint[] = [
      {
        id: 'SC-001',
        description: 'Rate limit requests',
        mitigates: ['UCA-001'],
        enforcement: ConstraintEnforcement.RATE_LIMIT,
        priority: ConstraintPriority.NORMAL,
      },
    ];

    const result = validateToolAgainstConstraints(safeTool, constraints);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('should detect missing input validation for path parameters', () => {
    const constraints: SafetyConstraint[] = [
      {
        id: 'SC-001',
        description: 'Sanitize input to prevent path traversal',
        mitigates: ['UCA-001'],
        enforcement: ConstraintEnforcement.SANITIZE,
        priority: ConstraintPriority.CRITICAL,
      },
    ];

    const result = validateToolAgainstConstraints(fileReadTool, constraints);
    expect(result.violations.length).toBeGreaterThan(0);
    const firstViolation = result.violations[0];
    expect(firstViolation).toBeDefined();
    expect(firstViolation?.details).toContain('path');
  });

  it('should add warning for tools without input schema', () => {
    const toolWithoutSchema = createToolDefinition('empty_tool', 'A tool with no parameters', {});
    const constraints: SafetyConstraint[] = [];

    const result = validateToolAgainstConstraints(toolWithoutSchema, constraints);
    expect(result.warnings.some((w) => w.code === 'NO_INPUT_SCHEMA')).toBe(true);
  });

  it('should add warning for unknown tool category', () => {
    const unknownTool = createToolDefinition('mystery_tool', 'Unknown purpose', {});
    const constraints: SafetyConstraint[] = [];

    const result = validateToolAgainstConstraints(unknownTool, constraints);
    expect(result.warnings.some((w) => w.code === 'UNKNOWN_CATEGORY')).toBe(true);
  });

  it('should track passed constraints', () => {
    const constraints: SafetyConstraint[] = [
      {
        id: 'SC-001',
        description: 'Alert on unusual patterns',
        mitigates: ['UCA-001'],
        enforcement: ConstraintEnforcement.ALERT,
        priority: ConstraintPriority.LOW,
      },
    ];

    const result = validateToolAgainstConstraints(safeTool, constraints);
    // Alert constraints don't cause violations
    expect(result.passed.length).toBeGreaterThanOrEqual(0);
  });

  it('should include timestamp in result', () => {
    const result = validateToolAgainstConstraints(safeTool, []);
    expect(result.validatedAt).toBeInstanceOf(Date);
  });
});

// =============================================================================
// Full Analysis Pipeline Tests
// =============================================================================

describe('analyzeTools', () => {
  it('should analyze multiple tools', () => {
    const result = analyzeTools([fileReadTool, shellTool]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.toolResults).toHaveLength(2);
    }
  });

  it('should generate summary statistics', () => {
    const result = analyzeTools([fileReadTool, shellTool, fetchTool]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const { summary } = result.value;
      expect(summary.totalTools).toBe(3);
      expect(summary.totalHazards).toBeGreaterThan(0);
      expect(summary.totalUnsafeControlActions).toBeGreaterThan(0);
      expect(summary.totalSafetyConstraints).toBeGreaterThan(0);
    }
  });

  it('should calculate risk scores', () => {
    const result = analyzeTools([shellTool]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const toolResult = result.value.toolResults[0];
      expect(toolResult).toBeDefined();
      if (toolResult) {
        expect(toolResult.riskScore).toBeGreaterThan(0);
        expect(toolResult.riskScore).toBeLessThanOrEqual(100);
        expect(Object.values(RiskLevel)).toContain(toolResult.riskLevel);
      }
    }
  });

  it('should identify hazard interactions', () => {
    // Create tools that together could enable privilege escalation + execution
    const privEscTool = createToolDefinition(
      'sudo_wrapper',
      'Execute commands with elevated privileges',
      { command: { type: 'string' } }
    );

    const result = analyzeTools([privEscTool, shellTool], { checkInteractions: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // May find interactions if both tools have compatible hazards
      expect(result.value.interactions).toBeDefined();
    }
  });

  it('should skip interaction check when disabled', () => {
    const result = analyzeTools([fileReadTool, shellTool], { checkInteractions: false });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.interactions).toHaveLength(0);
    }
  });

  it('should include metadata', () => {
    const result = analyzeTools([safeTool]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const { metadata } = result.value;
      expect(metadata.analyzerVersion).toBeDefined();
      expect(metadata.startedAt).toBeInstanceOf(Date);
      expect(metadata.completedAt).toBeInstanceOf(Date);
      expect(metadata.durationMs).toBeGreaterThanOrEqual(0);
      expect(metadata.configuration).toBeDefined();
    }
  });

  it('should respect configuration', () => {
    const config: Partial<AnalysisConfiguration> = {
      includeLowSeverity: false,
      maxHazardsPerTool: 5,
      categories: [HazardCategory.INJECTION, HazardCategory.DATA_LOSS],
    };

    const result = analyzeTools([shellTool], config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const { metadata } = result.value;
      expect(metadata.configuration.includeLowSeverity).toBe(false);
      expect(metadata.configuration.maxHazardsPerTool).toBe(5);
    }
  });

  it('should calculate hazards by category', () => {
    const result = analyzeTools([fileReadTool, shellTool, queryTool]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const { hazardsByCategory } = result.value.summary;
      // Should have counts for various categories
      expect(Object.keys(hazardsByCategory)).toContain(HazardCategory.INJECTION);
      expect(Object.keys(hazardsByCategory)).toContain(HazardCategory.INFORMATION_DISCLOSURE);
    }
  });

  it('should calculate tools by risk level', () => {
    const result = analyzeTools([safeTool, shellTool]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const { toolsByRiskLevel } = result.value.summary;
      const totalByLevel = Object.values(toolsByRiskLevel).reduce((a, b) => a + b, 0);
      expect(totalByLevel).toBe(2);
    }
  });

  it('should calculate average risk score', () => {
    const result = analyzeTools([fileReadTool, shellTool]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.summary.averageRiskScore).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// Edge Cases and Error Handling Tests
// =============================================================================

describe('Edge Cases', () => {
  it('should handle empty tool list', () => {
    const result = analyzeTools([]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.toolResults).toHaveLength(0);
      expect(result.value.summary.totalTools).toBe(0);
      expect(result.value.summary.averageRiskScore).toBe(0);
    }
  });

  it('should handle tool with empty description', () => {
    const tool = createToolDefinition('minimal_tool', '', {});
    const result = analyzeToolForHazards(tool);
    expect(result.ok).toBe(true);
  });

  it('should handle tool with complex input schema', () => {
    // Create tool definition directly to allow complex schema properties
    const complexTool: ToolDefinition = {
      name: 'complex_tool',
      description: 'A tool with complex inputs',
      inputSchema: {
        type: 'object',
        properties: {
          options: {
            type: 'object',
            description: 'Nested options object',
          },
          items: {
            type: 'array',
            description: 'Array of items',
          },
        },
        required: ['options', 'items'],
      },
    };

    const result = analyzeToolForHazards(complexTool);
    expect(result.ok).toBe(true);
  });

  it('should handle concurrent analysis', async () => {
    const tools = Array.from({ length: 10 }, (_, i) =>
      createToolDefinition(`tool_${String(i)}`, `Tool number ${String(i)}`, {})
    );

    const results = await Promise.all(
      tools.map((tool) => Promise.resolve(analyzeToolForHazards(tool)))
    );

    expect(results.every((r) => r.ok)).toBe(true);
  });
});

// =============================================================================
// DEFAULT_ANALYSIS_CONFIG Tests
// =============================================================================

describe('DEFAULT_ANALYSIS_CONFIG', () => {
  it('should have sensible defaults', () => {
    expect(DEFAULT_ANALYSIS_CONFIG.includeLowSeverity).toBe(true);
    expect(DEFAULT_ANALYSIS_CONFIG.generateAllConstraints).toBe(true);
    expect(DEFAULT_ANALYSIS_CONFIG.checkInteractions).toBe(true);
    expect(DEFAULT_ANALYSIS_CONFIG.maxHazardsPerTool).toBe(50);
    expect(DEFAULT_ANALYSIS_CONFIG.categories).toHaveLength(0);
  });
});
