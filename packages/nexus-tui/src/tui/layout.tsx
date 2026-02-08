/**
 * Layout — Box-based 4-panel grid for the Ink TUI.
 *
 * Top row: Agent status + Weather panels
 * Middle: Task progress + Output
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
import { useAppState } from './state.js';
import { useEventBus } from './hooks/use-event-bus.js';

interface LayoutProps {
  readonly onCommand: (line: string) => void;
  readonly eventBus: { subscribe: (...args: unknown[]) => () => void } | null;
}

export function Layout({ onCommand, eventBus }: LayoutProps): React.ReactElement {
  const { focusedPanel, isLoading } = useAppState();

  const modelEvents = useEventBus({
    bus: eventBus as Parameters<typeof useEventBus>[0]['bus'],
    filter: { type: 'model.called' },
  });

  const agentStatus = buildAgentStatus(modelEvents);

  return (
    <Box flexDirection="column" height={24}>
      {/* Top row: Agents + Weather */}
      <Box flexDirection="row">
        <AgentPanel focused={focusedPanel === 'agents'} agents={agentStatus} />
        <WeatherPanel focused={focusedPanel === 'weather'} />
      </Box>

      {/* Middle: Task + Output */}
      <Box flexDirection="row" flexGrow={1}>
        <TaskPanel focused={false} activeTask={null} />
        <OutputPanel focused={focusedPanel === 'output'} />
      </Box>

      {/* Bottom: Outcomes + Command input */}
      <Box flexDirection="row">
        <OutcomesPanel focused={false} />
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
