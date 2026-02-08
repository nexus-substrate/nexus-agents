/**
 * OutcomesPanel — Recent outcomes list.
 *
 * Shows the last N task outcomes from the OutcomeStore.
 *
 * @module tui/components/outcomes-panel
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { sanitizeOutput } from '../../sanitize.js';

interface OutcomeEntry {
  readonly task: string;
  readonly success: boolean;
  readonly cli: string;
  readonly durationMs: number;
}

interface OutcomesPanelProps {
  readonly focused: boolean;
}

const MAX_DISPLAY = 8;

export function OutcomesPanel({ focused }: OutcomesPanelProps): React.ReactElement {
  const [outcomes, setOutcomes] = useState<readonly OutcomeEntry[]>([]);

  useEffect(() => {
    void loadOutcomes(setOutcomes);
  }, []);

  return (
    <Box
      flexDirection="column"
      borderStyle={focused ? 'double' : 'single'}
      borderColor={focused ? 'cyan' : 'gray'}
      paddingX={1}
      width="50%"
    >
      <Text bold color="cyan">
        Outcomes
      </Text>
      {outcomes.length === 0 ? (
        <Text dimColor>No outcomes yet</Text>
      ) : (
        outcomes.slice(-MAX_DISPLAY).map((o, i) => (
          <Text key={`outcome-${String(i)}`}>
            {o.success ? <Text color="green">{'OK '}</Text> : <Text color="red">{'ERR'}</Text>}{' '}
            <Text dimColor>{o.cli.padEnd(7)}</Text>
            {sanitizeOutput(o.task.slice(0, 40))}
          </Text>
        ))
      )}
    </Box>
  );
}

async function loadOutcomes(setOutcomes: (o: readonly OutcomeEntry[]) => void): Promise<void> {
  try {
    const mod: Record<string, unknown> = (await import('nexus-agents')) as Record<string, unknown>;
    const getter = mod['getOutcomeStore'];
    if (typeof getter !== 'function') return;
    const typedGetter = getter as () => unknown;
    const raw = typedGetter() as Record<string, unknown>;
    const store = raw as { query: (filter: Record<string, unknown>) => unknown };
    const entries = store.query({}) as readonly OutcomeEntry[];
    setOutcomes(entries.slice(-MAX_DISPLAY));
  } catch {
    // OutcomeStore may not be available
  }
}
