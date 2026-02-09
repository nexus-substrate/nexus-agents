/**
 * TaskPanel — Tests.
 *
 * @module tui/components/task-panel.test
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { TaskPanel } from './task-panel.js';

describe('TaskPanel', () => {
  it('shows empty state when no task', () => {
    const { lastFrame } = render(<TaskPanel focused={false} activeTask={null} />);
    expect(lastFrame()).toContain('No active task');
  });

  it('shows task title', () => {
    const { lastFrame } = render(
      <TaskPanel
        focused={false}
        activeTask={{
          taskId: 'task-123',
          executionId: 'exec-1',
          stages: [],
          startedAt: Date.now(),
        }}
      />
    );
    expect(lastFrame()).toContain('task-123');
  });

  it('shows stage progress', () => {
    const { lastFrame } = render(
      <TaskPanel
        focused={false}
        activeTask={{
          taskId: 'task-456',
          executionId: 'exec-2',
          stages: [
            { stageId: 'parse', status: 'completed' },
            { stageId: 'execute', status: 'running' },
            { stageId: 'validate', status: 'pending' },
          ],
          startedAt: Date.now(),
        }}
      />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('parse');
    expect(frame).toContain('execute');
    expect(frame).toContain('validate');
    expect(frame).toContain('1/3');
  });

  it('shows focused border style', () => {
    const { lastFrame } = render(<TaskPanel focused={true} activeTask={null} />);
    expect(lastFrame()).toContain('Task');
  });
});
