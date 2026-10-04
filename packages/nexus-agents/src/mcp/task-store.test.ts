/**
 * Task Store Tests
 *
 * Verifies the task store wrapper's security controls:
 * - TTL clamping
 * - Capacity enforcement with FIFO eviction
 * - Singleton lifecycle
 *
 * @module mcp/task-store.test
 * (Source: Issue #1298 — Layer 2 MCP Tasks async execution)
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  getTaskStore,
  resetTaskStore,
  clampTaskTtl,
  MAX_TASK_TTL_MS,
  DEFAULT_TASK_TTL_MS,
  MAX_TASK_CAPACITY,
} from './task-store.js';

afterEach(() => {
  resetTaskStore();
});

describe('clampTaskTtl', () => {
  it('returns default TTL when no value provided', () => {
    expect(clampTaskTtl()).toBe(DEFAULT_TASK_TTL_MS);
    expect(clampTaskTtl(undefined)).toBe(DEFAULT_TASK_TTL_MS);
    expect(clampTaskTtl(null)).toBe(DEFAULT_TASK_TTL_MS);
  });

  it('passes through TTL within limits', () => {
    expect(clampTaskTtl(60_000)).toBe(60_000);
    expect(clampTaskTtl(MAX_TASK_TTL_MS)).toBe(MAX_TASK_TTL_MS);
  });

  it('clamps TTL exceeding maximum', () => {
    expect(clampTaskTtl(MAX_TASK_TTL_MS + 1)).toBe(MAX_TASK_TTL_MS);
    expect(clampTaskTtl(999_999)).toBe(MAX_TASK_TTL_MS);
  });
});

describe('getTaskStore', () => {
  it('returns a task store singleton', () => {
    const store1 = getTaskStore();
    const store2 = getTaskStore();
    expect(store1).toBe(store2);
  });

  it('creates a fresh store after reset', () => {
    const store1 = getTaskStore();
    resetTaskStore();
    const store2 = getTaskStore();
    expect(store1).not.toBe(store2);
  });

  it('exposes standard TaskStore interface', () => {
    const store = getTaskStore();
    expect(typeof store.createTask).toBe('function');
    expect(typeof store.getTask).toBe('function');
    expect(typeof store.storeTaskResult).toBe('function');
    expect(typeof store.getTaskResult).toBe('function');
    expect(typeof store.updateTaskStatus).toBe('function');
    expect(typeof store.listTasks).toBe('function');
  });
});

describe('constants', () => {
  it('MAX_TASK_TTL_MS is 10 minutes', () => {
    expect(MAX_TASK_TTL_MS).toBe(600_000);
  });

  it('DEFAULT_TASK_TTL_MS is 5 minutes', () => {
    expect(DEFAULT_TASK_TTL_MS).toBe(300_000);
  });

  it('MAX_TASK_CAPACITY is 50', () => {
    expect(MAX_TASK_CAPACITY).toBe(50);
  });
});

describe('task session scoping (#7045)', () => {
  it('allows the owning session and rejects another session accessing or changing a task', async () => {
    const store = getTaskStore();
    const task = await store.createTask(
      { ttl: DEFAULT_TASK_TTL_MS },
      1,
      { method: 'tools/call', params: { name: 'execute_expert' } },
      'owner-session'
    );
    const result = { content: [{ type: 'text' as const, text: 'completed' }] };

    expect(await store.getTask(task.taskId, 'owner-session')).toEqual(task);
    expect(await store.getTask(task.taskId, 'other-session')).toBeNull();
    await expect(
      store.updateTaskStatus(task.taskId, 'cancelled', undefined, 'other-session')
    ).rejects.toThrow('not found');
    await expect(
      store.storeTaskResult(task.taskId, 'completed', result, 'other-session')
    ).rejects.toThrow('not found');

    await store.storeTaskResult(task.taskId, 'completed', result, 'owner-session');
    expect(await store.getTaskResult(task.taskId, 'owner-session')).toEqual(result);
    await expect(store.getTaskResult(task.taskId, 'other-session')).rejects.toThrow('not found');
  });

  it('lists only accessible tasks, including tasks created without a session', async () => {
    const store = getTaskStore();
    const request = { method: 'tools/call', params: { name: 'execute_expert' } };
    const options = { ttl: DEFAULT_TASK_TTL_MS };
    const ownTask = await store.createTask(options, 1, request, 'owner-session');
    const otherTask = await store.createTask(options, 2, request, 'other-session');
    const unscopedTask = await store.createTask(options, 3, request);

    expect((await store.listTasks(undefined, 'owner-session')).tasks).toEqual([
      ownTask,
      unscopedTask,
    ]);
    expect(await store.getTask(unscopedTask.taskId, 'owner-session')).toEqual(unscopedTask);
    expect(await store.getTask(otherTask.taskId)).toEqual(otherTask);
    expect((await store.listTasks()).tasks).toEqual([ownTask, otherTask, unscopedTask]);
  });

  it('returns an empty list when the session has no accessible tasks', async () => {
    const store = getTaskStore();
    await store.createTask(
      { ttl: DEFAULT_TASK_TTL_MS },
      1,
      { method: 'tools/call', params: { name: 'execute_expert' } },
      'owner-session'
    );

    expect((await store.listTasks(undefined, 'other-session')).tasks).toEqual([]);
  });
});
