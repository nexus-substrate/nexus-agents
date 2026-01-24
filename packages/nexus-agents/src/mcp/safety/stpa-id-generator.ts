/**
 * nexus-agents/mcp/safety - STPA ID Generator
 *
 * ID generation utility for STPA analysis components.
 * Extracted to break circular dependency between stpa-helpers and stpa-analysis-helpers.
 *
 * @module mcp/safety/stpa-id-generator
 * (Source: Issue #392 - Circular dependency resolution)
 */

/**
 * Generates a unique ID for hazards, UCAs, and constraints.
 *
 * @param prefix - The prefix for the ID (e.g., 'HAZ', 'UCA', 'SC')
 * @param toolName - The tool name to incorporate
 * @param index - The numeric index
 * @returns A formatted ID string
 */
export function generateId(prefix: string, toolName: string, index: number): string {
  const sanitized = toolName.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
  return `${prefix}-${sanitized}-${String(index).padStart(3, '0')}`;
}
