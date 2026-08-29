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
    const src = `  {\n    command: 'auth',\n    description: 'x',\n  },\n  {\n    command: 'login',\n  },`;
    expect([...catalogCommands(src)]).toEqual(['auth', 'login']);
  });
});

describe('computeDrift', () => {
  const baseline = { undocumented: ['known-debt'] };

  it('flags a documented command that is not registered', () => {
    const d = computeDrift(['real'], ['real', 'ghost'], baseline);
    expect([...d.phantom]).toEqual(['ghost']);
  });

  it('flags a new undocumented command but not a baselined one', () => {
    const d = computeDrift(['known-debt', 'brand-new'], [], baseline);
    expect([...d.newlyUndocumented]).toEqual(['brand-new']);
    expect([...d.baselinedUndocumented]).toEqual(['known-debt']);
  });

  it('reports nothing when the two sets agree', () => {
    const d = computeDrift(['a'], ['a'], { undocumented: [] });
    expect([...d.phantom]).toEqual([]);
    expect([...d.newlyUndocumented]).toEqual([]);
  });
});
