/**
 * WorkflowPanel — Rendering tests.
 *
 * @module tui/components/workflow-panel.test
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { WorkflowPanel } from './workflow-panel.js';

describe('WorkflowPanel', () => {
  it('renders empty state', () => {
    const { lastFrame } = render(<WorkflowPanel activeWorkflow={null} />);
    expect(lastFrame()).toContain('Workflow');
    expect(lastFrame()).toContain('No active workflow');
  });

  it('renders workflow nodes', () => {
    const workflow = {
      name: 'code-review',
      nodes: [
        { nodeId: 'parse', status: 'completed' as const },
        { nodeId: 'decompose', status: 'completed' as const },
        { nodeId: 'execute', status: 'running' as const },
        { nodeId: 'validate', status: 'pending' as const },
      ],
    };
    const { lastFrame } = render(<WorkflowPanel activeWorkflow={workflow} />);
    const frame = lastFrame();
    expect(frame).toContain('code-review');
    expect(frame).toContain('parse');
    expect(frame).toContain('validate');
  });

  it('shows status icons', () => {
    const workflow = {
      name: 'test',
      nodes: [
        { nodeId: 'step1', status: 'completed' as const },
        { nodeId: 'step2', status: 'failed' as const },
      ],
    };
    const { lastFrame } = render(<WorkflowPanel activeWorkflow={workflow} />);
    const frame = lastFrame();
    expect(frame).toContain('[ok]');
    expect(frame).toContain('[!!]');
  });
});
