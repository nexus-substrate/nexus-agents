/**
 * Tests for the CLI documentation drift gate (#5142).
 *
 * @module scripts/check-cli-docs-drift.test
 */

import { describe, it, expect } from 'vitest';
import { catalogCommands, documentedCommands, computeDrift } from './check-cli-docs-drift.js';

const DOC = `
## CLI Commands

### Daily use

| Command | Sub | Description | Mode |
| --- | --- | --- | --- |
| \`orchestrate\` | \`<task>\` | Run a task | any |
| \`vote\` | - | Vote | any |

### Mode Selection

| Mode | Flag | Use |
| --- | --- | --- |
| \`mesh\` | \`--mode=mesh\` | Planned |

## MCP Tools

| Tool | Description |
| --- | --- |
| \`code-review\` | A workflow template, not a command |
`;

describe('documentedCommands', () => {
  it('reads only the CLI command tables', () => {
    expect([...documentedCommands(DOC)]).toEqual(['orchestrate', 'vote']);
  });

  it('excludes the Mode Selection table', () => {
    // `mesh` is a MODE. A file-wide scan reported it as a command that does not
    // exist — the gate would have cried wolf on its first run.
    expect([...documentedCommands(DOC)]).not.toContain('mesh');
  });

  it('excludes tables after the CLI Commands section', () => {
    // `code-review` is a workflow template. Ten such names were false positives
    // before the scan was scoped.
    expect([...documentedCommands(DOC)]).not.toContain('code-review');
  });

  it('returns empty when the section heading is absent', () => {
    // Named explicitly: an empty result must not read as "nothing documented",
    // which would flag every command as newly undocumented.
    expect([...documentedCommands('# Some other doc\n')]).toEqual([]);
  });
});

describe('catalogCommands', () => {
  it('reads command names from catalog entries', () => {
    const src = `export const COMMAND_CATALOG = [
      { command: 'auth', description: 'x', audience: 'essential' },
      { command: 'login', description: 'y', audience: 'maintainer' },
    ];`;
    expect([...catalogCommands(src)]).toEqual(['auth', 'login']);
  });

  it('drops the (default) placeholder — it is not a typed command', () => {
    const src = `export const COMMAND_CATALOG = [
      { command: '(default)', description: 'x', audience: 'essential' },
      { command: 'server', description: 'y', audience: 'internal' },
    ];`;
    expect([...catalogCommands(src)]).toEqual(['server']);
  });

  it('throws on a command name the doc scan could never match (#5458)', () => {
    // `documentedCommands` only matches [a-z][a-z0-9-]*; a catalog name outside
    // that would be reported undocumented forever, or ignored if the scan were
    // widened carelessly. Either way the mismatch must be loud.
    const src = `export const COMMAND_CATALOG = [
      { command: 'Weird_Name', description: 'x', audience: 'internal' },
    ];`;
    expect(() => catalogCommands(src)).toThrow(/Weird_Name/);
  });

  it('propagates a catalog parse error instead of reporting a shorter set', () => {
    const src = `export const COMMAND_CATALOG = [ ...EXTRA ];`;
    expect(() => catalogCommands(src)).toThrow(/SpreadElement/);
  });
});

describe('computeDrift', () => {
  it('flags a documented command that is not registered', () => {
    const d = computeDrift(['real'], ['real', 'ghost']);
    expect([...d.phantom]).toEqual(['ghost']);
  });

  it('flags every undocumented command — there is no baseline any more (#5458)', () => {
    const d = computeDrift(['documented', 'missing'], ['documented']);
    expect([...d.undocumented]).toEqual(['missing']);
    expect([...d.phantom]).toEqual([]);
  });

  it('reports nothing when the two sets agree', () => {
    const d = computeDrift(['a'], ['a']);
    expect([...d.phantom]).toEqual([]);
    expect([...d.undocumented]).toEqual([]);
  });
});
