/**
 * Tests for command-allowlist.ts
 *
 * Covers command validation against allow/deny lists, argument pattern
 * checking, command extraction, category classification, and edge cases.
 */

import { describe, it, expect } from 'vitest';
import {
  COMMAND_CATEGORIES,
  ALLOWED_COMMANDS,
  DENIED_COMMANDS,
  DENIED_ARG_PATTERNS,
  validateCommand,
  validateArgs,
  isCommandInCategory,
  getCommandCategory,
} from './command-allowlist.js';

// ============================================================================
// Constants
// ============================================================================

describe('COMMAND_CATEGORIES', () => {
  it('has all expected categories', () => {
    expect(COMMAND_CATEGORIES.packageManagers).toBeDefined();
    expect(COMMAND_CATEGORIES.versionControl).toBeDefined();
    expect(COMMAND_CATEGORIES.github).toBeDefined();
    expect(COMMAND_CATEGORIES.node).toBeDefined();
    expect(COMMAND_CATEGORIES.buildTools).toBeDefined();
    expect(COMMAND_CATEGORIES.testing).toBeDefined();
    expect(COMMAND_CATEGORIES.linting).toBeDefined();
    expect(COMMAND_CATEGORIES.docs).toBeDefined();
    expect(COMMAND_CATEGORIES.shellUtils).toBeDefined();
  });
});

describe('ALLOWED_COMMANDS', () => {
  it('includes commands from all categories', () => {
    expect(ALLOWED_COMMANDS).toContain('pnpm');
    expect(ALLOWED_COMMANDS).toContain('git');
    expect(ALLOWED_COMMANDS).toContain('node');
    expect(ALLOWED_COMMANDS).toContain('vitest');
    expect(ALLOWED_COMMANDS).toContain('eslint');
  });

  it('is a flat array', () => {
    expect(Array.isArray(ALLOWED_COMMANDS)).toBe(true);
    for (const cmd of ALLOWED_COMMANDS) {
      expect(typeof cmd).toBe('string');
    }
  });
});

describe('DENIED_COMMANDS', () => {
  it('includes dangerous commands', () => {
    expect(DENIED_COMMANDS).toContain('rm');
    expect(DENIED_COMMANDS).toContain('sudo');
    expect(DENIED_COMMANDS).toContain('curl');
    expect(DENIED_COMMANDS).toContain('kill');
    expect(DENIED_COMMANDS).toContain('reboot');
  });
});

// ============================================================================
// validateCommand — allowlist
// ============================================================================

describe('validateCommand - allowed commands', () => {
  it('allows git', () => {
    expect(validateCommand('git', ALLOWED_COMMANDS)).toBeNull();
  });

  it('allows pnpm', () => {
    expect(validateCommand('pnpm', ALLOWED_COMMANDS)).toBeNull();
  });

  it('allows node', () => {
    expect(validateCommand('node', ALLOWED_COMMANDS)).toBeNull();
  });

  it('allows vitest', () => {
    expect(validateCommand('vitest', ALLOWED_COMMANDS)).toBeNull();
  });

  it('denies unlisted command', () => {
    const result = validateCommand('python', ALLOWED_COMMANDS);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('command');
    expect(result?.reason).toContain('not in the allowlist');
  });
});

// ============================================================================
// validateCommand — deny list
// ============================================================================

describe('validateCommand - denied commands', () => {
  it('denies rm', () => {
    const result = validateCommand('rm', ALLOWED_COMMANDS);
    expect(result).not.toBeNull();
    expect(result?.reason).toContain('explicitly denied');
  });

  it('denies sudo', () => {
    const result = validateCommand('sudo', ALLOWED_COMMANDS);
    expect(result).not.toBeNull();
    expect(result?.reason).toContain('explicitly denied');
  });

  it('denies curl', () => {
    const result = validateCommand('curl', ALLOWED_COMMANDS);
    expect(result).not.toBeNull();
    expect(result?.reason).toContain('explicitly denied');
  });

  it('deny list takes priority over empty allowlist', () => {
    const result = validateCommand('rm', []);
    expect(result).not.toBeNull();
    expect(result?.reason).toContain('explicitly denied');
  });
});

// ============================================================================
// validateCommand — path handling
// ============================================================================

describe('validateCommand - path handling', () => {
  it('denies commands with forward slash paths', () => {
    const result = validateCommand('/usr/bin/git', ALLOWED_COMMANDS);
    expect(result).not.toBeNull();
    expect(result?.reason).toContain('path separators');
  });

  it('denies commands with backslash paths', () => {
    const result = validateCommand('C:\\Windows\\cmd', ALLOWED_COMMANDS);
    expect(result).not.toBeNull();
    expect(result?.reason).toContain('path separators');
  });

  it('denies relative path commands', () => {
    const result = validateCommand('./malicious', ALLOWED_COMMANDS);
    expect(result).not.toBeNull();
    expect(result?.reason).toContain('path separators');
  });
});

// ============================================================================
// validateCommand — custom allowlist
// ============================================================================

describe('validateCommand - custom allowlist', () => {
  it('uses custom allowlist when provided', () => {
    expect(validateCommand('git', ['git'])).toBeNull();
    const result = validateCommand('pnpm', ['git']);
    expect(result).not.toBeNull();
    expect(result?.reason).toContain('not in the allowlist');
  });

  it('falls back to default allowlist when empty', () => {
    expect(validateCommand('git', [])).toBeNull();
  });
});

// ============================================================================
// validateArgs
// ============================================================================

describe('validateArgs', () => {
  it('allows safe arguments', () => {
    expect(validateArgs(['--version'])).toBeNull();
    expect(validateArgs(['-m', 'commit message'])).toBeNull();
    expect(validateArgs(['install', 'lodash'])).toBeNull();
  });

  it('denies semicolons (command chaining)', () => {
    const result = validateArgs(['; rm -rf /']);
    expect(result).not.toBeNull();
    expect(result?.reason).toContain('denied pattern');
  });

  it('denies pipe characters', () => {
    const result = validateArgs(['| cat /etc/passwd']);
    expect(result).not.toBeNull();
  });

  it('denies ampersand (backgrounding/chaining)', () => {
    const result = validateArgs(['malicious&']);
    expect(result).not.toBeNull();
  });

  it('denies backticks (subshell)', () => {
    const result = validateArgs(['`whoami`']);
    expect(result).not.toBeNull();
  });

  it('denies dollar-paren (command substitution)', () => {
    const result = validateArgs(['$(whoami)']);
    expect(result).not.toBeNull();
  });

  it('denies dollar-brace (shell expansion)', () => {
    const result = validateArgs(['${HOME}']);
    expect(result).not.toBeNull();
  });

  it('denies redirection', () => {
    const result = validateArgs(['> /etc/passwd']);
    expect(result).not.toBeNull();
  });

  it('denies here-doc', () => {
    const result = validateArgs(['<<<input']);
    expect(result).not.toBeNull();
  });

  it('returns null for empty args', () => {
    expect(validateArgs([])).toBeNull();
  });

  it('checks all args and returns first violation', () => {
    const result = validateArgs(['safe', '; evil', '| also evil']);
    expect(result).not.toBeNull();
    expect(result?.denied).toBe('; evil');
  });
});

// ============================================================================
// isCommandInCategory
// ============================================================================

describe('isCommandInCategory', () => {
  it('identifies git as versionControl', () => {
    expect(isCommandInCategory('git', 'versionControl')).toBe(true);
  });

  it('identifies pnpm as packageManagers', () => {
    expect(isCommandInCategory('pnpm', 'packageManagers')).toBe(true);
  });

  it('returns false for wrong category', () => {
    expect(isCommandInCategory('git', 'packageManagers')).toBe(false);
  });

  it('identifies vitest as testing', () => {
    expect(isCommandInCategory('vitest', 'testing')).toBe(true);
  });

  it('identifies eslint as linting', () => {
    expect(isCommandInCategory('eslint', 'linting')).toBe(true);
  });
});

// ============================================================================
// getCommandCategory
// ============================================================================

describe('getCommandCategory', () => {
  it('returns versionControl for git', () => {
    expect(getCommandCategory('git')).toBe('versionControl');
  });

  it('returns packageManagers for pnpm', () => {
    expect(getCommandCategory('pnpm')).toBe('packageManagers');
  });

  it('returns testing for vitest', () => {
    expect(getCommandCategory('vitest')).toBe('testing');
  });

  it('returns null for unknown command', () => {
    expect(getCommandCategory('unknown_cmd')).toBeNull();
  });

  it('returns node for tsx', () => {
    expect(getCommandCategory('tsx')).toBe('node');
  });

  it('returns github for gh', () => {
    expect(getCommandCategory('gh')).toBe('github');
  });
});

// ============================================================================
// DENIED_ARG_PATTERNS
// ============================================================================

describe('DENIED_ARG_PATTERNS', () => {
  it('has patterns for common injection vectors', () => {
    expect(DENIED_ARG_PATTERNS.length).toBeGreaterThan(0);
  });

  it('every entry is a RegExp', () => {
    for (const pattern of DENIED_ARG_PATTERNS) {
      expect(pattern).toBeInstanceOf(RegExp);
    }
  });
});
