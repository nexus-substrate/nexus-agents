/**
 * Tests for STPA Analysis Helpers
 * @module mcp/safety/stpa-analysis-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { ToolDefinition } from './stpa-types.js';
import { HazardCategory, HazardSeverity, HazardLikelihood } from './stpa-types.js';
import { analyzeDescription, analyzeInputSchema } from './stpa-analysis-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeTool(
  name: string,
  description: string,
  properties?: Record<string, unknown>
): ToolDefinition {
  return {
    name,
    description,
    inputSchema: { type: 'object', properties: properties ?? {} },
  } as ToolDefinition;
}

// ============================================================================
// analyzeDescription
// ============================================================================

describe('analyzeDescription', () => {
  it('detects delete-related hazards', () => {
    const tool = makeTool('remove_file', 'Delete a file from the filesystem');
    const hazards = analyzeDescription(tool);
    expect(hazards.length).toBeGreaterThanOrEqual(1);
    const deleteHazard = hazards.find((h) => h.category === HazardCategory.DATA_LOSS);
    expect(deleteHazard).toBeDefined();
    expect(deleteHazard?.severity).toBe(HazardSeverity.HIGH);
    expect(deleteHazard?.likelihood).toBe(HazardLikelihood.POSSIBLE);
  });

  it('detects execution-related hazards', () => {
    const tool = makeTool('run_cmd', 'Execute a shell command');
    const hazards = analyzeDescription(tool);
    const execHazard = hazards.find((h) => h.category === HazardCategory.UNAUTHORIZED_EXECUTION);
    expect(execHazard).toBeDefined();
    expect(execHazard?.severity).toBe(HazardSeverity.CRITICAL);
    expect(execHazard?.likelihood).toBe(HazardLikelihood.LIKELY);
  });

  it('detects modification-related hazards', () => {
    const tool = makeTool('update_record', 'Modify a database record');
    const hazards = analyzeDescription(tool);
    const modHazard = hazards.find((h) => h.category === HazardCategory.INTEGRITY_VIOLATION);
    expect(modHazard).toBeDefined();
    expect(modHazard?.severity).toBe(HazardSeverity.MEDIUM);
  });

  it('detects credential-related hazards', () => {
    const tool = makeTool('get_secret', 'Retrieve password from vault');
    const hazards = analyzeDescription(tool);
    const credHazard = hazards.find((h) => h.category === HazardCategory.INFORMATION_DISCLOSURE);
    expect(credHazard).toBeDefined();
    expect(credHazard?.severity).toBe(HazardSeverity.CRITICAL);
  });

  it('detects network-related hazards', () => {
    const tool = makeTool('call_api', 'Fetch data from external API endpoint');
    const hazards = analyzeDescription(tool);
    const netHazard = hazards.find((h) => h.category === HazardCategory.INFORMATION_DISCLOSURE);
    expect(netHazard).toBeDefined();
    expect(netHazard?.severity).toBe(HazardSeverity.HIGH);
  });

  it('returns empty array for safe descriptions', () => {
    const tool = makeTool('say_hello', 'Returns a greeting message');
    const hazards = analyzeDescription(tool);
    expect(hazards).toHaveLength(0);
  });

  it('detects multiple hazards in one description', () => {
    const tool = makeTool('dangerous', 'Execute command to delete and fetch from api');
    const hazards = analyzeDescription(tool);
    // Should match: execut, delet, api/fetch
    expect(hazards.length).toBeGreaterThanOrEqual(3);
  });

  it('generates correct hazard IDs', () => {
    const tool = makeTool('my_tool', 'Delete something');
    const hazards = analyzeDescription(tool);
    expect(hazards[0]?.id).toContain('H-DESC');
    expect(hazards[0]?.id).toContain('MY_TOOL');
  });

  it('includes trigger conditions and consequences', () => {
    const tool = makeTool('rm', 'Delete all files');
    const hazards = analyzeDescription(tool);
    expect(hazards[0]?.triggerConditions).toContain('Identified from tool description');
    expect(hazards[0]?.consequences.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// analyzeInputSchema
// ============================================================================

describe('analyzeInputSchema', () => {
  it('detects file path parameters', () => {
    const tool = makeTool('read', 'Read data', { filePath: { type: 'string' } });
    const hazards = analyzeInputSchema(tool);
    expect(hazards.length).toBeGreaterThanOrEqual(1);
    const pathHazard = hazards.find((h) => h.category === HazardCategory.INFORMATION_DISCLOSURE);
    expect(pathHazard).toBeDefined();
    expect(pathHazard?.description).toContain('filePath');
  });

  it('detects command parameters', () => {
    const tool = makeTool('exec', 'Run', { command: { type: 'string' } });
    const hazards = analyzeInputSchema(tool);
    const cmdHazard = hazards.find((h) => h.category === HazardCategory.UNAUTHORIZED_EXECUTION);
    expect(cmdHazard).toBeDefined();
    expect(cmdHazard?.severity).toBe(HazardSeverity.CRITICAL);
  });

  it('detects URL parameters', () => {
    const tool = makeTool('fetch', 'Get', { url: { type: 'string' } });
    const hazards = analyzeInputSchema(tool);
    const urlHazard = hazards.find((h) => h.category === HazardCategory.INFORMATION_DISCLOSURE);
    expect(urlHazard).toBeDefined();
  });

  it('detects SQL/query parameters', () => {
    const tool = makeTool('db', 'Query', { sqlQuery: { type: 'string' } });
    const hazards = analyzeInputSchema(tool);
    const sqlHazard = hazards.find((h) => h.category === HazardCategory.INJECTION);
    expect(sqlHazard).toBeDefined();
    expect(sqlHazard?.severity).toBe(HazardSeverity.CRITICAL);
  });

  it('detects secret/token parameters', () => {
    const tool = makeTool('auth', 'Login', { apiKey: { type: 'string' } });
    const hazards = analyzeInputSchema(tool);
    const secretHazard = hazards.find((h) => h.category === HazardCategory.INFORMATION_DISCLOSURE);
    expect(secretHazard).toBeDefined();
  });

  it('returns empty for safe parameters', () => {
    const tool = makeTool('greet', 'Hello', { name: { type: 'string' }, age: { type: 'number' } });
    const hazards = analyzeInputSchema(tool);
    expect(hazards).toHaveLength(0);
  });

  it('returns empty when no properties', () => {
    const tool = {
      name: 'simple',
      description: 'Simple',
      inputSchema: { type: 'object' },
    } as ToolDefinition;
    const hazards = analyzeInputSchema(tool);
    expect(hazards).toHaveLength(0);
  });

  it('generates one hazard per parameter', () => {
    // 'command' matches the command pattern - only one hazard even if multiple patterns match
    const tool = makeTool('exec', 'Run', {
      command: { type: 'string' },
      dir: { type: 'string' },
    });
    const hazards = analyzeInputSchema(tool);
    // command -> 1 hazard, dir -> 1 hazard
    expect(hazards).toHaveLength(2);
  });

  it('generates correct hazard IDs for params', () => {
    const tool = makeTool('my_tool', 'Do stuff', { filePath: { type: 'string' } });
    const hazards = analyzeInputSchema(tool);
    expect(hazards[0]?.id).toContain('H-PARAM');
    expect(hazards[0]?.id).toContain('MY_TOOL');
  });
});
