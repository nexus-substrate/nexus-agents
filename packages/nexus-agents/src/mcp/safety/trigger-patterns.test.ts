/**
 * Tests for trigger-patterns.ts
 *
 * Covers PATH_TRIGGER_PATTERNS, SHELL_TRIGGER_PATTERNS,
 * NETWORK_TRIGGER_PATTERNS, and getTriggerPatternsForCategory.
 */

import { describe, it, expect } from 'vitest';
import {
  PATH_TRIGGER_PATTERNS,
  SHELL_TRIGGER_PATTERNS,
  NETWORK_TRIGGER_PATTERNS,
  getTriggerPatternsForCategory,
} from './trigger-patterns.js';
import { ToolCategory } from './tool-categories.js';

// ============================================================================
// PATH_TRIGGER_PATTERNS
// ============================================================================

describe('PATH_TRIGGER_PATTERNS', () => {
  it('is a non-empty array', () => {
    expect(PATH_TRIGGER_PATTERNS.length).toBeGreaterThan(0);
  });

  it('detects path traversal via ".."', () => {
    const traversal = PATH_TRIGGER_PATTERNS.filter((p) => p.pattern === '..');
    expect(traversal.length).toBeGreaterThanOrEqual(1);
    expect(traversal[0]?.matchType).toBe('contains');
  });

  it('covers path, file_path, and filePath parameters', () => {
    const params = new Set(PATH_TRIGGER_PATTERNS.map((p) => p.parameter));
    expect(params.has('path')).toBe(true);
    expect(params.has('file_path')).toBe(true);
    expect(params.has('filePath')).toBe(true);
  });

  it('blocks system directories', () => {
    const systemDirs = PATH_TRIGGER_PATTERNS.filter((p) => p.matchType === 'startsWith');
    const patterns = systemDirs.map((p) => p.pattern);
    expect(patterns).toContain('/etc');
    expect(patterns).toContain('/proc');
    expect(patterns).toContain('/dev');
    expect(patterns).toContain('/root');
  });

  it('all entries have reason field', () => {
    for (const pattern of PATH_TRIGGER_PATTERNS) {
      expect(pattern.reason).toBeTruthy();
    }
  });
});

// ============================================================================
// SHELL_TRIGGER_PATTERNS
// ============================================================================

describe('SHELL_TRIGGER_PATTERNS', () => {
  it('is a non-empty array', () => {
    expect(SHELL_TRIGGER_PATTERNS.length).toBeGreaterThan(0);
  });

  it('detects command chaining characters', () => {
    const chaining = SHELL_TRIGGER_PATTERNS.filter(
      (p) => p.matchType === 'contains' && (p.pattern === ';' || p.pattern === '|')
    );
    expect(chaining.length).toBe(2);
  });

  it('detects command substitution', () => {
    const substitution = SHELL_TRIGGER_PATTERNS.filter(
      (p) => p.pattern === '`' || p.pattern === '$('
    );
    expect(substitution.length).toBe(2);
  });

  it('detects dangerous commands via regex', () => {
    const regexPatterns = SHELL_TRIGGER_PATTERNS.filter((p) => p.matchType === 'regex');
    expect(regexPatterns.length).toBeGreaterThanOrEqual(3);
    const patterns = regexPatterns.map((p) => p.pattern);
    expect(patterns.some((p) => p.includes('rm'))).toBe(true);
    expect(patterns.some((p) => p.includes('sudo'))).toBe(true);
    expect(patterns.some((p) => p.includes('curl'))).toBe(true);
  });

  it('all entries target command parameter', () => {
    for (const pattern of SHELL_TRIGGER_PATTERNS) {
      expect(pattern.parameter).toBe('command');
    }
  });
});

// ============================================================================
// NETWORK_TRIGGER_PATTERNS
// ============================================================================

describe('NETWORK_TRIGGER_PATTERNS', () => {
  it('is a non-empty array', () => {
    expect(NETWORK_TRIGGER_PATTERNS.length).toBeGreaterThan(0);
  });

  it('detects file:// protocol', () => {
    const fileProto = NETWORK_TRIGGER_PATTERNS.find((p) => p.pattern === 'file://');
    expect(fileProto).toBeDefined();
    expect(fileProto?.matchType).toBe('startsWith');
  });

  it('detects cloud metadata endpoint', () => {
    const metadata = NETWORK_TRIGGER_PATTERNS.find((p) => p.pattern.includes('169.254'));
    expect(metadata).toBeDefined();
    expect(metadata?.reason).toContain('metadata');
  });

  it('detects SSRF via localhost and loopback', () => {
    const ssrf = NETWORK_TRIGGER_PATTERNS.filter(
      (p) => p.pattern.includes('localhost') || p.pattern.includes('127.0.0.1')
    );
    expect(ssrf.length).toBe(2);
  });

  it('detects private network ranges via regex', () => {
    const privateNet = NETWORK_TRIGGER_PATTERNS.filter((p) => p.matchType === 'regex');
    expect(privateNet.length).toBeGreaterThanOrEqual(2);
    const patterns = privateNet.map((p) => p.pattern);
    expect(patterns.some((p) => p.includes('10\\.'))).toBe(true);
    expect(patterns.some((p) => p.includes('192\\.168\\.'))).toBe(true);
  });

  it('all entries target url parameter', () => {
    for (const pattern of NETWORK_TRIGGER_PATTERNS) {
      expect(pattern.parameter).toBe('url');
    }
  });
});

// ============================================================================
// getTriggerPatternsForCategory
// ============================================================================

describe('getTriggerPatternsForCategory', () => {
  it('returns path patterns for FILE_READ', () => {
    expect(getTriggerPatternsForCategory(ToolCategory.FILE_READ)).toBe(PATH_TRIGGER_PATTERNS);
  });

  it('returns path patterns for FILE_WRITE', () => {
    expect(getTriggerPatternsForCategory(ToolCategory.FILE_WRITE)).toBe(PATH_TRIGGER_PATTERNS);
  });

  it('returns path patterns for FILE_DELETE', () => {
    expect(getTriggerPatternsForCategory(ToolCategory.FILE_DELETE)).toBe(PATH_TRIGGER_PATTERNS);
  });

  it('returns shell patterns for SHELL_EXECUTE', () => {
    expect(getTriggerPatternsForCategory(ToolCategory.SHELL_EXECUTE)).toBe(SHELL_TRIGGER_PATTERNS);
  });

  it('returns network patterns for NETWORK_REQUEST', () => {
    expect(getTriggerPatternsForCategory(ToolCategory.NETWORK_REQUEST)).toBe(
      NETWORK_TRIGGER_PATTERNS
    );
  });

  it('returns empty array for DATABASE_QUERY', () => {
    expect(getTriggerPatternsForCategory(ToolCategory.DATABASE_QUERY)).toEqual([]);
  });

  it('returns empty array for ORCHESTRATION', () => {
    expect(getTriggerPatternsForCategory(ToolCategory.ORCHESTRATION)).toEqual([]);
  });

  it('returns empty array for UNKNOWN', () => {
    expect(getTriggerPatternsForCategory(ToolCategory.UNKNOWN)).toEqual([]);
  });
});
