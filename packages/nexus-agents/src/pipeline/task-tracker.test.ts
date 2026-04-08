/**
 * Task Tracker Tests (#1684)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createTaskTracker } from './task-tracker.js';

describe('JsonTaskTracker', () => {
  it('creates and persists tasks', async () => {
    const dir = path.join(os.tmpdir(), `tracker-test-${String(Date.now())}`);
    const tracker = createTaskTracker({ backend: 'json', outputDir: dir });

    const task = await tracker.createTask('Test task', 'Test body');
    expect(task.id).toBe('1');
    expect(task.title).toBe('Test task');
    expect(task.status).toBe('open');

    const data = JSON.parse(fs.readFileSync(path.join(dir, 'tasks.json'), 'utf-8'));
    expect(data.tasks).toHaveLength(1);
    expect(data.comments['1']).toEqual(['Test body']);

    // Cleanup
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('posts comments', async () => {
    const dir = path.join(os.tmpdir(), `tracker-test-${String(Date.now())}`);
    const tracker = createTaskTracker({ backend: 'json', outputDir: dir });

    await tracker.createTask('Task 1', 'Body');
    await tracker.postComment('1', 'Progress update');

    const data = JSON.parse(fs.readFileSync(path.join(dir, 'tasks.json'), 'utf-8'));
    expect(data.comments['1']).toHaveLength(2);
    expect(data.comments['1'][1]).toBe('Progress update');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('updates status', async () => {
    const dir = path.join(os.tmpdir(), `tracker-test-${String(Date.now())}`);
    const tracker = createTaskTracker({ backend: 'json', outputDir: dir });

    await tracker.createTask('Task 1', 'Body');
    await tracker.updateStatus('1', 'closed');

    const data = JSON.parse(fs.readFileSync(path.join(dir, 'tasks.json'), 'utf-8'));
    expect(data.tasks[0].status).toBe('closed');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('supports multiple tasks', async () => {
    const dir = path.join(os.tmpdir(), `tracker-test-${String(Date.now())}`);
    const tracker = createTaskTracker({ backend: 'json', outputDir: dir });

    await tracker.createTask('Task 1', 'Body 1');
    await tracker.createTask('Task 2', 'Body 2');

    const data = JSON.parse(fs.readFileSync(path.join(dir, 'tasks.json'), 'utf-8'));
    expect(data.tasks).toHaveLength(2);
    expect(data.tasks[1].id).toBe('2');

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
