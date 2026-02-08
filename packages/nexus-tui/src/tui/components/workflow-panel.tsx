/**
 * WorkflowPanel — Graph workflow node execution visualization.
 *
 * Shows node-by-node progress during a graph workflow execution.
 * Renders a horizontal pipeline with status indicators.
 *
 * @module tui/components/workflow-panel
 */

import React from 'react';
import { Box, Text } from 'ink';

interface WorkflowNode {
  readonly nodeId: string;
  readonly status: 'pending' | 'running' | 'completed' | 'failed';
}

interface ActiveWorkflow {
  readonly name: string;
  readonly nodes: readonly WorkflowNode[];
}

interface WorkflowPanelProps {
  readonly activeWorkflow: ActiveWorkflow | null;
}

export function WorkflowPanel({ activeWorkflow }: WorkflowPanelProps): React.ReactElement {
  if (activeWorkflow === null) {
    return (
      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
        <Text bold color="blue">
          Workflow
        </Text>
        <Text dimColor>No active workflow</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="blue" paddingX={1}>
      <Text bold color="blue">
        Workflow
      </Text>
      <Text>{`Running: ${activeWorkflow.name}`}</Text>
      <Box flexDirection="row" gap={0}>
        {activeWorkflow.nodes.map((node, i) => (
          <Text key={node.nodeId}>
            {i > 0 && ' -> '}
            {nodeLabel(node)}
          </Text>
        ))}
      </Box>
    </Box>
  );
}

function nodeLabel(node: WorkflowNode): string {
  const icon = nodeIcon(node.status);
  return `[${icon}] ${node.nodeId}`;
}

function nodeIcon(status: WorkflowNode['status']): string {
  switch (status) {
    case 'completed':
      return 'ok';
    case 'running':
      return '>>';
    case 'failed':
      return '!!';
    case 'pending':
      return '  ';
  }
}
