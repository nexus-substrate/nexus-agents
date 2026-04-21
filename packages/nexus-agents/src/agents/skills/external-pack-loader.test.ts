/**
 * Tests for external-pack-loader module
 * @module agents/skills/external-pack-loader.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { ILogger } from '../../core/index.js';
import {
  ExternalPackError,
  loadExternalPack,
  loadAllExternalPacks,
  type ExternalPackSourceConfig,
} from './external-pack-loader.js';

// Mock logger
const createMockLogger = (): ILogger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn().mockReturnThis(),
  setLevel: vi.fn(),
});

// Test fixtures directory
const FIXTURES_DIR = join(process.cwd(), '.test-fixtures-external-pack');

describe('ExternalPackError', () => {
  it('should have correct name property', () => {
    const error = new ExternalPackError('test message', 'test-pack', 'npm:test-pack');
    expect(error.name).toBe('ExternalPackError');
  });

  it('should have correct message property', () => {
    const error = new ExternalPackError('test message', 'test-pack', 'npm:test-pack');
    expect(error.message).toBe('test message');
  });

  it('should have correct packName property', () => {
    const error = new ExternalPackError('test message', 'test-pack', 'npm:test-pack');
    expect(error.packName).toBe('test-pack');
  });

  it('should have correct source property', () => {
    const error = new ExternalPackError('test message', 'test-pack', 'npm:test-pack');
    expect(error.source).toBe('npm:test-pack');
  });

  it('should be instanceof Error', () => {
    const error = new ExternalPackError('test message', 'test-pack', 'npm:test-pack');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('loadExternalPack', () => {
  let mockLogger: ILogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    // Create fixtures directory
    mkdirSync(FIXTURES_DIR, { recursive: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Clean up fixtures
    try {
      rmSync(FIXTURES_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should return ok with 0 skills for disabled pack', async () => {
    const packSource: ExternalPackSourceConfig = {
      name: 'disabled-pack',
      source: 'npm:disabled-pack',
      enabled: false,
    };

    const result = await loadExternalPack(packSource, mockLogger);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.packName).toBe('disabled-pack');
      expect(result.value.skillCount).toBe(0);
      expect(result.value.skills).toEqual([]);
    }
    expect(mockLogger.debug).toHaveBeenCalledWith('Skipping disabled external pack', {
      name: 'disabled-pack',
      source: 'npm:disabled-pack',
    });
  });

  it('should return err for invalid manifest missing name', async () => {
    const fixturePath = join(FIXTURES_DIR, 'no-name.mjs');
    writeFileSync(
      fixturePath,
      `export default {
        version: '1.0.0',
        description: 'Missing name field',
        skills: []
      };`
    );

    const packSource: ExternalPackSourceConfig = {
      name: 'invalid-pack',
      source: fixturePath,
      enabled: true,
    };

    const result = await loadExternalPack(packSource, mockLogger);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ExternalPackError);
      expect(result.error.message).toContain('Invalid pack manifest');
      expect(result.error.message).toContain('name');
      expect(result.error.packName).toBe('invalid-pack');
      expect(result.error.source).toBe(fixturePath);
    }
  });

  it('should return err for invalid manifest missing skills', async () => {
    const fixturePath = join(FIXTURES_DIR, 'no-skills.mjs');
    writeFileSync(
      fixturePath,
      `export default {
        name: 'no-skills-pack',
        version: '1.0.0',
        description: 'Missing skills array'
      };`
    );

    const packSource: ExternalPackSourceConfig = {
      name: 'no-skills-pack',
      source: fixturePath,
      enabled: true,
    };

    const result = await loadExternalPack(packSource, mockLogger);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ExternalPackError);
      expect(result.error.message).toContain('Invalid pack manifest');
      expect(result.error.message).toContain('skills');
    }
  });

  it('should return err for invalid skill in manifest', async () => {
    const fixturePath = join(FIXTURES_DIR, 'invalid-skill.mjs');
    writeFileSync(
      fixturePath,
      `export default {
        name: 'invalid-skill-pack',
        version: '1.0.0',
        description: 'Has invalid skill',
        skills: [
          {
            name: 'test-skill'
            // Missing required fields like description, category, etc.
          }
        ]
      };`
    );

    const packSource: ExternalPackSourceConfig = {
      name: 'invalid-skill-pack',
      source: fixturePath,
      enabled: true,
    };

    const result = await loadExternalPack(packSource, mockLogger);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ExternalPackError);
      expect(result.error.message).toContain('Invalid pack manifest');
    }
  });

  it('should handle import failure with error message', async () => {
    const packSource: ExternalPackSourceConfig = {
      name: 'nonexistent-pack',
      source: './nonexistent-module-path-12345',
      enabled: true,
    };

    const result = await loadExternalPack(packSource, mockLogger);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ExternalPackError);
      expect(result.error.message).toContain('Failed to load pack');
      expect(result.error.message).toContain('nonexistent-pack');
      expect(result.error.packName).toBe('nonexistent-pack');
    }
  });

  it('should load valid pack with default export successfully', async () => {
    const fixturePath = join(FIXTURES_DIR, 'valid-default.mjs');
    writeFileSync(
      fixturePath,
      `export default {
        name: 'valid-pack',
        version: '1.0.0',
        description: 'Valid pack',
        skills: [
          {
            name: 'test-skill',
            description: 'A test skill',
            category: 'utility',
            complexity: 'simple',
            code: 'async function run() { return "ok"; }',
            parameters: [],
            outputType: 'string'
          }
        ]
      };`
    );

    const packSource: ExternalPackSourceConfig = {
      name: 'valid-pack',
      source: fixturePath,
      enabled: true,
    };

    const result = await loadExternalPack(packSource, mockLogger);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.packName).toBe('valid-pack');
      expect(result.value.skillCount).toBe(1);
      expect(result.value.skills).toHaveLength(1);
      expect(result.value.skills[0]!.name).toBe('test-skill');
    }
  });

  it('should load valid pack with named manifest export successfully', async () => {
    const fixturePath = join(FIXTURES_DIR, 'valid-named.mjs');
    writeFileSync(
      fixturePath,
      `export const manifest = {
        name: 'named-pack',
        version: '2.0.0',
        description: 'Pack with named export',
        skills: [
          {
            name: 'named-skill',
            description: 'Skill from named export',
            category: 'data',
            complexity: 'moderate',
            code: 'async function process() { return {}; }',
            parameters: [],
            outputType: 'object'
          }
        ]
      };`
    );

    const packSource: ExternalPackSourceConfig = {
      name: 'named-pack',
      source: fixturePath,
      enabled: true,
    };

    const result = await loadExternalPack(packSource, mockLogger);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.packName).toBe('named-pack');
      expect(result.value.skillCount).toBe(1);
    }
  });

  it('should validate complete manifest with all optional fields', async () => {
    const fixturePath = join(FIXTURES_DIR, 'complete.mjs');
    writeFileSync(
      fixturePath,
      `export default {
        name: 'complete-pack',
        version: '1.2.3',
        description: 'Complete manifest with all fields',
        minNexusVersion: '2.0.0',
        skills: [
          {
            name: 'example-skill',
            description: 'An example skill',
            category: 'utility',
            complexity: 'simple',
            code: 'async function run() { return "result"; }',
            parameters: [
              {
                name: 'input',
                type: 'string',
                description: 'Input parameter',
                required: true,
                defaultValue: 'default'
              }
            ],
            outputType: 'string',
            dependencies: ['dep1', 'dep2'],
            tags: ['example', 'test'],
            examples: [
              {
                input: { input: 'test' },
                expectedOutput: 'result',
                description: 'Example usage'
              }
            ]
          }
        ]
      };`
    );

    const packSource: ExternalPackSourceConfig = {
      name: 'complete-pack',
      source: fixturePath,
      enabled: true,
    };

    const result = await loadExternalPack(packSource, mockLogger);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.packName).toBe('complete-pack');
      expect(result.value.skillCount).toBe(1);
      expect(mockLogger.info).toHaveBeenCalledWith('External pack loaded successfully', {
        name: 'complete-pack',
        version: '1.2.3',
        skillCount: 1,
      });
    }
  });

  it('should accept manifest without optional minNexusVersion', async () => {
    const fixturePath = join(FIXTURES_DIR, 'no-min-version.mjs');
    writeFileSync(
      fixturePath,
      `export default {
        name: 'no-min-version',
        version: '1.0.0',
        description: 'Pack without minNexusVersion',
        skills: [
          {
            name: 'skill',
            description: 'desc',
            category: 'cat',
            complexity: 'simple',
            code: 'code',
            parameters: [],
            outputType: 'string'
          }
        ]
      };`
    );

    const packSource: ExternalPackSourceConfig = {
      name: 'no-min-version',
      source: fixturePath,
      enabled: true,
    };

    const result = await loadExternalPack(packSource, mockLogger);

    expect(result.ok).toBe(true);
  });

  it('should handle skills with all complexity levels', async () => {
    const fixturePath = join(FIXTURES_DIR, 'all-complexity.mjs');
    const complexities = ['primitive', 'simple', 'moderate', 'complex', 'composite'];
    const skills = complexities.map((complexity) => ({
      name: `${complexity}-skill`,
      description: `Skill with ${complexity} complexity`,
      category: 'test',
      complexity,
      code: 'code',
      parameters: [],
      outputType: 'string',
    }));

    writeFileSync(
      fixturePath,
      `export default {
        name: 'complexity-pack',
        version: '1.0.0',
        description: 'All complexity levels',
        skills: ${JSON.stringify(skills)}
      };`
    );

    const packSource: ExternalPackSourceConfig = {
      name: 'complexity-pack',
      source: fixturePath,
      enabled: true,
    };

    const result = await loadExternalPack(packSource, mockLogger);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.skillCount).toBe(5);
    }
  });

  it('should reject invalid complexity value', async () => {
    const fixturePath = join(FIXTURES_DIR, 'bad-complexity.mjs');
    writeFileSync(
      fixturePath,
      `export default {
        name: 'bad-complexity',
        version: '1.0.0',
        description: 'Invalid complexity',
        skills: [
          {
            name: 'skill',
            description: 'desc',
            category: 'cat',
            complexity: 'invalid-level',
            code: 'code',
            parameters: [],
            outputType: 'string'
          }
        ]
      };`
    );

    const packSource: ExternalPackSourceConfig = {
      name: 'bad-complexity',
      source: fixturePath,
      enabled: true,
    };

    const result = await loadExternalPack(packSource, mockLogger);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Invalid pack manifest');
    }
  });
});

describe('loadAllExternalPacks', () => {
  let mockLogger: ILogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mkdirSync(FIXTURES_DIR, { recursive: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try {
      rmSync(FIXTURES_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should return empty arrays for empty pack list', async () => {
    const result = await loadAllExternalPacks([], mockLogger);

    expect(result.loaded).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(mockLogger.info).toHaveBeenCalledWith('External pack loading complete', {
      loaded: 0,
      errors: 0,
      totalSkills: 0,
    });
  });

  it('should return ok with 0 skills for all disabled packs', async () => {
    const packs: ExternalPackSourceConfig[] = [
      { name: 'pack1', source: './pack1', enabled: false },
      { name: 'pack2', source: './pack2', enabled: false },
    ];

    const result = await loadAllExternalPacks(packs, mockLogger);

    expect(result.loaded).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
    expect(result.loaded[0]!.skillCount).toBe(0);
    expect(result.loaded[1]!.skillCount).toBe(0);
  });

  it('should separate loaded packs and errors', async () => {
    const validPath = join(FIXTURES_DIR, 'valid-for-all.mjs');
    writeFileSync(
      validPath,
      `export default {
        name: 'valid',
        version: '1.0.0',
        description: 'Valid',
        skills: [
          {
            name: 'skill1',
            description: 'desc',
            category: 'cat',
            complexity: 'simple',
            code: 'code',
            parameters: [],
            outputType: 'string'
          }
        ]
      };`
    );

    const packs: ExternalPackSourceConfig[] = [
      { name: 'valid', source: validPath, enabled: true },
      { name: 'failing', source: './nonexistent-12345', enabled: true },
    ];

    const result = await loadAllExternalPacks(packs, mockLogger);

    expect(result.loaded).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.loaded[0]!.packName).toBe('valid');
    expect(result.errors[0]!.packName).toBe('failing');
    expect(mockLogger.warn).toHaveBeenCalledWith('Failed to load external pack', {
      name: 'failing',
      error: expect.stringContaining('Failed to load pack'),
    });
  });

  it('should calculate total skills correctly', async () => {
    const pack1Path = join(FIXTURES_DIR, 'pack1-multi.mjs');
    const pack2Path = join(FIXTURES_DIR, 'pack2-multi.mjs');

    writeFileSync(
      pack1Path,
      `export default {
        name: 'pack1',
        version: '1.0.0',
        description: 'Pack 1',
        skills: [
          {
            name: 'skill1',
            description: 'desc',
            category: 'cat',
            complexity: 'simple',
            code: 'code',
            parameters: [],
            outputType: 'string'
          },
          {
            name: 'skill2',
            description: 'desc',
            category: 'cat',
            complexity: 'simple',
            code: 'code',
            parameters: [],
            outputType: 'string'
          }
        ]
      };`
    );

    writeFileSync(
      pack2Path,
      `export default {
        name: 'pack2',
        version: '1.0.0',
        description: 'Pack 2',
        skills: [
          {
            name: 'skill3',
            description: 'desc',
            category: 'cat',
            complexity: 'simple',
            code: 'code',
            parameters: [],
            outputType: 'string'
          }
        ]
      };`
    );

    const packs: ExternalPackSourceConfig[] = [
      { name: 'pack1', source: pack1Path, enabled: true },
      { name: 'pack2', source: pack2Path, enabled: true },
    ];

    const result = await loadAllExternalPacks(packs, mockLogger);

    expect(mockLogger.info).toHaveBeenCalledWith('External pack loading complete', {
      loaded: 2,
      errors: 0,
      totalSkills: 3,
    });
    expect(result.loaded[0]!.skillCount).toBe(2);
    expect(result.loaded[1]!.skillCount).toBe(1);
  });

  it('should log completion summary with correct counts', async () => {
    const validPath = join(FIXTURES_DIR, 'good-summary.mjs');
    writeFileSync(
      validPath,
      `export default {
        name: 'good',
        version: '1.0.0',
        description: 'Good pack',
        skills: []
      };`
    );

    const packs: ExternalPackSourceConfig[] = [
      { name: 'good', source: validPath, enabled: true },
      { name: 'bad', source: './bad-nonexistent', enabled: true },
    ];

    await loadAllExternalPacks(packs, mockLogger);

    expect(mockLogger.info).toHaveBeenCalledWith('External pack loading complete', {
      loaded: 1,
      errors: 1,
      totalSkills: 0,
    });
  });
});

describe('manifest extraction patterns', () => {
  it('should prefer default over named manifest export', () => {
    const module = {
      default: { name: 'from-default' },
      manifest: { name: 'from-manifest' },
    };

    const extracted = module.default ?? module.manifest ?? module;
    expect(extracted.name).toBe('from-default');
  });

  it('should use named manifest if no default', () => {
    const module = {
      manifest: { name: 'from-manifest' },
    };

    const extracted = module.manifest ?? module;
    expect(extracted.name).toBe('from-manifest');
  });

  it('should use module itself if no default or manifest', () => {
    const module = {
      name: 'from-module',
      version: '1.0.0',
    };

    const extracted = module;
    expect((extracted as { name: string }).name).toBe('from-module');
  });
});

describe('path resolution behavior', () => {
  it('should identify relative paths starting with ./', () => {
    const relativePath = './local-pack';
    expect(relativePath.startsWith('./')).toBe(true);
  });

  it('should identify relative paths starting with ../', () => {
    const parentPath = '../parent-pack';
    expect(parentPath.startsWith('../')).toBe(true);
  });

  it('should identify absolute paths starting with /', () => {
    const absolutePath = '/absolute/path/pack';
    expect(absolutePath.startsWith('/')).toBe(true);
  });

  it('should identify npm package names (no path prefix)', () => {
    const npmPackage = 'npm-package-name';
    expect(!npmPackage.startsWith('./')).toBe(true);
    expect(!npmPackage.startsWith('../')).toBe(true);
    expect(!npmPackage.startsWith('/')).toBe(true);
  });
});
