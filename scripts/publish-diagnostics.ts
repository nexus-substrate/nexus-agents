/* eslint max-lines: ["error", { "max": 450, "skipBlankLines": true, "skipComments": true }] */
// One cohesive bounded filesystem/group reducer and fixed evidence schema (#7587);
// retain its safe I/O and admission checks under an enforced local ceiling (#6021).
/** Bounded reducer for npm 11.21.0 debug self-reports, never auth or artifact attestation. */
import * as fs from 'node:fs';
import { basename, join, resolve } from 'node:path';

export type PublishDiagnosticRejection =
  | 'invalid-operation'
  | 'directory-unavailable'
  | 'unsafe-entry'
  | 'resource-limit'
  | 'malformed-log'
  | 'outside-operation-window'
  | 'incomplete-publish-group'
  | 'ambiguous-group'
  | 'invalid-identity'
  | 'unexpected-publish-target'
  | 'unsupported-npm-version'
  | 'no-compatible-oidc-event'
  | 'contradictory-events'
  | 'no-publish-attempt';
export type PublishOidcCategory =
  | 'permission-context-skipped'
  | 'no-id-token-skipped'
  | 'id-token-response-invalid'
  | 'id-token-value-missing'
  | 'exchange-request-failed'
  | 'exchange-response-token-missing'
  | 'exchange-token-locally-set'
  | 'provenance-configuration-failed'
  | 'generic-oidc-failed';
export interface PublishDiagnosticIdentity {
  readonly npmVersion: string;
  readonly nodeVersion: string;
  /** Narrowly admitted declared argv paths; not realpath or executed-byte evidence. */
  readonly nodePath: string;
  readonly npmPath: string;
}
export interface PublishDiagnosticAttempt {
  readonly ordinal: number;
  readonly measurement: 'observed' | 'unmeasured';
  readonly provenance: 'npm-debug-self-report';
  readonly identity?: PublishDiagnosticIdentity;
  /** Labels correlated through the requested tar basename, not packed manifest identity. */
  readonly packageName?: string;
  readonly packageVersion?: string;
  readonly packageEvidence?: 'publish-target-basename';
  readonly oidc: readonly PublishOidcCategory[];
  readonly contradictory: boolean;
  readonly rejections: readonly PublishDiagnosticRejection[];
}
export interface PublishDiagnostics {
  readonly operationId: string;
  readonly measurement: 'observed' | 'unmeasured';
  readonly provenance: 'npm-debug-self-report';
  readonly attempts: readonly PublishDiagnosticAttempt[];
  readonly rejections: readonly PublishDiagnosticRejection[];
}
interface Operation {
  readonly id: string;
  readonly startedAtMs: number;
  readonly endedAtMs: number;
}
interface Event {
  readonly id: number;
  readonly level: string;
  readonly title: string;
  readonly lines: string[];
}
interface LogFile {
  readonly stamp: string;
  readonly rotation: number;
  readonly text: string;
}
type Failure = { readonly reason: PublishDiagnosticRejection };
const FILE_BYTES = 1_048_576;
const TOTAL_BYTES = 4 * FILE_BYTES;
const MAX_FILES = 64;
const LOG_NAME = /^(\d{4}-\d\d-\d\dT\d\d_\d\d_\d\d_\d{3}Z)-debug-([0-4])\.log$/;
const VERSION = /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/;
// Deliberately narrow documented CI paths; arbitrary paths cannot reach emitted identity.
const NODE_PATH =
  /^(?:\/opt\/hostedtoolcache\/node\/\d{1,3}\.\d{1,3}\.\d{1,3}\/x64|\/usr(?:\/local)?)\/bin\/node$/;
const NPM_PATH =
  /^(?:\/opt\/hostedtoolcache\/node\/\d{1,3}\.\d{1,3}\.\d{1,3}\/x64|\/usr(?:\/local)?)(?:\/bin\/npm|\/lib\/node_modules\/npm\/bin\/npm-cli\.js)$/;

function empty(operationId: string, reason: PublishDiagnosticRejection): PublishDiagnostics {
  return {
    operationId,
    measurement: 'unmeasured',
    provenance: 'npm-debug-self-report',
    attempts: [],
    rejections: [reason],
  };
}
function validOperation(operation: Operation): boolean {
  return (
    /^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/.test(operation.id) &&
    Number.isSafeInteger(operation.startedAtMs) &&
    Number.isSafeInteger(operation.endedAtMs) &&
    operation.startedAtMs >= 0 &&
    operation.endedAtMs >= operation.startedAtMs
  );
}

/** O_NOFOLLOW plus a bounded descriptor read; no raw filesystem errors escape. */
function readLog(path: string): string | Failure {
  let fd: number | undefined;
  try {
    fd = fs.openSync(
      path,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
    );
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1) return { reason: 'unsafe-entry' };
    if (stat.size > FILE_BYTES) return { reason: 'resource-limit' };
    const buffer = Buffer.alloc(FILE_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const bytes = fs.readSync(fd, buffer, length, buffer.length - length, null);
      if (bytes === 0) break;
      length += bytes;
    }
    if (length > FILE_BYTES) return { reason: 'resource-limit' };
    return buffer.subarray(0, length).toString('utf8');
  } catch {
    return { reason: 'directory-unavailable' };
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function entriesOf(directory: string): fs.Dirent[] | Failure {
  const handle = fs.opendirSync(directory);
  const entries: fs.Dirent[] = [];
  try {
    for (let entry = handle.readSync(); entry !== null; entry = handle.readSync()) {
      entries.push(entry);
      if (entries.length > MAX_FILES) return { reason: 'resource-limit' };
    }
  } finally {
    handle.closeSync();
  }
  return entries;
}
function readEntry(directory: string, entry: fs.Dirent): LogFile | Failure {
  if (!entry.isFile()) return { reason: 'unsafe-entry' };
  const match = LOG_NAME.exec(entry.name);
  if (match?.[1] === undefined || match[2] === undefined) return { reason: 'malformed-log' };
  const text = readLog(join(directory, entry.name));
  return typeof text === 'string' ? { stamp: match[1], rotation: Number(match[2]), text } : text;
}
function inventory(directory: string): LogFile[] | Failure {
  try {
    if (
      fs.lstatSync(directory).isSymbolicLink() ||
      fs.realpathSync(directory) !== resolve(directory)
    )
      return { reason: 'unsafe-entry' };
    const entries = entriesOf(directory);
    if ('reason' in entries) return entries;
    const logs: LogFile[] = [];
    let total = 0;
    for (const entry of entries) {
      const log = readEntry(directory, entry);
      if ('reason' in log) return log;
      total += Buffer.byteLength(log.text);
      if (total > TOTAL_BYTES) return { reason: 'resource-limit' };
      logs.push(log);
    }
    return logs;
  } catch {
    return { reason: 'directory-unavailable' };
  }
}

function eventOf(line: string): Event | undefined {
  const match =
    /^(\d{1,6}) (silly|verbose|info|notice|warn|error|http|timing)(?: ([^ ]*)(?: (.*))?)?$/.exec(
      line
    );
  if (match === null) return undefined;
  const id = Number(match[1]);
  const level = match[2] ?? '';
  // npm's common error/notice calls have no title; their body words are opaque.
  const title = level === 'error' || level === 'notice' ? '' : (match[3] ?? '');
  const message = match[4] ?? '';
  return { id, level, title, lines: [message] };
}
function appendEvent(events: Event[], line: string): Failure | undefined {
  const event = eventOf(line);
  if (event === undefined) return { reason: 'malformed-log' };
  const last = events.at(-1);
  if (last?.id === event.id) {
    if (last.level !== event.level || last.title !== event.title)
      return { reason: 'malformed-log' };
    last.lines.push(event.lines[0] ?? '');
  } else {
    if (event.id !== (last === undefined ? 0 : last.id + 1))
      return { reason: event.id === 0 ? 'ambiguous-group' : 'incomplete-publish-group' };
    events.push(event);
  }
  return undefined;
}
/** Repeated IDs are continuations, never fresh events inferred from message suffixes. */
function parseEvents(text: string): Event[] | Failure {
  if (!text.endsWith('\n')) return { reason: 'incomplete-publish-group' };
  const events: Event[] = [];
  for (const line of text.slice(0, -1).split('\n')) {
    const failure = appendEvent(events, line);
    if (failure !== undefined) return failure;
  }
  return events;
}

function single(events: readonly Event[], level: string, title: string): string | undefined {
  const matches = events.filter((event) => event.level === level && event.title === title);
  const event = matches[0];
  return matches.length === 1 && event?.lines.length === 1 ? event.lines[0] : undefined;
}
type ReportedPaths = Pick<PublishDiagnosticIdentity, 'nodePath' | 'npmPath'>;
function pathsOf(events: readonly Event[]): ReportedPaths | undefined {
  const cli = single(events, 'verbose', 'cli');
  if (cli === undefined) return undefined;
  const paths = cli.split(' ');
  if (paths.length !== 2) return undefined;
  const [nodePath = '', npmPath = ''] = paths;
  return NODE_PATH.test(nodePath) && NPM_PATH.test(npmPath) ? { nodePath, npmPath } : undefined;
}
type ReportedVersions = Pick<PublishDiagnosticIdentity, 'nodeVersion' | 'npmVersion'>;
function versionsOf(events: readonly Event[]): ReportedVersions | undefined {
  const versions = events.filter((e) => e.level === 'info' && e.title === 'using');
  if (versions.length !== 2 || versions.some((e) => e.lines.length !== 1)) return undefined;
  const [npm = '', node = ''] = versions.map((e) => e.lines[0]);
  if (!npm.startsWith('npm@') || !node.startsWith('node@v')) return undefined;
  const npmVersion = npm.slice(4);
  const nodeVersion = node.slice(5);
  return VERSION.test(npmVersion) && VERSION.test(nodeVersion.slice(1))
    ? { npmVersion, nodeVersion }
    : undefined;
}
function identityOf(events: readonly Event[]): PublishDiagnosticIdentity | undefined {
  const paths = pathsOf(events);
  const versions = versionsOf(events);
  return paths === undefined || versions === undefined ? undefined : { ...paths, ...versions };
}
function argvOf(raw: string | undefined): string[] | undefined {
  if (raw === undefined || !/^"(?:[^"\\]|\\.)*"(?: "(?:[^"\\]|\\.)*")*$/.test(raw))
    return undefined;
  try {
    const argv: unknown = JSON.parse(`[${raw.replace(/" "/g, '","')}]`);
    if (!Array.isArray(argv) || argv.some((a) => typeof a !== 'string')) return undefined;
    return argv as string[];
  } catch {
    return undefined;
  }
}
function requestedTarball(events: readonly Event[]): string | undefined {
  const title = single(events, 'verbose', 'title');
  const argv = argvOf(single(events, 'verbose', 'argv'));
  if (argv?.[0] !== 'publish' || argv.includes('--dry-run')) return undefined;
  const targets = argv.filter((a) => /\.(?:tgz|tar\.gz)$/.test(a));
  const target = targets[0];
  return targets.length === 1 && title === `npm publish ${target ?? ''}` ? target : undefined;
}

function targetOf(
  events: readonly Event[],
  expected: ReadonlyMap<string, string>
):
  | { packageName: string; packageVersion: string; packageEvidence: 'publish-target-basename' }
  | undefined {
  const requested = requestedTarball(events);
  if (requested === undefined) return undefined;
  const target = basename(requested);
  const candidates = [...expected].filter(
    ([name, version]) =>
      /^(?:@[a-z0-9][a-z0-9._-]{0,63}\/)?[a-z0-9][a-z0-9._-]{0,63}$/.test(name) &&
      VERSION.test(version) &&
      `${name.replace('@', '').replace('/', '-')}-${version}.tgz` === target
  );
  if (candidates.length !== 1) return undefined;
  const found = candidates[0];
  return found === undefined
    ? undefined
    : {
        packageName: found[0],
        packageVersion: found[1],
        packageEvidence: 'publish-target-basename',
      };
}

function terminalPresent(events: readonly Event[]): boolean {
  const exit = single(events, 'verbose', 'exit');
  if (exit === undefined || !/^(?:0|[1-9]\d{0,2})$/.test(exit)) return false;
  if (exit === '0')
    return (
      single(events, 'info', 'ok') === '' &&
      !events.some((e) => e.level === 'verbose' && e.title === 'code')
    );
  return (
    single(events, 'verbose', 'code') === exit &&
    !events.some((e) => e.level === 'info' && e.title === 'ok')
  );
}

const EXACT_EVENTS: Readonly<Record<string, PublishOidcCategory | undefined>> = {
  'silly|Skipped because incorrect permissions for id-token within GitHub workflow':
    'permission-context-skipped',
  'silly|Skipped because no id_token available': 'no-id-token-skipped',
  'verbose|Failed to fetch id_token from GitHub: received an invalid response':
    'id-token-response-invalid',
  'verbose|Failed to fetch id_token from GitHub: missing value': 'id-token-value-missing',
  'verbose|Failed because token exchange was missing the token in the response body':
    'exchange-response-token-missing',
  'verbose|Successfully retrieved and set token': 'exchange-token-locally-set',
};
function categoryOf(event: Event): PublishOidcCategory | undefined {
  if (event.title !== 'oidc') return undefined;
  const message = event.lines[0] ?? '';
  const exact = EXACT_EVENTS[`${event.level}|${message}`];
  if (exact !== undefined) return exact;
  if (event.level !== 'verbose') return undefined;
  if (message.startsWith('Failed token exchange request with body message: '))
    return 'exchange-request-failed';
  if (message.startsWith('Failed to set provenance with message: '))
    return 'provenance-configuration-failed';
  if (message.startsWith('Failure with message: ')) return 'generic-oidc-failed';
  return undefined;
}

function completeHeader(events: readonly Event[]): boolean {
  const first = events[0];
  return (
    first?.level === 'verbose' &&
    first.title === 'cli' &&
    single(events, 'verbose', 'cli') !== undefined &&
    single(events, 'verbose', 'title') !== undefined &&
    single(events, 'verbose', 'argv') !== undefined &&
    events.filter((e) => e.level === 'info' && e.title === 'using').length === 2 &&
    terminalPresent(events)
  );
}
function observedCategories(
  events: readonly Event[],
  identity: PublishDiagnosticIdentity | undefined,
  rejections: PublishDiagnosticRejection[]
): PublishOidcCategory[] {
  if (identity === undefined || rejections.length > 0) return [];
  if (identity.npmVersion !== '11.21.0') {
    rejections.push('unsupported-npm-version');
    return [];
  }
  const categories = events
    .map(categoryOf)
    .filter((c): c is PublishOidcCategory => c !== undefined);
  if (categories.length === 0) rejections.push('no-compatible-oidc-event');
  return categories;
}
function contradictoryEvents(oidc: readonly PublishOidcCategory[]): boolean {
  // npm's known early returns and token setup are mutually exclusive per call.
  // Generic/provenance failures do not establish which auth branch was reached.
  const terminal = oidc.filter(
    (c) => c !== 'generic-oidc-failed' && c !== 'provenance-configuration-failed'
  );
  return new Set(terminal).size > 1;
}
function assess(
  events: readonly Event[],
  expected: ReadonlyMap<string, string>,
  ordinal: number
): PublishDiagnosticAttempt | undefined {
  const title = single(events, 'verbose', 'title');
  if (
    title !== undefined &&
    /^npm (?:config|--version|view|info|pack|install|dist-tag)(?: |$)/.test(title)
  )
    return undefined;
  const rejections: PublishDiagnosticRejection[] = [];
  const identity = identityOf(events);
  const target = targetOf(events, expected);
  if (identity === undefined) rejections.push('invalid-identity');
  if (target === undefined) rejections.push('unexpected-publish-target');
  if (!completeHeader(events)) rejections.push('incomplete-publish-group');
  const oidc = observedCategories(events, identity, rejections);
  const contradictory = contradictoryEvents(oidc);
  if (contradictory) rejections.push('contradictory-events');
  return {
    ordinal,
    measurement: rejections.length === 0 ? 'observed' : 'unmeasured',
    provenance: 'npm-debug-self-report',
    ...(identity ? { identity } : {}),
    ...(target ?? {}),
    oidc,
    contradictory,
    rejections,
  };
}

function parseGroup(group: readonly LogFile[], operation: Operation): Event[] | Failure {
  const stamp = group[0]?.stamp ?? '';
  const timestamp = Date.parse(stamp.replace(/T(\d\d)_(\d\d)_(\d\d)_(\d{3})Z$/, 'T$1:$2:$3.$4Z'));
  if (
    !Number.isFinite(timestamp) ||
    timestamp < operation.startedAtMs ||
    timestamp > operation.endedAtMs
  )
    return { reason: 'outside-operation-window' };
  if (group.length >= 5 || group.some((log, index) => log.rotation !== index))
    return { reason: 'incomplete-publish-group' };
  if (group.some((log) => !log.text.endsWith('\n'))) return { reason: 'incomplete-publish-group' };
  return parseEvents(group.map((log) => log.text).join(''));
}
/** Complete fresh groups only. The wrapper must supply a fresh owned directory and operation window. */
export function collectPublishDiagnostics(
  directory: string,
  expectedVersions: ReadonlyMap<string, string>,
  operation: Operation
): PublishDiagnostics {
  if (!validOperation(operation)) return empty('invalid-operation', 'invalid-operation');
  const logs = inventory(directory);
  if ('reason' in logs) return empty(operation.id, logs.reason);
  const attempts: PublishDiagnosticAttempt[] = [];
  const rejections: PublishDiagnosticRejection[] = [];
  const stamps = [...new Set(logs.map((log) => log.stamp))].sort();
  for (const stamp of stamps) {
    const group = logs.filter((log) => log.stamp === stamp).sort((a, b) => a.rotation - b.rotation);
    const parsed = parseGroup(group, operation);
    if ('reason' in parsed) {
      rejections.push(parsed.reason);
      continue;
    }
    const attempt = assess(parsed, expectedVersions, attempts.length);
    if (attempt !== undefined) attempts.push(attempt);
  }
  if (attempts.length === 0) rejections.push('no-publish-attempt');
  const measured =
    attempts.length > 0 &&
    rejections.length === 0 &&
    !attempts.some((a) => a.measurement !== 'observed');
  return {
    operationId: operation.id,
    measurement: measured ? 'observed' : 'unmeasured',
    provenance: 'npm-debug-self-report',
    attempts,
    rejections,
  };
}
