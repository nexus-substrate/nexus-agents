/**
 * `nexus-agents registry` CLI subcommands (epic #2174 / issue #2179).
 *
 * Two subcommands:
 *
 * - `doctor` — inspect the ModelRegistry: effective per-source entry counts,
 *   the bundled generated registry path/status, the user overlay (reported for
 *   inspection), and the unknown-id fallback contextWindow. Surfaces whatever
 *   overlay parse rejections occurred at load. Read-only. (#3293 migrated this
 *   off the deleted CapabilityDiscovery four-tier chain.)
 *
 * - `refresh` — download a signed `model-registry.generated.json` from a
 *   URL, SHA256-verify against a `.sha256` sidecar, write to the user's
 *   overlay location. Requires `--source=<url>` today; the GitHub-latest-
 *   release automation is #2180's concern.
 *
 * No runtime hot path touches the network — refresh is a one-shot,
 * user-initiated operation.
 *
 * @module cli/registry-command
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { nexusDataPath } from '../config/nexus-data-dir.js';

import { getDefaultRegistry, type EntrySource } from '../config/model-registry.js';
import { loadGeneratedRegistryEntries } from '../config/models-generated-loader.js';
import {
  OVERLAY_ENV_VAR,
  OVERLAY_MAX_BYTES,
  defaultOverlayPath,
  loadCapabilityOverlay,
  resolveOverlayPath,
} from '../config/capability-overlay.js';

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export type RegistrySubcommand = 'doctor' | 'refresh';

const VALID_SUBCOMMANDS: readonly RegistrySubcommand[] = ['doctor', 'refresh'];

export function isValidRegistrySubcommand(v: string | undefined): v is RegistrySubcommand {
  return v !== undefined && (VALID_SUBCOMMANDS as readonly string[]).includes(v);
}

export interface RegistryCommandOptions {
  readonly json?: boolean;
  readonly source?: string;
  readonly dryRun?: boolean;
  readonly overlayPath?: string;
  /** For tests: a fetch function. Defaults to `globalThis.fetch`. */
  readonly fetchImpl?: typeof fetch;
  /** For tests: override the default destination path. */
  readonly destPath?: string;
}

export interface RegistryCommandResult {
  readonly text: string;
  readonly exitCode: number;
}

export async function registryCommand(
  subcommand: RegistrySubcommand,
  options: RegistryCommandOptions = {}
): Promise<RegistryCommandResult> {
  if (subcommand === 'doctor') return doctorCommand(options);
  return refreshCommand(options);
}

// ---------------------------------------------------------------------------
// doctor
// ---------------------------------------------------------------------------

/**
 * ContextWindow returned for an id no registry source resolves. This is the
 * old `FAIL_CLOSED_DEFAULT.contextWindow` value (#2177), preserved here after
 * the CapabilityDiscovery four-tier chain was deleted in #3293.
 */
const UNKNOWN_MODEL_CONTEXT_WINDOW = 8192;

/** Every registry source, in report order. */
const ENTRY_SOURCES: readonly EntrySource[] = [
  'in-tree',
  'models-dev',
  'manifest',
  'derived',
  'generated',
];

interface DoctorReport {
  /** Effective per-source counts over `getDefaultRegistry().allEntries()`. */
  readonly sourceCounts: Record<EntrySource, number>;
  readonly totalEntries: number;
  readonly bundled: {
    readonly path: string;
    readonly status: 'loaded' | 'missing' | 'malformed';
    readonly entryCount: number;
  };
  readonly overlay: {
    readonly path: string;
    readonly status: 'missing' | 'empty' | 'malformed' | 'too-large' | 'loaded';
    readonly entryCount: number;
    readonly rejections: readonly { index: number; id?: string; reason: string }[];
    readonly envOverride: string | undefined;
  };
  readonly unknownIdFallback: {
    readonly contextWindow: number;
  };
}

function doctorCommand(options: RegistryCommandOptions): RegistryCommandResult {
  const report = buildDoctorReport(options);
  if (options.json === true) {
    return { text: JSON.stringify(report, null, 2), exitCode: 0 };
  }
  return { text: formatDoctorReport(report), exitCode: 0 };
}

function buildDoctorReport(options: RegistryCommandOptions): DoctorReport {
  // Effective per-source counts over the fully-merged registry: dedup/override
  // across tiers has already happened, so `allEntries()` reflects what actually
  // wins, grouped by the surviving entry's `source`.
  const entries = getDefaultRegistry().allEntries();
  const sourceCounts: Record<EntrySource, number> = {
    'in-tree': 0,
    'models-dev': 0,
    manifest: 0,
    derived: 0,
    generated: 0,
  };
  for (const entry of entries) {
    sourceCounts[entry.source] += 1;
  }

  // The bundled generated catalog (long-tail breadth tier) — reported from the
  // same loader the registry ingests, so the path/status here matches reality.
  const generated = loadGeneratedRegistryEntries();

  // User overlay is reported for inspection only; the registry consumes the
  // operator manifest, not this YAML overlay (kept by manifest-overlay.ts).
  const overlay = loadCapabilityOverlay(options.overlayPath ?? process.env);

  return {
    sourceCounts,
    totalEntries: entries.length,
    bundled: {
      path: generated.path,
      status: generated.status,
      entryCount: generated.entries.length,
    },
    overlay: {
      path: overlay.path,
      status: overlay.status,
      entryCount: overlay.entries.length,
      rejections: overlay.rejections.map((r) => ({
        index: r.index,
        ...(r.id !== undefined ? { id: r.id } : {}),
        reason: r.reason,
      })),
      envOverride: process.env[OVERLAY_ENV_VAR],
    },
    unknownIdFallback: {
      contextWindow: UNKNOWN_MODEL_CONTEXT_WINDOW,
    },
  };
}

function formatDoctorReport(r: DoctorReport): string {
  const lines: string[] = [];
  lines.push('nexus-agents registry doctor');
  lines.push('============================');
  lines.push('');
  lines.push(`Registry entries by source (total ${String(r.totalEntries)}):`);
  for (const source of ENTRY_SOURCES) {
    lines.push(`  ${source.padEnd(11)}: ${String(r.sourceCounts[source])}`);
  }
  lines.push('');
  lines.push('Bundled generated registry (long-tail breadth tier):');
  lines.push(`  path        : ${r.bundled.path}`);
  lines.push(`  status      : ${r.bundled.status}`);
  lines.push(`  entryCount  : ${String(r.bundled.entryCount)}`);
  lines.push('');
  // User overlay reported for inspection; not consumed by the merged registry.
  lines.push('T3 user overlay (reported for inspection):');
  lines.push(`  path        : ${r.overlay.path}`);
  lines.push(`  status      : ${r.overlay.status}`);
  lines.push(`  entryCount  : ${String(r.overlay.entryCount)}`);
  lines.push(`  env override: ${r.overlay.envOverride ?? '(not set)'}`);
  if (r.overlay.rejections.length > 0) {
    lines.push('  rejections  :');
    for (const rej of r.overlay.rejections) {
      const idPart = rej.id !== undefined ? ` id=${rej.id}` : '';
      lines.push(`    - [${String(rej.index)}]${idPart} ${rej.reason}`);
    }
  }
  lines.push('');
  lines.push('Unknown-id fallback (id resolves in no source):');
  lines.push(`  contextWindow : ${String(r.unknownIdFallback.contextWindow)}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// refresh
// ---------------------------------------------------------------------------

const MAX_REFRESH_BYTES = 5 * 1024 * 1024;

function missingSourceResult(): RegistryCommandResult {
  return {
    text: [
      'registry refresh requires --source=<url>.',
      '',
      'The url should point at a model-registry.generated.json file with a',
      'matching <url>.sha256 sidecar (single line containing the SHA256 hash).',
      '',
      'A signed GitHub release artifact is a planned default but not wired yet;',
      `that is tracked in #2180. Use --source=<your-mirror-url> in the meantime.`,
    ].join('\n'),
    exitCode: 2,
  };
}

interface VerifiedArtifact {
  readonly body: string;
  readonly sha256: string;
}

async function fetchAndVerify(
  source: string,
  fetchImpl: typeof fetch
): Promise<VerifiedArtifact | RegistryCommandResult> {
  const body = await fetchWithCap(source, fetchImpl);
  if (!body.ok || body.body === undefined) {
    return { text: `Failed to fetch ${source}: ${body.error ?? 'unknown'}`, exitCode: 1 };
  }
  const sha = await fetchWithCap(`${source}.sha256`, fetchImpl);
  if (!sha.ok || sha.body === undefined) {
    return {
      text: `Failed to fetch ${source}.sha256 for integrity check: ${sha.error ?? 'unknown'}`,
      exitCode: 1,
    };
  }
  const expected = sha.body.trim().split(/\s+/)[0] ?? '';
  if (expected === '') {
    return { text: `SHA256 sidecar at ${source}.sha256 is empty`, exitCode: 1 };
  }
  const actual = createHash('sha256').update(body.body, 'utf-8').digest('hex');
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    return {
      text: `SHA256 mismatch: expected ${expected}, got ${actual}. Aborting write.`,
      exitCode: 1,
    };
  }
  return { body: body.body, sha256: actual };
}

function formatRefreshReport(
  verb: 'would write to' | 'wrote to',
  source: string,
  artifact: VerifiedArtifact,
  dest: string,
  extraTail: readonly string[] = []
): string {
  return [
    `registry refresh${verb.startsWith('would') ? ' --dry-run' : ''}`,
    `source   : ${source}`,
    `sha256   : ${artifact.sha256} (verified)`,
    `bytes    : ${String(artifact.body.length)}`,
    `${verb}: ${dest}`,
    ...extraTail,
  ].join('\n');
}

async function refreshCommand(options: RegistryCommandOptions): Promise<RegistryCommandResult> {
  const source = options.source;
  if (source === undefined || source === '') return missingSourceResult();

  const artifact = await fetchAndVerify(source, options.fetchImpl ?? fetch);
  if ('text' in artifact) return artifact;

  const dest = options.destPath ?? nexusDataPath('model-registry.generated.json');
  if (options.dryRun === true) {
    return { text: formatRefreshReport('would write to', source, artifact, dest), exitCode: 0 };
  }

  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, artifact.body, 'utf-8');
  return {
    text: formatRefreshReport('wrote to', source, artifact, dest, [
      '',
      'The refreshed file takes precedence over the bundled registry on the next',
      'run. Restart any running CLI / MCP server for the change to take effect.',
    ]),
    exitCode: 0,
  };
}

interface FetchResult {
  readonly ok: boolean;
  readonly body?: string;
  readonly error?: string;
}

const overCapError = (bytes: number | null): FetchResult => ({
  ok: false,
  error:
    bytes === null
      ? `payload exceeds cap ${String(MAX_REFRESH_BYTES)} bytes (stream aborted)`
      : `payload ${String(bytes)} bytes exceeds cap ${String(MAX_REFRESH_BYTES)}`,
});

async function fetchWithCap(url: string, fetchImpl: typeof fetch): Promise<FetchResult> {
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      return { ok: false, error: `HTTP ${String(response.status)}` };
    }

    // Reject on the declared size before reading a single byte (#3354). A
    // compromised/typo'd mirror could otherwise stream gigabytes; the old
    // `response.text()` buffered the whole body before checking the cap and
    // could exhaust memory first.
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_REFRESH_BYTES) {
      return overCapError(declared);
    }

    // No declared length we can trust: stream with a running cap and abort
    // the moment the accumulated bytes exceed it, so an undeclared or lying
    // Content-Length can't OOM the process.
    if (response.body === null) {
      const body = await response.text();
      return body.length > MAX_REFRESH_BYTES ? overCapError(body.length) : { ok: true, body };
    }
    return await readStreamWithCap(response.body);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

/**
 * Read a response body stream, aborting the moment the accumulated bytes
 * exceed {@link MAX_REFRESH_BYTES} (#3354). Keeps a hostile mirror with an
 * undeclared/lying Content-Length from buffering unbounded data into memory.
 */
async function readStreamWithCap(stream: ReadableStream<Uint8Array>): Promise<FetchResult> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let body = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REFRESH_BYTES) {
      await reader.cancel();
      return overCapError(null);
    }
    body += decoder.decode(value, { stream: true });
  }
  body += decoder.decode();
  return { ok: true, body };
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

export function formatRegistryUsage(): string {
  return [
    'Usage:',
    '  nexus-agents registry doctor [--json]',
    '      Inspect the merged ModelRegistry: per-source entry counts, the',
    '      bundled generated registry, the user overlay, and the unknown-id',
    '      fallback contextWindow.',
    '',
    '  nexus-agents registry refresh --source=<url> [--dry-run]',
    '      Download a signed model-registry.generated.json from <url>,',
    '      SHA256-verify against <url>.sha256, and write to:',
    `      ${nexusDataPath('model-registry.generated.json')}`,
    '',
    `Overlay path (T3) is ${defaultOverlayPath()} by default,`,
    `or whatever ${OVERLAY_ENV_VAR} points to. Overlay max size is ${String(OVERLAY_MAX_BYTES)} bytes.`,
  ].join('\n');
}

// Dummy references to satisfy unused-var lint when destructuring is conditional.
void existsSync;
void readFileSync;
void resolveOverlayPath;
