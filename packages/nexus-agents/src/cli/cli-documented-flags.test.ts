/**
 * Documented CLI flags must reach their handlers (#6693).
 *
 * The strict global parser (`PARSE_ARGS_CONFIG`) rejected several flags that
 * usage text advertised and handlers read, so each exited with
 * `Unknown option` before the handler ran. Part one drives each fixed flag
 * through the real `parseCliArgs` → handler path. Part two is the guard: every
 * flag that `docs/ENTRYPOINTS.md` or a CLI help/usage string advertises must
 * parse without `Unknown option`, so this class of drift fails CI.
 *
 * @module cli/cli-documented-flags.test
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseCliArgs } from '../cli.js';
import {
  handleResearchCommand,
  handleSessionCommand,
  handleSprintCommand,
  handleValidationCommand,
} from '../cli-commands-handlers.js';
import { handleReleaseValidateCommand } from '../cli-release-handlers.js';
import { handleUsageCommand } from './usage-command.js';
import {
  researchCommand,
  releaseValidateCommand,
  sprintCommand,
  validationDashboardCommand,
} from './index.js';
import { loadUsageEvents } from '../learning/usage-log.js';
import { researchIndexCommand } from './research-index-command.js';

const storage = vi.hoisted(() => ({
  listSessions: vi.fn(),
  getSessionWithTasks: vi.fn(),
}));

vi.mock('./session-storage.js', () => ({
  createSessionStorage: vi.fn(() => ({
    initialize: vi.fn().mockResolvedValue({ ok: true }),
    listSessions: storage.listSessions,
    getSessionWithTasks: storage.getSessionWithTasks,
    deleteSession: vi.fn().mockResolvedValue({ ok: true, value: true }),
    prune: vi.fn().mockResolvedValue({ ok: true, value: 0 }),
    close: vi.fn(),
  })),
  SQLiteSessionStorage: vi.fn(),
}));

vi.mock('./index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./index.js')>();
  return {
    ...actual,
    // Pass-through spy: the research index path runs the real subcommand code.
    researchCommand: vi.fn(actual.researchCommand),
    sprintCommand: vi.fn().mockResolvedValue(0),
    validationDashboardCommand: vi.fn().mockReturnValue(0),
    releaseValidateCommand: vi.fn().mockResolvedValue(0),
  };
});

vi.mock('./research-index-command.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./research-index-command.js')>();
  return {
    ...actual,
    researchIndexCommand: vi.fn().mockResolvedValue({ message: 'ok', exitCode: 0 }),
  };
});

vi.mock('../learning/usage-log.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../learning/usage-log.js')>();
  return {
    ...actual,
    loadUsageEvents: vi.fn(() => ({ events: [], complete: true, readErrors: [] })),
  };
});

let stdout: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  stdout = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    stdout.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
    return true;
  });
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('#6693 documented flags reach their handlers', () => {
  it('session list --limit <n> caps the listing at n', async () => {
    storage.listSessions.mockResolvedValue({ ok: true, value: [] });
    await handleSessionCommand(parseCliArgs(['session', 'list', '--limit', '5']));
    expect(storage.listSessions).toHaveBeenCalledWith(5);
  });

  it('session list --limit refuses a non-integer', () => {
    expect(() => parseCliArgs(['session', 'list', '--limit', 'five'])).toThrow(
      /--limit must be a positive integer; got 'five'/
    );
  });

  it('session export --markdown renders markdown, not JSON', async () => {
    storage.getSessionWithTasks.mockResolvedValue({
      ok: true,
      value: {
        id: 's-6693',
        status: 'completed',
        createdAt: '2026-09-24T00:00:00.000Z',
        updatedAt: '2026-09-24T00:00:00.000Z',
        metadata: {},
        tasks: [],
      },
    });
    await handleSessionCommand(parseCliArgs(['session', 'export', 's-6693', '--markdown']));
    expect(stdout.join('')).toContain('# Session: s-6693');
  });

  it('usage --since / --until set the ledger window', async () => {
    const since = '2026-09-01T00:00:00.000Z';
    const until = '2026-09-02T00:00:00.000Z';
    await handleUsageCommand(parseCliArgs(['usage', `--since=${since}`, `--until=${until}`]));
    expect(vi.mocked(loadUsageEvents)).toHaveBeenCalledWith({ sinceIso: since, untilIso: until });
  });

  it('validation --task-type / --min-sample reach the dashboard filter', () => {
    handleValidationCommand(
      parseCliArgs(['validation', '--task-type=coding,review', '--min-sample=7'])
    );
    expect(vi.mocked(validationDashboardCommand)).toHaveBeenCalledWith(
      expect.objectContaining({ taskTypes: ['coding', 'review'], minSampleSize: 7 })
    );
  });

  it('sprint plan --vote asks for a vote without filing an issue', async () => {
    await handleSprintCommand(parseCliArgs(['sprint', 'plan', '--vote']));
    const opts = vi.mocked(sprintCommand).mock.calls[0]?.[0];
    expect(opts).toEqual(expect.objectContaining({ subcommand: 'plan', vote: true }));
    expect(opts).not.toHaveProperty('createIssue');
  });

  it('research --topic / --status / --create-issues / --max / --vote are forwarded', async () => {
    vi.mocked(researchCommand).mockResolvedValueOnce({ text: 'ok', exitCode: 0 });
    await handleResearchCommand(
      parseCliArgs([
        'research',
        'review',
        '--topic=agents',
        '--status=implemented',
        '--create-issues',
        '--max=3',
        '--vote',
      ])
    );
    expect(vi.mocked(researchCommand).mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({
        topic: 'agents',
        status: 'implemented',
        createIssues: true,
        max: 3,
        vote: true,
      })
    );
  });

  it('research index --generate --strict --silent --no-check-files reach the index command', async () => {
    await handleResearchCommand(
      parseCliArgs(['research', 'index', '--generate', '--strict', '--silent', '--no-check-files'])
    );
    expect(vi.mocked(researchIndexCommand)).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'generate', strict: true, silent: true, checkFiles: false })
    );
  });

  it('research index --check selects the check action', async () => {
    await handleResearchCommand(parseCliArgs(['research', 'index', '--check']));
    expect(vi.mocked(researchIndexCommand)).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'check', strict: false, silent: false, checkFiles: true })
    );
  });

  it('release-validate --strict / --skip reach the validator', async () => {
    await handleReleaseValidateCommand(
      parseCliArgs(['release-validate', '1.2.3', '--strict', '--skip', 'docs', '--skip', 'devops'])
    );
    expect(vi.mocked(releaseValidateCommand)).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          version: '1.2.3',
          strict: true,
          skip: ['docs', 'devops'],
        }),
      })
    );
  });
});

// ============================================================================
// Guard: every advertised flag parses
// ============================================================================

const SRC = fileURLToPath(new URL('..', import.meta.url));
const ENTRYPOINTS = join(SRC, '../../../docs/ENTRYPOINTS.md');
const FLAG = /(?<![\w-])(-{1,2}[a-zA-Z][\w-]*)/g;

/** Tokens that look like a nexus-agents flag but belong to another tool. */
const NOT_NEXUS_FLAGS: ReadonlyArray<{ file: string; flag: string; why: string }> = [
  { file: 'cli/setup-mcp.ts', flag: '-s', why: '`claude mcp remove nexus-agents -s <scope>`' },
];

interface FlagClaim {
  readonly where: string;
  readonly command: string | undefined;
  readonly flag: string;
}

const COMMAND_LINE = /nexus-agents(?: ([a-z][a-z-]*))?((?: [^\n`'"|#)]*)?)/g;
const USAGE_ROW =
  /^\s*(?:(?:process\.stdout\.write\(|write\()?['"`])?\s+(-{1,2}[a-zA-Z][\w-]*(?:[ =][<[][^\]>]*[\]>])?(?:,\s*-{1,2}[a-zA-Z][\w-]*)*)\s{2,}\w/;
const HELP_ENTRY = /flag: '([^']*)'/;
const TABLE_ROW = /^\| `(-{1,2}[a-zA-Z][\w-]*)/;
const MANIFEST_NAME = /^\s+- name: ([a-z-]+)/;
const MANIFEST_FLAGS = [/^\s+flags:\s*\[(.*)\]/, /^\s+\[('--.*)\]/];

/** Flag spans with no command context: usage rows, help entries, table rows. */
function contextFreeSpans(line: string): string[] {
  return [USAGE_ROW, HELP_ENTRY, TABLE_ROW]
    .map((re) => re.exec(line)?.[1])
    .filter((span): span is string => span !== undefined);
}

/**
 * Extracts the flags a text advertises: `nexus-agents <cmd> … --flag` command
 * lines, `  --flag  description` usage rows, `flag: '--x'` help entries,
 * ENTRYPOINTS `| \`--x\`` table rows and the `flags: [...]` manifest.
 */
function extractFlagClaims(where: string, text: string): FlagClaim[] {
  const claims: FlagClaim[] = [];
  const add = (line: number, command: string | undefined, span: string): void => {
    for (const m of span.matchAll(FLAG)) {
      const flag = (m[1] ?? '').split('=')[0] ?? '';
      claims.push({ where: `${where}:${String(line)}`, command, flag });
    }
  };
  let manifestCommand: string | undefined;
  text.split('\n').forEach((l, i) => {
    for (const m of l.matchAll(COMMAND_LINE)) add(i + 1, m[1], m[2] ?? '');
    for (const span of contextFreeSpans(l)) add(i + 1, undefined, span);
    manifestCommand = MANIFEST_NAME.exec(l)?.[1] ?? manifestCommand;
    const manifest = MANIFEST_FLAGS.map((re) => re.exec(l)?.[1]).find((x) => x !== undefined);
    if (manifest !== undefined) add(i + 1, manifestCommand, manifest);
  });
  return claims;
}

/** The claims whose flag the real parser rejects as `Unknown option`. */
function rejectedClaims(claims: readonly FlagClaim[]): string[] {
  const rejected: string[] = [];
  for (const claim of claims) {
    const argv = claim.command === undefined ? [claim.flag] : [claim.command, claim.flag];
    try {
      parseCliArgs(argv);
    } catch (error) {
      // A known string flag given no value throws "argument missing" — that
      // is a parse of a REGISTERED flag, which is all this guard asserts.
      if (error instanceof Error && error.message.includes('Unknown option')) {
        rejected.push(`${claim.flag} (${claim.command ?? 'global'}) at ${claim.where}`);
      }
    }
  }
  return rejected;
}

function advertisingSources(): Array<{ where: string; text: string }> {
  const tsFiles = (dir: string, prefix: string): string[] =>
    readdirSync(join(SRC, dir))
      .filter((f) => f.startsWith(prefix) && f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map((f) => (dir === '.' ? f : `${dir}/${f}`));
  return [
    { where: 'docs/ENTRYPOINTS.md', text: readFileSync(ENTRYPOINTS, 'utf8') },
    ...[...tsFiles('.', 'cli'), ...tsFiles('cli', '')].map((file) => ({
      where: file,
      text: readFileSync(join(SRC, file), 'utf8'),
    })),
  ];
}

function allClaims(): FlagClaim[] {
  return advertisingSources()
    .flatMap(({ where, text }) => extractFlagClaims(where, text))
    .filter(
      (c) => !NOT_NEXUS_FLAGS.some((x) => c.where.startsWith(`${x.file}:`) && c.flag === x.flag)
    );
}

describe('#6693 guard: every advertised flag parses without Unknown option', () => {
  it('the extractor reports an unregistered flag (the guard can fail)', () => {
    const claims = extractFlagClaims(
      'fixture',
      [
        '  nexus-agents session list --limit 5 --no-such-flag-6693',
        "    process.stdout.write('  --another-unknown-6693  Does nothing\\n');",
      ].join('\n')
    );
    expect(rejectedClaims(claims)).toEqual([
      '--no-such-flag-6693 (session) at fixture:1',
      '--another-unknown-6693 (global) at fixture:2',
    ]);
  });

  it('finds the flags it is meant to cover (not an empty scan)', () => {
    const flags = new Set(allClaims().map((c) => c.flag));
    for (const expected of ['--limit', '--topic', '--task-type', '--strict', '--proposal']) {
      expect(flags).toContain(expected);
    }
  });

  it('every flag in ENTRYPOINTS.md and CLI help/usage strings is registered', () => {
    expect(rejectedClaims(allClaims())).toEqual([]);
  });
});
