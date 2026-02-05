/**
 * Tests for category-detection.ts
 *
 * Covers file suffix patterns, path patterns, types-only detection,
 * and the main detectFileCategory function.
 */

import { describe, it, expect } from 'vitest';
import { detectFileCategory } from './category-detection.js';

// ============================================================================
// Mock SourceFile
// ============================================================================

interface MockSourceFileOpts {
  typeAliases?: number;
  interfaces?: number;
  functions?: number;
  classes?: number;
  variableDeclarations?: number;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeMockSourceFile(opts: MockSourceFileOpts = {}) {
  const {
    typeAliases = 0,
    interfaces = 0,
    functions = 0,
    classes = 0,
    variableDeclarations = 0,
  } = opts;
  return {
    getTypeAliases: () => Array.from({ length: typeAliases }),
    getInterfaces: () => Array.from({ length: interfaces }),
    getFunctions: () => Array.from({ length: functions }),
    getClasses: () => Array.from({ length: classes }),
    getVariableDeclarations: () => Array.from({ length: variableDeclarations }),
  } as unknown as import('ts-morph').SourceFile;
}

// ============================================================================
// File suffix patterns
// ============================================================================

describe('detectFileCategory - file suffix patterns', () => {
  const implFile = makeMockSourceFile({ functions: 1 });

  it('detects .test.ts as test category', () => {
    expect(detectFileCategory('/src/foo.test.ts', implFile)).toBe('test');
  });

  it('detects .spec.ts as test category', () => {
    expect(detectFileCategory('/src/foo.spec.ts', implFile)).toBe('test');
  });

  it('detects -types.ts as types category', () => {
    expect(detectFileCategory('/src/foo-types.ts', implFile)).toBe('types');
  });

  it('detects .types.ts as types category', () => {
    expect(detectFileCategory('/src/foo.types.ts', implFile)).toBe('types');
  });

  it('detects -command.ts as cli category', () => {
    expect(detectFileCategory('/src/foo-command.ts', implFile)).toBe('cli');
  });
});

// ============================================================================
// File path patterns
// ============================================================================

describe('detectFileCategory - path patterns', () => {
  const implFile = makeMockSourceFile({ functions: 1 });

  it('detects index.ts as index category', () => {
    expect(detectFileCategory('/src/index.ts', implFile)).toBe('index');
  });

  it('detects files in /cli/ directory as cli', () => {
    expect(detectFileCategory('/src/cli/foo.ts', implFile)).toBe('cli');
  });

  it('detects files with config in directory', () => {
    expect(detectFileCategory('/src/config/settings.ts', implFile)).toBe('config');
  });

  it('detects files with config in filename', () => {
    expect(detectFileCategory('/src/app-config.ts', implFile)).toBe('config');
  });

  it('detects files with helper in filename', () => {
    expect(detectFileCategory('/src/format-helper.ts', implFile)).toBe('util');
  });

  it('detects files with util in filename', () => {
    expect(detectFileCategory('/src/string-utils.ts', implFile)).toBe('util');
  });
});

// ============================================================================
// Types-only content detection
// ============================================================================

describe('detectFileCategory - types-only content detection', () => {
  it('detects types-only file (only type aliases)', () => {
    const sf = makeMockSourceFile({ typeAliases: 3 });
    expect(detectFileCategory('/src/models.ts', sf)).toBe('types');
  });

  it('detects types-only file (only interfaces)', () => {
    const sf = makeMockSourceFile({ interfaces: 5 });
    expect(detectFileCategory('/src/contracts.ts', sf)).toBe('types');
  });

  it('detects types-only file (mixed types and interfaces)', () => {
    const sf = makeMockSourceFile({ typeAliases: 2, interfaces: 3 });
    expect(detectFileCategory('/src/models.ts', sf)).toBe('types');
  });

  it('does not classify as types if implementations exist', () => {
    const sf = makeMockSourceFile({ typeAliases: 2, functions: 1 });
    expect(detectFileCategory('/src/mixed.ts', sf)).toBe('implementation');
  });

  it('does not classify as types if classes exist', () => {
    const sf = makeMockSourceFile({ interfaces: 2, classes: 1 });
    expect(detectFileCategory('/src/mixed.ts', sf)).toBe('implementation');
  });

  it('does not classify as types if variable declarations exist', () => {
    const sf = makeMockSourceFile({ interfaces: 1, variableDeclarations: 1 });
    expect(detectFileCategory('/src/mixed.ts', sf)).toBe('implementation');
  });
});

// ============================================================================
// Default fallback
// ============================================================================

describe('detectFileCategory - fallback', () => {
  it('returns implementation for regular files', () => {
    const sf = makeMockSourceFile({ functions: 2, variableDeclarations: 1 });
    expect(detectFileCategory('/src/service.ts', sf)).toBe('implementation');
  });

  it('returns implementation for empty files with no types', () => {
    const sf = makeMockSourceFile();
    expect(detectFileCategory('/src/empty.ts', sf)).toBe('implementation');
  });
});

// ============================================================================
// Pattern priority
// ============================================================================

describe('detectFileCategory - pattern priority', () => {
  const implFile = makeMockSourceFile({ functions: 1 });

  it('suffix patterns take priority over path patterns', () => {
    // A test file in /cli/ → should be 'test' not 'cli'
    expect(detectFileCategory('/src/cli/foo.test.ts', implFile)).toBe('test');
  });

  it('suffix patterns take priority over content detection', () => {
    // A -types.ts file with functions → still 'types' from suffix
    const sf = makeMockSourceFile({ functions: 5 });
    expect(detectFileCategory('/src/foo-types.ts', sf)).toBe('types');
  });

  it('path patterns take priority over content detection', () => {
    // index.ts with only types → still 'index' from path
    const sf = makeMockSourceFile({ typeAliases: 3 });
    expect(detectFileCategory('/src/index.ts', sf)).toBe('index');
  });
});
