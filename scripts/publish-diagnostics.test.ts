/** Offline npm 11.21.0 debug-format controls; no npm/auth/network execution. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FAKE_BEARER_TOKEN,
  FAKE_GITHUB_PAT,
} from '../packages/nexus-agents/src/testing/test-secrets.js';

const ROOTS: string[] = [];
const EXPECTED = new Map([['nexus-agents', '13.0.0']]);
const NODE_PATH = '/opt/hostedtoolcache/node/24.15.0/x64/bin/node';
const NPM_PATH = '/opt/hostedtoolcache/node/24.15.0/x64/lib/node_modules/npm/bin/npm-cli.js';
const TARGET = 'nexus-agents-13.0.0.tgz';
const CANARY = 'TEST_FAKE_PRIVATE_BODY_CANARY_7587';
type Event = readonly [level: string, title: string, message: string];
type Operation = { id: string; startedAtMs: number; endedAtMs: number };
type Attempt = {
  ordinal: number;
  measurement: 'observed' | 'unmeasured';
  provenance: 'npm-debug-self-report';
  identity?: { npmVersion: string; nodeVersion: string; nodePath: string; npmPath: string };
  packageName?: string;
  packageVersion?: string;
  packageEvidence?: 'publish-target-basename';
  oidc: readonly string[];
  contradictory: boolean;
  rejections: readonly string[];
};
type Report = {
  operationId: string;
  measurement: 'observed' | 'unmeasured';
  provenance: 'npm-debug-self-report';
  attempts: readonly Attempt[];
  rejections: readonly string[];
};

// Dynamic import lets RED enumerate the behavioral controls before the module exists.
async function collect(directory: string, operation: Operation): Promise<Report> {
  const module = await import('./publish-diagnostics.js');
  return module.collectPublishDiagnostics(directory, EXPECTED, operation);
}

function setup(): { dir: string; operation: Operation; stamp: string } {
  const dir = mkdtempSync(join(tmpdir(), 'nexus-publish-diagnostics-'));
  ROOTS.push(dir);
  const startedAtMs = Date.now() - 1000;
  return {
    dir,
    operation: { id: '7587-offline-operation', startedAtMs, endedAtMs: Date.now() + 1000 },
    stamp: new Date(startedAtMs + 100).toISOString().replace(/[:.]/g, '_'),
  };
}

/** npm format.js repeats the same numeric ID/level/title on multiline suffixes. */
function format(events: readonly Event[], firstId = 0): string {
  return events
    .map(([level, title, message], offset) =>
      message
        .split('\n')
        .map(
          (line) =>
            `${String(firstId + offset)} ${level}${title === '' ? '' : ` ${title}`}${line === '' ? '' : ` ${line}`}\n`
        )
        .join('')
    )
    .join('');
}

function header(npm = '11.21.0', target = TARGET): Event[] {
  return [
    ['verbose', 'cli', `${NODE_PATH} ${NPM_PATH}`],
    ['info', 'using', `npm@${npm}`],
    ['info', 'using', 'node@v24.15.0'],
    ['verbose', 'title', `npm publish ${target}`],
    ['verbose', 'argv', `"publish" "--ignore-scripts" "${target}" "--tag" "next" "--json"`],
  ];
}
const TOKEN_SET: Event = ['verbose', 'oidc', 'Successfully retrieved and set token'];
const EXCHANGE_FAILED: Event = [
  'verbose',
  'oidc',
  'Failed token exchange request with body message: TEST_FAKE_BODY',
];
const END: Event[] = [
  ['verbose', 'exit', '1'],
  ['verbose', 'code', '1'],
];

function writeGroup(
  dir: string,
  stamp: string,
  events: readonly Event[],
  rotation = 0,
  firstId = 0
): string {
  const path = join(dir, `${stamp}-debug-${String(rotation)}.log`);
  writeFileSync(path, format(events, firstId));
  return path;
}

function expectUnmeasured(report: Report, reason?: string): void {
  expect(report.measurement).toBe('unmeasured');
  if (reason !== undefined) {
    expect([...report.rejections, ...report.attempts.flatMap((a) => a.rejections)]).toContain(
      reason
    );
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of ROOTS.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('operation-bound npm debug self-report', () => {
  it('admits a complete group-0 publish header/target/terminal and fixed OIDC category', async () => {
    const { dir, operation, stamp } = setup();
    writeGroup(dir, stamp, [...header(), TOKEN_SET, ...END]);
    const result = await collect(dir, operation);
    expect(result).toMatchObject({
      operationId: operation.id,
      measurement: 'observed',
      provenance: 'npm-debug-self-report',
      rejections: [],
    });
    expect(result.attempts).toEqual([
      {
        ordinal: 0,
        measurement: 'observed',
        provenance: 'npm-debug-self-report',
        identity: {
          npmVersion: '11.21.0',
          nodeVersion: 'v24.15.0',
          nodePath: NODE_PATH,
          npmPath: NPM_PATH,
        },
        packageName: 'nexus-agents',
        packageVersion: '13.0.0',
        packageEvidence: 'publish-target-basename',
        oidc: ['exchange-token-locally-set'],
        contradictory: false,
        rejections: [],
      },
    ]);
  });

  it('admits native successful exit zero followed by info ok without a code record', async () => {
    const { dir, operation, stamp } = setup();
    writeGroup(dir, stamp, [...header(), TOKEN_SET, ['verbose', 'exit', '0'], ['info', 'ok', '']]);
    expect((await collect(dir, operation)).measurement).toBe('observed');
  });

  it('does not treat duplicate failure-code records as absence on a zero-exit group', async () => {
    const { dir, operation, stamp } = setup();
    writeGroup(dir, stamp, [
      ...header(),
      TOKEN_SET,
      ['verbose', 'exit', '0'],
      ['info', 'ok', ''],
      ['verbose', 'code', '1'],
      ['verbose', 'code', '2'],
    ]);
    expectUnmeasured(await collect(dir, operation), 'incomplete-publish-group');
  });

  it('keeps a generic direct package.tgz target unmeasured', async () => {
    const { dir, operation, stamp } = setup();
    writeGroup(dir, stamp, [...header('11.21.0', 'package.tgz'), TOKEN_SET, ...END]);
    expectUnmeasured(await collect(dir, operation), 'unexpected-publish-target');
  });

  it('cannot bind a target when no expected package scope was supplied', async () => {
    const { dir, operation, stamp } = setup();
    writeGroup(dir, stamp, [...header(), TOKEN_SET, ...END]);
    const module = await import('./publish-diagnostics.js');
    expectUnmeasured(
      module.collectPublishDiagnostics(dir, new Map(), operation),
      'unexpected-publish-target'
    );
  });

  it('reports child B from its log, never newest preflight A', async () => {
    const { dir, operation, stamp } = setup();
    const events = [...header(), TOKEN_SET, ...END];
    // Fake only the external child: actually writes npm-format B; no npm executes.
    execFileSync(
      process.execPath,
      [
        '-e',
        'require("node:fs").writeFileSync(process.argv[1], process.argv[2])',
        join(dir, `${stamp}-debug-0.log`),
        format(events),
      ],
      { env: {}, stdio: 'pipe' }
    );
    const newer = new Date(operation.startedAtMs + 500).toISOString().replace(/[:.]/g, '_');
    writeGroup(dir, newer, [
      ...header('11.19.1').slice(0, 3),
      ['verbose', 'title', 'npm --version'],
      ['verbose', 'argv', '"--version"'],
      ...END,
    ]);
    const result = await collect(dir, operation);
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]?.identity?.npmVersion).toBe('11.21.0');
    expect(result.attempts[0]?.oidc).toEqual(['exchange-token-locally-set']);
  });

  it('preserves distinct publish attempts and contradictory observations', async () => {
    const { dir, operation, stamp } = setup();
    writeGroup(dir, stamp, [...header(), EXCHANGE_FAILED, TOKEN_SET, ...END]);
    const later = new Date(operation.startedAtMs + 200).toISOString().replace(/[:.]/g, '_');
    writeGroup(dir, later, [...header(), EXCHANGE_FAILED, ...END]);
    const result = await collect(dir, operation);
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]).toMatchObject({
      contradictory: true,
      oidc: ['exchange-request-failed', 'exchange-token-locally-set'],
    });
    expect(result.attempts[1]?.oidc).toEqual(['exchange-request-failed']);
    expectUnmeasured(result, 'contradictory-events');
  });

  it.each([
    [
      'permission-context-skipped',
      'silly',
      'Skipped because incorrect permissions for id-token within GitHub workflow',
    ],
    ['no-id-token-skipped', 'silly', 'Skipped because no id_token available'],
    [
      'id-token-response-invalid',
      'verbose',
      'Failed to fetch id_token from GitHub: received an invalid response',
    ],
    ['id-token-value-missing', 'verbose', 'Failed to fetch id_token from GitHub: missing value'],
    [
      'exchange-response-token-missing',
      'verbose',
      'Failed because token exchange was missing the token in the response body',
    ],
  ])(
    'preserves mutually exclusive %s and exchange-failed outcomes as unmeasured',
    async (category, level, message) => {
      const { dir, operation, stamp } = setup();
      writeGroup(dir, stamp, [...header(), [level, 'oidc', message], EXCHANGE_FAILED, ...END]);
      const result = await collect(dir, operation);
      expect(result.attempts[0]).toMatchObject({
        measurement: 'unmeasured',
        contradictory: true,
        oidc: [category, 'exchange-request-failed'],
        rejections: ['contradictory-events'],
      });
      expectUnmeasured(result, 'contradictory-events');
    }
  );

  it('does not manufacture an auth cause from an ambiguous generic failure after token setup', async () => {
    const { dir, operation, stamp } = setup();
    writeGroup(dir, stamp, [
      ...header(),
      TOKEN_SET,
      ['verbose', 'oidc', 'Failure with message: TEST_FAKE_AMBIGUOUS'],
      ...END,
    ]);
    const result = await collect(dir, operation);
    expect(result.attempts[0]).toMatchObject({
      measurement: 'observed',
      contradictory: false,
      oidc: ['exchange-token-locally-set', 'generic-oidc-failed'],
    });
  });

  it('keeps repeated observations of the same return outcome without inventing disagreement', async () => {
    const { dir, operation, stamp } = setup();
    writeGroup(dir, stamp, [...header(), EXCHANGE_FAILED, EXCHANGE_FAILED, ...END]);
    const result = await collect(dir, operation);
    expect(result.attempts[0]).toMatchObject({
      measurement: 'observed',
      contradictory: false,
      oidc: ['exchange-request-failed', 'exchange-request-failed'],
    });
  });

  it.each(['error', 'notice'])(
    'admits empty untitled %s events and opaque multiline bodies without creating OIDC events',
    async (level) => {
      const { dir, operation, stamp } = setup();
      writeGroup(dir, stamp, [
        ...header(),
        [level, '', `\n${CANARY}\nSuccessfully retrieved and set token`],
        EXCHANGE_FAILED,
        ...END,
      ]);
      const result = await collect(dir, operation);
      expect(result.measurement).toBe('observed');
      expect(result.attempts[0]?.oidc).toEqual(['exchange-request-failed']);
      expect(JSON.stringify(result)).not.toContain(CANARY);
    }
  );

  it.each([
    [
      'silly',
      'Skipped because incorrect permissions for id-token within GitHub workflow',
      'permission-context-skipped',
    ],
    ['silly', 'Skipped because no id_token available', 'no-id-token-skipped'],
    [
      'verbose',
      'Failed to fetch id_token from GitHub: received an invalid response',
      'id-token-response-invalid',
    ],
    ['verbose', 'Failed to fetch id_token from GitHub: missing value', 'id-token-value-missing'],
    [
      'verbose',
      'Failed because token exchange was missing the token in the response body',
      'exchange-response-token-missing',
    ],
    ['verbose', 'Failure with message: TEST_FAKE_PRIVATE_ERROR', 'generic-oidc-failed'],
    [
      'verbose',
      'Failed to set provenance with message: TEST_FAKE_PRIVATE_ERROR',
      'provenance-configuration-failed',
    ],
  ])('classifies only the reviewed %s OIDC start %s', async (level, message, category) => {
    const { dir, operation, stamp } = setup();
    writeGroup(dir, stamp, [...header(), [level, 'oidc', message], ...END]);
    expect((await collect(dir, operation)).attempts[0]?.oidc).toEqual([category]);
  });

  it('does not promote a repeated-ID multiline suffix to a token-set event', async () => {
    const { dir, operation, stamp } = setup();
    writeGroup(dir, stamp, [
      ...header(),
      [
        'verbose',
        'oidc',
        `${EXCHANGE_FAILED[2]}\nSuccessfully retrieved and set token\n6 verbose oidc Successfully retrieved and set token`,
      ],
      ...END,
    ]);
    const result = await collect(dir, operation);
    expect(result.attempts[0]?.oidc).toEqual(['exchange-request-failed']);
  });

  it('never serializes raw suffixes, URLs, bodies, credentials or arbitrary log paths', async () => {
    const { dir, operation, stamp } = setup();
    const suffix = [
      CANARY,
      FAKE_GITHUB_PAT,
      FAKE_BEARER_TOKEN,
      'https://example.test/TEST_FAKE_URL',
      'Authorization: TEST_FAKE_AUTH',
    ].join('\n');
    writeGroup(dir, stamp, [
      ...header(),
      ['verbose', 'oidc', `Failed token exchange request with body message: ${suffix}`],
      ['error', '', suffix],
      ...END,
    ]);
    const stdout = vi.spyOn(process.stdout, 'write');
    const stderr = vi.spyOn(process.stderr, 'write');
    const result = await collect(dir, operation);
    const serialized = JSON.stringify({
      result,
      stdout: stdout.mock.calls,
      stderr: stderr.mock.calls,
    });
    for (const canary of [
      CANARY,
      FAKE_GITHUB_PAT,
      FAKE_BEARER_TOKEN,
      'TEST_FAKE_URL',
      'TEST_FAKE_AUTH',
      dir,
    ])
      expect(serialized).not.toContain(canary);
    expect(result.attempts[0]?.oidc).toEqual(['exchange-request-failed']);
  });

  it.each([
    '',
    'Cleared previous exchange token',
    'Successfully retrieved and set token TEST_FAKE_FORGED_SUFFIX',
  ])('keeps silent or unknown evidence unmeasured: %j', async (message) => {
    const { dir, operation, stamp } = setup();
    writeGroup(dir, stamp, [
      ...header(),
      ...(message === '' ? [] : [['verbose', 'oidc', message] as Event]),
      ...END,
    ]);
    expectUnmeasured(await collect(dir, operation), 'no-compatible-oidc-event');
  });

  it('does not classify a known message under a different namespace or level', async () => {
    const { dir, operation, stamp } = setup();
    writeGroup(dir, stamp, [
      ...header(),
      ['error', 'oidc', TOKEN_SET[2]],
      ['verbose', 'other', TOKEN_SET[2]],
      ...END,
    ]);
    expectUnmeasured(await collect(dir, operation), 'no-compatible-oidc-event');
  });

  it('retains a validated unsupported client identity without promoting OIDC compatibility', async () => {
    const { dir, operation, stamp } = setup();
    writeGroup(dir, stamp, [...header('11.19.1'), TOKEN_SET, ...END]);
    const result = await collect(dir, operation);
    expect(result.attempts[0]?.identity?.npmVersion).toBe('11.19.1');
    expect(result.attempts[0]?.oidc).toEqual([]);
    expectUnmeasured(result, 'unsupported-npm-version');
  });

  it.each([0, 1, 2, 3, 4, 6])(
    'rejects a missing binding or terminal record at index %i',
    async (missing) => {
      const { dir, operation, stamp } = setup();
      const events = [...header(), TOKEN_SET, ...END].filter((_, index) => index !== missing);
      writeGroup(dir, stamp, events);
      expectUnmeasured(await collect(dir, operation), 'incomplete-publish-group');
    }
  );

  it.each(['nexus-agents-12.8.0.tgz', 'foreign-package-13.0.0.tgz'])(
    'rejects foreign/wrong-version publish target %s',
    async (target) => {
      const { dir, operation, stamp } = setup();
      writeGroup(dir, stamp, [...header('11.21.0', target), TOKEN_SET, ...END]);
      expectUnmeasured(await collect(dir, operation), 'unexpected-publish-target');
    }
  );

  it('rejects inconsistent title versus argv targets', async () => {
    const { dir, operation, stamp } = setup();
    const events = header();
    events[4] = ['verbose', 'argv', '"publish" "foreign-1.0.0.tgz"'];
    writeGroup(dir, stamp, [...events, TOKEN_SET, ...END]);
    const result = await collect(dir, operation);
    expectUnmeasured(result, 'unexpected-publish-target');
    expect(result.attempts[0]?.oidc).toEqual([]);
  });

  it.each([
    `/home/${CANARY}/bin/node /usr/bin/npm`,
    `${NODE_PATH} /tmp/${CANARY}/npm`,
    `${NODE_PATH} ${NPM_PATH} extra`,
    `${NODE_PATH}\n${NPM_PATH}`,
  ])('does not export arbitrary or ambiguous identity paths', async (paths) => {
    const { dir, operation, stamp } = setup();
    const events = header();
    events[0] = ['verbose', 'cli', paths];
    writeGroup(dir, stamp, [...events, TOKEN_SET, ...END]);
    const result = await collect(dir, operation);
    expectUnmeasured(result, 'invalid-identity');
    expect(result.attempts[0]?.identity).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain(CANARY);
  });

  it('rejects duplicate/appended group-0 headers rather than overwriting identity', async () => {
    const { dir, operation, stamp } = setup();
    const path = writeGroup(dir, stamp, [...header(), TOKEN_SET, ...END]);
    writeFileSync(
      path,
      format([...header(), TOKEN_SET, ...END]) + format([...header('11.19.1'), TOKEN_SET, ...END])
    );
    expectUnmeasured(await collect(dir, operation), 'ambiguous-group');
  });

  it('never admits an old group because its file mtime is newest', async () => {
    const { dir, operation } = setup();
    const stale = new Date(operation.startedAtMs - 60_000).toISOString().replace(/[:.]/g, '_');
    const path = writeGroup(dir, stale, [...header(), TOKEN_SET, ...END]);
    utimesSync(path, new Date(), new Date());
    expectUnmeasured(await collect(dir, operation), 'outside-operation-window');
  });

  it('rejects future groups outside this operation', async () => {
    const { dir, operation } = setup();
    const stamp = new Date(operation.endedAtMs + 60_000).toISOString().replace(/[:.]/g, '_');
    writeGroup(dir, stamp, [...header(), TOKEN_SET, ...END]);
    expectUnmeasured(await collect(dir, operation), 'outside-operation-window');
  });

  it.each(['empty', 'helper', 'missing'])(
    'names unavailable/no publisher evidence: %s',
    async (kind) => {
      const { dir, operation, stamp } = setup();
      if (kind === 'helper')
        writeGroup(dir, stamp, [
          ...header().slice(0, 3),
          ['verbose', 'title', 'npm config ls'],
          ['verbose', 'argv', '"config" "ls"'],
          ...END,
        ]);
      const result = await collect(kind === 'missing' ? join(dir, 'missing') : dir, operation);
      expectUnmeasured(result);
      expect(result.attempts).toEqual([]);
      expect(result.rejections.length).toBeGreaterThan(0);
    }
  );

  it('rejects symlinked files without reading or disclosing their targets', async () => {
    const { dir, operation, stamp } = setup();
    const targetDir = mkdtempSync(join(tmpdir(), 'nexus-publish-link-target-'));
    ROOTS.push(targetDir);
    const outside = join(targetDir, CANARY);
    writeFileSync(outside, format([...header(), TOKEN_SET, ...END]));
    symlinkSync(outside, join(dir, `${stamp}-debug-0.log`));
    expectUnmeasured(await collect(dir, operation), 'unsafe-entry');
  });

  it('rejects a symlinked log directory', async () => {
    const { dir, operation, stamp } = setup();
    const actual = join(dir, 'actual');
    mkdirSync(actual);
    writeGroup(actual, stamp, [...header(), TOKEN_SET, ...END]);
    const link = join(dir, 'link');
    symlinkSync(actual, link);
    expectUnmeasured(await collect(link, operation), 'unsafe-entry');
  });

  it.each(['no-group-zero', 'rotation-gap', 'rotation-cap', 'event-gap', 'no-final-newline'])(
    'rejects partial retained evidence: %s',
    async (kind) => {
      const { dir, operation, stamp } = setup();
      const events = [...header(), TOKEN_SET, ...END];
      if (kind === 'no-group-zero') writeGroup(dir, stamp, events, 1);
      if (kind === 'rotation-gap') {
        writeGroup(dir, stamp, header());
        writeGroup(dir, stamp, [TOKEN_SET, ...END], 2, 5);
      }
      if (kind === 'rotation-cap') {
        for (let n = 0; n < 5; n++)
          writeGroup(dir, stamp, n === 0 ? header() : [TOKEN_SET], n, n === 0 ? 0 : n + 4);
      }
      if (kind === 'event-gap')
        writeFileSync(
          join(dir, `${stamp}-debug-0.log`),
          format(header()) + format([TOKEN_SET, ...END], 7)
        );
      if (kind === 'no-final-newline')
        writeFileSync(join(dir, `${stamp}-debug-0.log`), format(events).trimEnd());
      expectUnmeasured(await collect(dir, operation));
    }
  );

  it.each(['bytes', 'files'])('bounds collection resource %s without raw errors', async (kind) => {
    const { dir, operation, stamp } = setup();
    if (kind === 'bytes') writeFileSync(join(dir, `${stamp}-debug-0.log`), 'x'.repeat(1_048_577));
    else for (let n = 0; n < 65; n++) writeFileSync(join(dir, `TEST_FAKE_${String(n)}`), '');
    expectUnmeasured(await collect(dir, operation), 'resource-limit');
  });

  it('rejects malformed event lines and re-used IDs with a different prefix', async () => {
    const { dir, operation, stamp } = setup();
    writeFileSync(
      join(dir, `${stamp}-debug-0.log`),
      format(header()) +
        '5 verbose oidc TEST_FAKE_UNKNOWN\n5 info using npm@11.21.0\n' +
        format(END, 6)
    );
    expectUnmeasured(await collect(dir, operation), 'malformed-log');
  });

  it('does not echo an invalid operation identifier or accept a reversed window', async () => {
    const { dir, operation, stamp } = setup();
    writeGroup(dir, stamp, [...header(), TOKEN_SET, ...END]);
    const result = await collect(dir, {
      id: `${CANARY}\n`,
      startedAtMs: operation.endedAtMs,
      endedAtMs: operation.startedAtMs,
    });
    expectUnmeasured(result, 'invalid-operation');
    expect(JSON.stringify(result)).not.toContain(CANARY);
  });
});
