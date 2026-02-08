/**
 * Spinner — Loading indicator for the TUI.
 *
 * Simple text-based spinner using rotating characters.
 *
 * @module tui/components/spinner
 */

import React, { useState, useEffect } from 'react';
import { Text } from 'ink';

const FRAMES = ['|', '/', '-', '\\'];
const INTERVAL_MS = 100;

interface SpinnerProps {
  readonly label?: string;
}

export function Spinner({ label }: SpinnerProps): React.ReactElement {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((prev) => (prev + 1) % FRAMES.length);
    }, INTERVAL_MS);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const icon = FRAMES[frame] ?? '|';

  return (
    <Text color="yellow">
      {icon}
      {label !== undefined ? ` ${label}` : ''}
    </Text>
  );
}
