/**
 * TaskPanel — Active task progress with stage tracking.
 *
 * Subscribes to pipeline and stage events to show real-time
 * task execution progress.
 *
 * @module tui/components/task-panel
 */

import React from 'react';
import { Box, Text } from 'ink';
import { formatBar } from '../../formatter.js';

interface StageInfo {
  readonly stageId: string;
  readonly status: 'pending' | 'running' | 'completed' | 'failed';
}

interface ActiveTask {
  readonly taskId: string;
  readonly executionId: string;
  readonly stages: readonly StageInfo[];
  readonly startedAt: number;
}

interface TaskPanelProps {
  readonly focused: boolean;
  readonly activeTask: ActiveTask | null;
}

export function TaskPanel({ focused, activeTask }: TaskPanelProps): React.ReactElement {
  return (
    <Box
      flexDirection="column"
      borderStyle={focused ? 'double' : 'single'}
      borderColor={focused ? 'cyan' : 'gray'}
      paddingX={1}
      flexGrow={1}
    >
      <Text bold color="cyan">
        Task
      </Text>
      {activeTask === null ? (
        <Text dimColor>No active task</Text>
      ) : (
        <TaskProgress task={activeTask} />
      )}
    </Box>
  );
}

function TaskProgress({ task }: { task: ActiveTask }): React.ReactElement {
  const completed = task.stages.filter((s) => s.status === 'completed').length;
  const total = task.stages.length;
  const ratio = total > 0 ? completed / total : 0;
  const elapsed = Math.round((Date.now() - task.startedAt) / 1000);

  return (
    <Box flexDirection="column">
      <Text>{`Task: ${task.taskId}`}</Text>
      <Text>{`Progress: ${formatBar(ratio, 15)} ${String(completed)}/${String(total)}`}</Text>
      <Text dimColor>{`Elapsed: ${String(elapsed)}s`}</Text>
      {task.stages.map((stage) => (
        <Text key={stage.stageId}>{`  ${stageIcon(stage.status)} ${stage.stageId}`}</Text>
      ))}
    </Box>
  );
}

function stageIcon(status: StageInfo['status']): string {
  switch (status) {
    case 'completed':
      return '[ok]';
    case 'running':
      return '[>>]';
    case 'failed':
      return '[!!]';
    case 'pending':
      return '[  ]';
  }
}
