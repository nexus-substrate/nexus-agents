/**
 * Tests for tool-categories.ts
 *
 * Covers tool classification by name patterns, category enum values,
 * single and multi-category classification, and edge cases.
 */

import { describe, it, expect } from 'vitest';
import { ToolCategory, classifyTool, classifyToolMultiple } from './tool-categories.js';

// ============================================================================
// ToolCategory enum
// ============================================================================

describe('ToolCategory', () => {
  it('has all expected categories', () => {
    expect(ToolCategory.FILE_READ).toBe('file_read');
    expect(ToolCategory.FILE_WRITE).toBe('file_write');
    expect(ToolCategory.FILE_DELETE).toBe('file_delete');
    expect(ToolCategory.SHELL_EXECUTE).toBe('shell_execute');
    expect(ToolCategory.NETWORK_REQUEST).toBe('network_request');
    expect(ToolCategory.DATABASE_QUERY).toBe('database_query');
    expect(ToolCategory.DATABASE_MODIFY).toBe('database_modify');
    expect(ToolCategory.AUTHENTICATION).toBe('authentication');
    expect(ToolCategory.ORCHESTRATION).toBe('orchestration');
    expect(ToolCategory.MEMORY).toBe('memory');
    expect(ToolCategory.UNKNOWN).toBe('unknown');
  });
});

// ============================================================================
// classifyTool — file operations
// ============================================================================

describe('classifyTool - file operations', () => {
  it('classifies read_file as FILE_READ', () => {
    expect(classifyTool('read_file')).toBe(ToolCategory.FILE_READ);
  });

  it('classifies readfile (no underscore) as FILE_READ', () => {
    expect(classifyTool('readfile')).toBe(ToolCategory.FILE_READ);
  });

  it('classifies get_file as FILE_READ', () => {
    expect(classifyTool('get_file')).toBe(ToolCategory.FILE_READ);
  });

  it('classifies cat as FILE_READ', () => {
    expect(classifyTool('cat')).toBe(ToolCategory.FILE_READ);
  });

  it('classifies write_file as FILE_WRITE', () => {
    expect(classifyTool('write_file')).toBe(ToolCategory.FILE_WRITE);
  });

  it('classifies create_file as FILE_WRITE', () => {
    expect(classifyTool('create_file')).toBe(ToolCategory.FILE_WRITE);
  });

  it('classifies edit_file as FILE_WRITE', () => {
    expect(classifyTool('edit_file')).toBe(ToolCategory.FILE_WRITE);
  });

  it('classifies delete_file as FILE_DELETE', () => {
    expect(classifyTool('delete_file')).toBe(ToolCategory.FILE_DELETE);
  });

  it('classifies rm as FILE_DELETE', () => {
    expect(classifyTool('rm')).toBe(ToolCategory.FILE_DELETE);
  });
});

// ============================================================================
// classifyTool — shell execution
// ============================================================================

describe('classifyTool - shell execution', () => {
  it('classifies bash as SHELL_EXECUTE', () => {
    expect(classifyTool('bash')).toBe(ToolCategory.SHELL_EXECUTE);
  });

  it('classifies shell as SHELL_EXECUTE', () => {
    expect(classifyTool('shell')).toBe(ToolCategory.SHELL_EXECUTE);
  });

  it('classifies execute as SHELL_EXECUTE', () => {
    expect(classifyTool('execute')).toBe(ToolCategory.SHELL_EXECUTE);
  });

  it('classifies run_command as SHELL_EXECUTE', () => {
    expect(classifyTool('run_command')).toBe(ToolCategory.SHELL_EXECUTE);
  });
});

// ============================================================================
// classifyTool — network
// ============================================================================

describe('classifyTool - network', () => {
  it('classifies fetch as NETWORK_REQUEST', () => {
    expect(classifyTool('fetch')).toBe(ToolCategory.NETWORK_REQUEST);
  });

  it('classifies http_get as NETWORK_REQUEST', () => {
    expect(classifyTool('http_get')).toBe(ToolCategory.NETWORK_REQUEST);
  });

  it('classifies curl as NETWORK_REQUEST', () => {
    expect(classifyTool('curl')).toBe(ToolCategory.NETWORK_REQUEST);
  });

  it('classifies api_call as NETWORK_REQUEST', () => {
    expect(classifyTool('api_call')).toBe(ToolCategory.NETWORK_REQUEST);
  });
});

// ============================================================================
// classifyTool — database
// ============================================================================

describe('classifyTool - database', () => {
  it('classifies query as DATABASE_QUERY', () => {
    expect(classifyTool('query')).toBe(ToolCategory.DATABASE_QUERY);
  });

  it('classifies search as DATABASE_QUERY', () => {
    expect(classifyTool('search')).toBe(ToolCategory.DATABASE_QUERY);
  });

  it('classifies insert as DATABASE_MODIFY', () => {
    expect(classifyTool('insert')).toBe(ToolCategory.DATABASE_MODIFY);
  });

  it('classifies update as DATABASE_MODIFY', () => {
    expect(classifyTool('update')).toBe(ToolCategory.DATABASE_MODIFY);
  });

  it('classifies drop as DATABASE_MODIFY', () => {
    expect(classifyTool('drop')).toBe(ToolCategory.DATABASE_MODIFY);
  });
});

// ============================================================================
// classifyTool — auth, orchestration, memory
// ============================================================================

describe('classifyTool - other categories', () => {
  it('classifies auth as AUTHENTICATION', () => {
    expect(classifyTool('auth')).toBe(ToolCategory.AUTHENTICATION);
  });

  it('classifies login as AUTHENTICATION', () => {
    expect(classifyTool('login')).toBe(ToolCategory.AUTHENTICATION);
  });

  it('classifies orchestrate as ORCHESTRATION', () => {
    expect(classifyTool('orchestrate')).toBe(ToolCategory.ORCHESTRATION);
  });

  it('classifies create_expert as ORCHESTRATION', () => {
    expect(classifyTool('create_expert')).toBe(ToolCategory.ORCHESTRATION);
  });

  it('classifies run_workflow as ORCHESTRATION', () => {
    expect(classifyTool('run_workflow')).toBe(ToolCategory.ORCHESTRATION);
  });

  it('classifies memory as MEMORY', () => {
    expect(classifyTool('memory')).toBe(ToolCategory.MEMORY);
  });

  it('classifies store as MEMORY', () => {
    expect(classifyTool('store')).toBe(ToolCategory.MEMORY);
  });

  it('classifies cache as MEMORY', () => {
    expect(classifyTool('cache')).toBe(ToolCategory.MEMORY);
  });
});

// ============================================================================
// classifyTool — case insensitivity and unknown
// ============================================================================

describe('classifyTool - edge cases', () => {
  it('is case-insensitive', () => {
    expect(classifyTool('READ_FILE')).toBe(ToolCategory.FILE_READ);
    expect(classifyTool('Bash')).toBe(ToolCategory.SHELL_EXECUTE);
  });

  it('returns UNKNOWN for unrecognized tools', () => {
    expect(classifyTool('foobar')).toBe(ToolCategory.UNKNOWN);
    expect(classifyTool('')).toBe(ToolCategory.UNKNOWN);
  });
});

// ============================================================================
// classifyToolMultiple
// ============================================================================

describe('classifyToolMultiple', () => {
  it('returns single category for standard tool', () => {
    const categories = classifyToolMultiple('read_file');
    expect(categories).toContain(ToolCategory.FILE_READ);
  });

  it('returns UNKNOWN for unrecognized tools', () => {
    const categories = classifyToolMultiple('unknown_tool');
    expect(categories).toEqual([ToolCategory.UNKNOWN]);
  });

  it('returns at least one category', () => {
    expect(classifyToolMultiple('anything').length).toBeGreaterThanOrEqual(1);
  });

  it('returns non-empty array for known tools', () => {
    expect(classifyToolMultiple('bash').length).toBeGreaterThanOrEqual(1);
  });
});
