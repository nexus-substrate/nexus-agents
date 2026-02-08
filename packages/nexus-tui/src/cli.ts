#!/usr/bin/env node
/**
 * nexus-tui — CLI entry point
 *
 * Starts the Ink TUI (default), readline REPL (--repl), or runs a single command.
 *
 * @module cli
 */

import { parseArgs } from 'node:util';
import { startRepl } from './repl.js';
import { createCommandRegistry } from './commands/index.js';
import { processLine } from './repl.js';
import { VERSION } from './version.js';

const { values } = parseArgs({
  options: {
    json: { type: 'boolean', default: false },
    version: { type: 'boolean', short: 'v', default: false },
    help: { type: 'boolean', short: 'h', default: false },
    exec: { type: 'string', short: 'e' },
    tui: { type: 'boolean', default: false },
    repl: { type: 'boolean', default: false },
  },
  strict: false,
  allowPositionals: true,
});

if (values['version'] === true) {
  process.stdout.write(`nexus-tui v${VERSION}\n`);
  process.exit(0);
}

if (values['help'] === true) {
  process.stdout.write(`nexus-tui v${VERSION}\n\n`);
  process.stdout.write('Usage: nexus-tui [options]\n\n');
  process.stdout.write('Options:\n');
  process.stdout.write('  -e, --exec <command>  Execute a single command and exit\n');
  process.stdout.write('  --tui                 Start Ink-based TUI (default)\n');
  process.stdout.write('  --repl                Start readline REPL (classic)\n');
  process.stdout.write('  --json                Output in JSON format\n');
  process.stdout.write('  -v, --version         Show version\n');
  process.stdout.write('  -h, --help            Show help\n');
  process.exit(0);
}

const jsonMode = values['json'] === true;
const exec = values['exec'] as string | undefined;
const useRepl = values['repl'] === true;

if (exec !== undefined) {
  // Single command mode
  const registry = createCommandRegistry();
  void processLine(exec, registry, jsonMode).then((output) => {
    if (output !== null) {
      process.stdout.write(output + '\n');
    }
  });
} else if (useRepl) {
  // Classic readline REPL
  startRepl({ jsonMode });
} else {
  // Default: Ink TUI
  void startTui(jsonMode);
}

async function startTui(json: boolean): Promise<void> {
  const { render } = await import('ink');
  const { createElement } = await import('react');
  const { App } = await import('./tui/app.js');
  const registry = createCommandRegistry();
  render(createElement(App, { registry, jsonMode: json }));
}
