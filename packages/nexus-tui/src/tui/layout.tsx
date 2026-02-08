/**
 * Layout — Box-based multi-panel grid for the Ink TUI.
 *
 * Top row: Agent status + Weather panels
 * Middle: Task progress + Output (or Vote/Workflow when active)
 * Bottom: Outcomes + Command input
 *
 * @module tui/layout
 */

import React from 'react';
import { Box } from 'ink';
import { OutputPanel } from './components/output-panel.js';
import { CommandInput } from './components/command-input.js';
import { AgentPanel, buildAgentStatus } from './components/agent-panel.js';
import { WeatherPanel } from './components/weather-panel.js';
import { TaskPanel } from './components/task-panel.js';
import { OutcomesPanel } from './components/outcomes-panel.js';
import { VotePanel } from './components/vote-panel.js';
import { WorkflowPanel } from './components/workflow-panel.js';
import { useAppState } from './state.js';
import { useEventBus } from './hooks/use-event-bus.js';
import { useTaskEvents } from './hooks/use-task-events.js';

interface LayoutProps {
  readonly onCommand: (line: string) => void;
  readonly eventBus: { subscribe: (...args: unknown[]) => () => void } | null;
}

export function Layout({ onCommand, eventBus }: LayoutProps): React.ReactElement {
  const state = useAppState();
  const { focusedPanel, isLoading, activeTask, activeVote, activeWorkflow } = state;

  const modelEvents = useEventBus({
    bus: eventBus as Parameters<typeof useEventBus>[0]['bus'],
    filter: { type: 'model.called' },
  });

  // Subscribe to pipeline events for TaskPanel
  useTaskEvents(eventBus as Parameters<typeof useTaskEvents>[0]);

  const agentStatus = buildAgentStatus(modelEvents);

  return (
    <Box flexDirection="column" height={24}>
      {/* Top row: Agents + Weather */}
      <Box flexDirection="row">
        <AgentPanel focused={focusedPanel === 'agents'} agents={agentStatus} />
        <WeatherPanel focused={focusedPanel === 'weather'} />
      </Box>

      {/* Middle: Task + Output (or Vote/Workflow overlays) */}
      <Box flexDirection="row" flexGrow={1}>
        <MiddleLeftPanel
          focused={focusedPanel === 'task'}
          activeTask={activeTask}
          activeVote={activeVote}
          activeWorkflow={activeWorkflow}
        />
        <OutputPanel focused={focusedPanel === 'output'} />
      </Box>

      {/* Bottom: Outcomes + Command input */}
      <Box flexDirection="row">
        <OutcomesPanel focused={focusedPanel === 'outcomes'} />
        <Box flexDirection="column" width="50%">
          <CommandInput
            focused={focusedPanel === 'command'}
            onSubmit={onCommand}
            isLoading={isLoading}
          />
        </Box>
      </Box>
    </Box>
  );
}

/** Middle-left panel: shows Vote or Workflow when active, otherwise Task. */
function MiddleLeftPanel(props: {
  focused: boolean;
  activeTask: ReturnType<typeof useAppState>['activeTask'];
  activeVote: ReturnType<typeof useAppState>['activeVote'];
  activeWorkflow: ReturnType<typeof useAppState>['activeWorkflow'];
}): React.ReactElement {
  if (props.activeVote !== null) {
    return <VotePanel activeVote={props.activeVote} />;
  }
  if (props.activeWorkflow !== null) {
    return <WorkflowPanel activeWorkflow={props.activeWorkflow} />;
  }
  return <TaskPanel focused={props.focused} activeTask={props.activeTask} />;
}
