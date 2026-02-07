import { describe, it, expect, vi, afterEach } from 'vitest';
import { initializeSkillLibrary, getSkillLibrary, resetSkillLibrary } from './cli-server-skills.js';
import type { ILogger } from './core/index.js';

vi.mock('./agents/skills/skill-library.js', () => ({
  createSkillLibrary: vi.fn(() => ({
    id: 'skill-library',
    registerSkill: vi.fn(),
    getConfig: vi.fn(() => ({
      maxSkills: 100,
      enablePruning: true,
      trackExecutionHistory: true,
    })),
  })),
}));

vi.mock('./agents/skills/bootstrap/index.js', () => ({
  registerStandardsSkills: vi.fn(() => Promise.resolve()),
}));

vi.mock('./agents/skills/external-pack-loader.js', () => ({
  loadAllExternalPacks: vi.fn(() => Promise.resolve({ loaded: [], errors: [] })),
}));

describe('cli-server-skills', () => {
  function createMockLogger(): ILogger {
    const mock = { info: vi.fn(), debug: vi.fn() } as unknown as ILogger;
    return mock;
  }

  afterEach(() => {
    resetSkillLibrary();
    vi.clearAllMocks();
  });

  describe('initializeSkillLibrary', () => {
    it('should initialize when enabled by default', async () => {
      await initializeSkillLibrary({ logger: createMockLogger() });
      expect(getSkillLibrary()).toBeDefined();
    });

    it('should not initialize when disabled', async () => {
      await initializeSkillLibrary({
        skillsConfig: { enabled: false },
        logger: createMockLogger(),
      });
      expect(getSkillLibrary()).toBeUndefined();
    });

    it('should register standard skills on init', async () => {
      const { registerStandardsSkills } = await import('./agents/skills/bootstrap/index.js');
      await initializeSkillLibrary({ logger: createMockLogger() });
      expect(registerStandardsSkills).toHaveBeenCalled();
    });

    it('should load external packs when configured', async () => {
      const { loadAllExternalPacks } = await import('./agents/skills/external-pack-loader.js');
      await initializeSkillLibrary({
        skillsConfig: { externalPacks: ['pack1'] },
        logger: createMockLogger(),
      });
      expect(loadAllExternalPacks).toHaveBeenCalledWith(['pack1'], expect.anything());
    });

    it('should not load external packs when not configured', async () => {
      const { loadAllExternalPacks } = await import('./agents/skills/external-pack-loader.js');
      await initializeSkillLibrary({ logger: createMockLogger() });
      expect(loadAllExternalPacks).not.toHaveBeenCalled();
    });

    it('should return immediately if already initialized', async () => {
      const { createSkillLibrary } = await import('./agents/skills/skill-library.js');
      await initializeSkillLibrary({ logger: createMockLogger() });
      const firstCallCount = vi.mocked(createSkillLibrary).mock.calls.length;

      await initializeSkillLibrary({ logger: createMockLogger() });
      const secondCallCount = vi.mocked(createSkillLibrary).mock.calls.length;

      expect(secondCallCount).toBe(firstCallCount);
    });
  });

  describe('getSkillLibrary', () => {
    it('should return undefined when not initialized', () => {
      expect(getSkillLibrary()).toBeUndefined();
    });

    it('should return library when initialized', async () => {
      await initializeSkillLibrary({ logger: createMockLogger() });
      expect(getSkillLibrary()).toBeDefined();
      expect(getSkillLibrary()?.id).toBe('skill-library');
    });
  });

  describe('resetSkillLibrary', () => {
    it('should clear initialized state', async () => {
      await initializeSkillLibrary({ logger: createMockLogger() });
      expect(getSkillLibrary()).toBeDefined();

      resetSkillLibrary();
      expect(getSkillLibrary()).toBeUndefined();
    });
  });
});
