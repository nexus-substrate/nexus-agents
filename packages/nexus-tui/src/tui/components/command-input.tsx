/**
 * CommandInput — Text input with command history.
 *
 * Uses Ink's useInput() for character-by-character input handling.
 * Up/Down arrows cycle through command history.
 *
 * @module tui/components/command-input
 */

import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { useAppState } from '../state.js';

interface CommandInputProps {
  readonly focused: boolean;
  readonly onSubmit: (line: string) => void;
  readonly isLoading: boolean;
}

/** Navigate history upward (older). */
function navigateUp(
  historyIdx: number,
  history: readonly string[],
  setIdx: (n: number) => void,
  setValue: (v: string) => void
): void {
  const newIdx = Math.min(historyIdx + 1, history.length - 1);
  setIdx(newIdx);
  const entry = history[history.length - 1 - newIdx];
  if (entry !== undefined) setValue(entry);
}

/** Navigate history downward (newer). */
function navigateDown(
  historyIdx: number,
  history: readonly string[],
  setIdx: (n: number) => void,
  setValue: (v: string) => void
): void {
  const newIdx = Math.max(historyIdx - 1, -1);
  setIdx(newIdx);
  if (newIdx < 0) {
    setValue('');
  } else {
    const entry = history[history.length - 1 - newIdx];
    if (entry !== undefined) setValue(entry);
  }
}

/** Handle a single key press, dispatching to the appropriate action. */
function handleKeyPress(opts: {
  input: string;
  key: {
    return: boolean;
    backspace: boolean;
    delete: boolean;
    upArrow: boolean;
    downArrow: boolean;
    ctrl: boolean;
    meta: boolean;
  };
  onSubmit: () => void;
  setValue: React.Dispatch<React.SetStateAction<string>>;
  historyIdx: number;
  history: readonly string[];
  setHistoryIdx: (n: number) => void;
}): void {
  if (opts.key.return) {
    opts.onSubmit();
    return;
  }
  if (opts.key.backspace || opts.key.delete) {
    opts.setValue((p) => p.slice(0, -1));
    return;
  }
  if (opts.key.upArrow) {
    navigateUp(opts.historyIdx, opts.history, opts.setHistoryIdx, opts.setValue);
    return;
  }
  if (opts.key.downArrow) {
    navigateDown(opts.historyIdx, opts.history, opts.setHistoryIdx, opts.setValue);
    return;
  }
  if (!opts.key.ctrl && !opts.key.meta && opts.input) opts.setValue((p) => p + opts.input);
}

export function CommandInput({
  focused,
  onSubmit,
  isLoading,
}: CommandInputProps): React.ReactElement {
  const { inputHistory } = useAppState();
  const [value, setValue] = useState('');
  const [historyIdx, setHistoryIdx] = useState(-1);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed === '') return;
    onSubmit(trimmed);
    setValue('');
    setHistoryIdx(-1);
  }, [value, onSubmit]);

  useInput(
    (input, key) => {
      if (!focused || isLoading) return;
      handleKeyPress({
        input,
        key,
        onSubmit: handleSubmit,
        setValue,
        historyIdx,
        history: inputHistory,
        setHistoryIdx,
      });
    },
    { isActive: focused }
  );

  return (
    <Box
      borderStyle={focused ? 'double' : 'single'}
      borderColor={focused ? 'green' : 'gray'}
      paddingX={1}
    >
      <Text bold color="green">
        {'nexus> '}
      </Text>
      <Text>{value}</Text>
      {focused && <Text color="green">{'_'}</Text>}
      {isLoading && <Text color="yellow">{' (running...)'}</Text>}
    </Box>
  );
}
