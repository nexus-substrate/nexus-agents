import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ok, err } from '../../core/result.js';
import type { IAgent, Task } from '../../core/types/agent.js';
import type { Skill } from './skill-types.js';
import type { SkillLoaderError, LoadedSkillSet, ISkillLoader } from './skill-loader-types.js';
import {
  initializeAgentSkills,
  getSkillsForTask,
  getSkillSetForTask,
} from './skill-loader-integration.js';

function createMockAgent(): IAgent {
  const agent = {
    id: 'agent-1',
    role: 'code_expert',
    state: 'idle',
    capabilities: [],
    execute: vi.fn(),
    handleMessage: vi.fn(),
    initialize: vi.fn(),
    cleanup: vi.fn(),
  } as unknown as IAgent;
  return agent;
}

function createMockTask(): Task {
  const task: Task = {
    id: 'task-1',
    description: 'test task description',
    context: {},
  };
  return task;
}

function createMockSkill(name: string): Skill {
  const skill = {
    id: `skill-${name}`,
    name,
    description: `${name} skill`,
  } as unknown as Skill;
  return skill;
}

function createMockSkillSet(skills: Skill[]): LoadedSkillSet {
  const set = {
    skills,
    executionOrder: skills.map((s) => s.id),
    missingRequired: [],
  } as unknown as LoadedSkillSet;
  return set;
}

function createMockLoader(overrides: Partial<ISkillLoader> = {}): ISkillLoader {
  const skillSet = createMockSkillSet([createMockSkill('test')]);
  const loader = {
    loadForAgent: vi.fn(() => ok(skillSet)),
    loadForTask: vi.fn(() => ok(skillSet)),
    validateLoadedSet: vi.fn(() => ok(undefined)),
    ...overrides,
  } as unknown as ISkillLoader;
  return loader;
}

function createMockError(): SkillLoaderError {
  const error = {
    type: 'validation_error',
    message: 'test error',
  } as SkillLoaderError;
  return error;
}

describe('skill-loader-integration', () => {
  describe('initializeAgentSkills', () => {
    let agent: IAgent;

    beforeEach(() => {
      agent = createMockAgent();
    });

    it('should return ok when loadForAgent and validateLoadedSet both succeed', () => {
      const loader = createMockLoader();
      const result = initializeAgentSkills(agent, loader);

      expect(result.ok).toBe(true);
    });

    it('should return error when loadForAgent fails', () => {
      const error = createMockError();
      const loader = createMockLoader({
        loadForAgent: vi.fn(() => err(error)),
      });

      const result = initializeAgentSkills(agent, loader);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(error);
      }
    });

    it('should return error when validateLoadedSet fails', () => {
      const error = createMockError();
      const loader = createMockLoader({
        validateLoadedSet: vi.fn(() => err(error)),
      });

      const result = initializeAgentSkills(agent, loader);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(error);
      }
    });

    it('should call loadForAgent with agent.id and agent.role', () => {
      const loader = createMockLoader();

      initializeAgentSkills(agent, loader);

      expect(loader.loadForAgent).toHaveBeenCalledWith(agent.id, agent.role);
      expect(loader.loadForAgent).toHaveBeenCalledTimes(1);
    });

    it('should call validateLoadedSet with the loaded skill set', () => {
      const skillSet = createMockSkillSet([createMockSkill('test')]);
      const loader = createMockLoader({
        loadForAgent: vi.fn(() => ok(skillSet)),
      });

      initializeAgentSkills(agent, loader);

      expect(loader.validateLoadedSet).toHaveBeenCalledWith(skillSet);
      expect(loader.validateLoadedSet).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSkillsForTask', () => {
    let agent: IAgent;
    let task: Task;

    beforeEach(() => {
      agent = createMockAgent();
      task = createMockTask();
    });

    it('should return ok with skills array on success', () => {
      const skill1 = createMockSkill('skill1');
      const skill2 = createMockSkill('skill2');
      const skillSet = createMockSkillSet([skill1, skill2]);
      const loader = createMockLoader({
        loadForTask: vi.fn(() => ok(skillSet)),
      });

      const result = getSkillsForTask(agent, task, loader);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([skill1, skill2]);
      }
    });

    it('should return error when loadForTask fails', () => {
      const error = createMockError();
      const loader = createMockLoader({
        loadForTask: vi.fn(() => err(error)),
      });

      const result = getSkillsForTask(agent, task, loader);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(error);
      }
    });

    it('should call loadForTask with agent.id, agent.role, and task.description', () => {
      const loader = createMockLoader();

      getSkillsForTask(agent, task, loader);

      expect(loader.loadForTask).toHaveBeenCalledWith(agent.id, agent.role, task.description);
      expect(loader.loadForTask).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSkillSetForTask', () => {
    let agent: IAgent;
    let task: Task;

    beforeEach(() => {
      agent = createMockAgent();
      task = createMockTask();
    });

    it('should return the full LoadedSkillSet on success', () => {
      const skillSet = createMockSkillSet([createMockSkill('test')]);
      const loader = createMockLoader({
        loadForTask: vi.fn(() => ok(skillSet)),
      });

      const result = getSkillSetForTask(agent, task, loader);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(skillSet);
      }
    });

    it('should return error when loadForTask fails', () => {
      const error = createMockError();
      const loader = createMockLoader({
        loadForTask: vi.fn(() => err(error)),
      });

      const result = getSkillSetForTask(agent, task, loader);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(error);
      }
    });

    it('should pass through the loader result directly', () => {
      const skillSet = createMockSkillSet([createMockSkill('test')]);
      const loaderResult = ok(skillSet);
      const loader = createMockLoader({
        loadForTask: vi.fn(() => loaderResult),
      });

      const result = getSkillSetForTask(agent, task, loader);

      expect(result).toBe(loaderResult);
    });
  });
});
