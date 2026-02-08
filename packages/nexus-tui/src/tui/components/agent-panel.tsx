/**
 * AgentPanel — CLI adapter availability display.
 *
 * Shows the status of each CLI adapter (claude, codex, gemini)
 * based on model.called events from the EventBus.
 *
 * @module tui/components/agent-panel
 */

import React from 'react';
import { Box, Text } from 'ink';

interface AgentStatus {
  readonly cli: string;
  readonly available: boolean;
  readonly lastSeen: number | null;
}

interface AgentPanelProps {
  readonly focused: boolean;
  readonly agents: readonly AgentStatus[];
}

const STATUS_ICON_OK = '+';
const STATUS_ICON_UNKNOWN = '?';

export function AgentPanel({ focused, agents }: AgentPanelProps): React.ReactElement {
  return (
    <Box
      flexDirection="column"
      borderStyle={focused ? 'double' : 'single'}
      borderColor={focused ? 'cyan' : 'gray'}
      paddingX={1}
      width="50%"
    >
      <Text bold color="cyan">
        Agents
      </Text>
      {agents.length === 0 ? (
        <Text dimColor>No agent data yet</Text>
      ) : (
        agents.map((a) => (
          <Text key={a.cli}>
            {a.available ? (
              <Text color="green">{STATUS_ICON_OK}</Text>
            ) : (
              <Text color="yellow">{STATUS_ICON_UNKNOWN}</Text>
            )}{' '}
            {a.cli}
            {a.lastSeen !== null && <Text dimColor>{` (${formatAge(a.lastSeen)})`}</Text>}
          </Text>
        ))
      )}
    </Box>
  );
}

function formatAge(timestamp: number): string {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${String(seconds)}s ago`;
  return `${String(Math.round(seconds / 60))}m ago`;
}

/** Build agent status from model.called events. */
export function buildAgentStatus(
  events: readonly { cli?: unknown; timestamp?: unknown }[]
): AgentStatus[] {
  const cliMap = new Map<string, number>();
  for (const e of events) {
    if (typeof e.cli === 'string' && typeof e.timestamp === 'number') {
      const existing = cliMap.get(e.cli);
      if (existing === undefined || e.timestamp > existing) {
        cliMap.set(e.cli, e.timestamp);
      }
    }
  }

  const defaultClis = ['claude', 'codex', 'gemini'];
  return defaultClis.map((cli) => {
    const lastSeen = cliMap.get(cli) ?? null;
    return { cli, available: lastSeen !== null, lastSeen };
  });
}
