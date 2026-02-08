/**
 * WeatherPanel — CLI performance success rate bars.
 *
 * Displays per-CLI success rates as ASCII progress bars.
 * Fetches data via generateWeatherReport on mount.
 *
 * @module tui/components/weather-panel
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { formatBar } from '../../formatter.js';

interface CliWeather {
  readonly cli: string;
  readonly successRate: number;
  readonly totalTasks: number;
}

interface WeatherPanelProps {
  readonly focused: boolean;
}

export function WeatherPanel({ focused }: WeatherPanelProps): React.ReactElement {
  const [data, setData] = useState<readonly CliWeather[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadWeather(setData, setError);
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
        Weather
      </Text>
      {error !== null ? (
        <Text color="red">{error}</Text>
      ) : data.length === 0 ? (
        <Text dimColor>No weather data</Text>
      ) : (
        data.map((w) => (
          <Text key={w.cli}>
            {`${w.cli.padEnd(7)} ${formatBar(w.successRate, 12)} (${String(w.totalTasks)})`}
          </Text>
        ))
      )}
    </Box>
  );
}

async function loadWeather(
  setData: (d: readonly CliWeather[]) => void,
  setError: (e: string | null) => void
): Promise<void> {
  try {
    const mod: Record<string, unknown> = (await import('nexus-agents')) as Record<string, unknown>;
    const genReport = mod['generateWeatherReport'];
    if (typeof genReport !== 'function') {
      setError('Weather unavailable');
      return;
    }
    const typedGen = genReport as (opts: { includeAdaptive: boolean }) => unknown;
    const report = typedGen({ includeAdaptive: false }) as { cliWeather: readonly CliWeather[] };
    setData(report.cliWeather);
  } catch {
    setError('Weather unavailable');
  }
}
