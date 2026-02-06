/**
 * Tests for Scaffold Command (pure functions)
 *
 * @module cli/scaffold.test
 */

import { describe, it, expect } from 'vitest';
import {
  isValidScaffoldType,
  validateName,
  toPascalCase,
  toCamelCase,
  toScreamingSnake,
} from './scaffold.js';

// ============================================================================
// isValidScaffoldType
// ============================================================================

describe('isValidScaffoldType', () => {
  it('accepts tool', () => {
    expect(isValidScaffoldType('tool')).toBe(true);
  });

  it('accepts expert', () => {
    expect(isValidScaffoldType('expert')).toBe(true);
  });

  it('accepts workflow', () => {
    expect(isValidScaffoldType('workflow')).toBe(true);
  });

  it('accepts command', () => {
    expect(isValidScaffoldType('command')).toBe(true);
  });

  it('rejects unknown type', () => {
    expect(isValidScaffoldType('plugin')).toBe(false);
    expect(isValidScaffoldType('')).toBe(false);
    expect(isValidScaffoldType('Tool')).toBe(false);
  });
});

// ============================================================================
// validateName
// ============================================================================

describe('validateName', () => {
  it('accepts valid kebab-case names', () => {
    expect(validateName('my-tool')).toBeUndefined();
    expect(validateName('code-analysis')).toBeUndefined();
    expect(validateName('a')).toBeUndefined();
    expect(validateName('tool123')).toBeUndefined();
  });

  it('rejects names starting with number', () => {
    expect(validateName('123-tool')).toBeDefined();
  });

  it('rejects names starting with hyphen', () => {
    expect(validateName('-tool')).toBeDefined();
  });

  it('rejects uppercase letters', () => {
    expect(validateName('MyTool')).toBeDefined();
  });

  it('rejects spaces', () => {
    expect(validateName('my tool')).toBeDefined();
  });

  it('rejects underscores', () => {
    expect(validateName('my_tool')).toBeDefined();
  });

  it('rejects names longer than 50 characters', () => {
    const longName = 'a' + '-b'.repeat(25);
    expect(longName.length).toBeGreaterThan(50);
    expect(validateName(longName)).toBeDefined();
  });

  it('accepts names exactly 50 characters', () => {
    const name50 = 'a'.repeat(50);
    expect(validateName(name50)).toBeUndefined();
  });

  it('rejects empty string', () => {
    expect(validateName('')).toBeDefined();
  });
});

// ============================================================================
// toPascalCase
// ============================================================================

describe('toPascalCase', () => {
  it('converts kebab-case to PascalCase', () => {
    expect(toPascalCase('my-tool')).toBe('MyTool');
  });

  it('handles single word', () => {
    expect(toPascalCase('tool')).toBe('Tool');
  });

  it('handles multiple segments', () => {
    expect(toPascalCase('my-cool-tool-name')).toBe('MyCoolToolName');
  });

  it('handles single character', () => {
    expect(toPascalCase('a')).toBe('A');
  });

  it('handles segments with numbers', () => {
    expect(toPascalCase('tool-v2')).toBe('ToolV2');
  });
});

// ============================================================================
// toCamelCase
// ============================================================================

describe('toCamelCase', () => {
  it('converts kebab-case to camelCase', () => {
    expect(toCamelCase('my-tool')).toBe('myTool');
  });

  it('keeps first segment lowercase', () => {
    expect(toCamelCase('code-analysis')).toBe('codeAnalysis');
  });

  it('handles single word', () => {
    expect(toCamelCase('tool')).toBe('tool');
  });

  it('handles multiple segments', () => {
    expect(toCamelCase('my-cool-tool-name')).toBe('myCoolToolName');
  });
});

// ============================================================================
// toScreamingSnake
// ============================================================================

describe('toScreamingSnake', () => {
  it('converts kebab-case to SCREAMING_SNAKE_CASE', () => {
    expect(toScreamingSnake('my-tool')).toBe('MY_TOOL');
  });

  it('handles single word', () => {
    expect(toScreamingSnake('tool')).toBe('TOOL');
  });

  it('handles multiple hyphens', () => {
    expect(toScreamingSnake('my-cool-tool')).toBe('MY_COOL_TOOL');
  });

  it('handles names with numbers', () => {
    expect(toScreamingSnake('tool-v2')).toBe('TOOL_V2');
  });
});
