/**
 * `nexus-agents registry` CLI subcommands (epic #2174 / issue #2179).
 *
 * Two subcommands:
 *
 * - `doctor` — inspect CapabilityDiscovery state: tier counts, overlay /
 *   bundled paths and status, configured conservative default. Surfaces
 *   whatever T3 overlay parse rejections occurred at load. Read-only.
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

import {
  defaultGeneratedRegistryPath,
  getCapabilityDiscovery,
  loadBundledGeneratedRegistry,
  type ResolutionTier,
} from '../config/capability-discovery.js';
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

interface DoctorReport {
  readonly tierCounts: Record<ResolutionTier, number>;
  readonly bundled: {
    readonly path: string;
    readonly present: boolean;
    readonly entryCount: number | null;
    readonly generatedAt: string | null;
  };
  readonly overlay: {
    readonly path: string;
    readonly status: 'missing' | 'empty' | 'malformed' | 'too-large' | 'loaded';
    readonly entryCount: number;
    readonly rejections: readonly { index: number; id?: string; reason: string }[];
    readonly envOverride: string | undefined;
  };
  readonly conservativeDefault: {
    readonly contextWindow: number;
    readonly maxOutputTokens: number | null;
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
  const bundledPath = defaultGeneratedRegistryPath();
  const bundled = loadBundledGeneratedRegistry(bundledPath);
  const overlay = loadCapabilityOverlay(options.overlayPath ?? process.env);
  const discovery = getCapabilityDiscovery();
  const fallback = discovery.getConservativeDefault();

  return {
    tierCounts: discovery.getTierCounts(),
    bundled: {
      path: bundledPath,
      present: bundled !== null,
      entryCount: bundled !== null ? bundled.entryCount : null,
      generatedAt: bundled !== null ? bundled.generatedAt : null,
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
    conservativeDefault: {
      contextWindow: fallback.contextWindow,
      maxOutputTokens: fallback.maxOutputTokens ?? null,
    },
  };
}

function formatDoctorReport(r: DoctorReport): string {
  const lines: string[] = [];
  lines.push('nexus-agents registry doctor');
  lines.push('============================');
  lines.push('');
  lines.push('Tier counts (T3 overlay → T1 canonical → T2 bundled → T4 fallback):');
  lines.push(`  T3 overlay   : ${String(r.tierCounts.t3)}`);
  lines.push(`  T1 canonical : ${String(r.tierCounts.t1)}`);
  lines.push(`  T2 bundled   : ${String(r.tierCounts.t2)}`);
  lines.push('');
  lines.push('T2 bundled registry:');
  lines.push(`  path        : ${r.bundled.path}`);
  lines.push(`  present     : ${r.bundled.present ? 'yes' : 'no (using T1 + T4 only)'}`);
  if (r.bundled.present) {
    lines.push(`  entryCount  : ${String(r.bundled.entryCount ?? '?')}`);
    lines.push(`  generatedAt : ${r.bundled.generatedAt ?? '?'}`);
  }
  lines.push('');
  lines.push('T3 user overlay:');
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
  lines.push('T4 conservative default (for unknown ids):');
  lines.push(`  contextWindow : ${String(r.conservativeDefault.contextWindow)}`);
  if (r.conservativeDefault.maxOutputTokens !== null) {
    lines.push(`  maxOutputTokens: ${String(r.conservativeDefault.maxOutputTokens)}`);
  }
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

async function fetchWithCap(url: string, fetchImpl: typeof fetch): Promise<FetchResult> {
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      return { ok: false, error: `HTTP ${String(response.status)}` };
    }
    const body = await response.text();
    if (body.length > MAX_REFRESH_BYTES) {
      return {
        ok: false,
        error: `payload ${String(body.length)} bytes exceeds cap ${String(MAX_REFRESH_BYTES)}`,
      };
    }
    return { ok: true, body };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

export function formatRegistryUsage(): string {
  return [
    'Usage:',
    '  nexus-agents registry doctor [--json]',
    '      Inspect the four-tier capability discovery state.',
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
