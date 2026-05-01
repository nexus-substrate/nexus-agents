/**
 * User YAML overlay loader for CapabilityDiscovery's T3 tier (#2178).
 *
 * Reads user-supplied model capability overrides from a YAML file. Fully
 * optional — missing file, empty file, malformed YAML, and schema-invalid
 * entries all return the empty overlay with structured warnings instead of
 * throwing. Operators use this to fix broken bundled / canonical entries
 * without needing an npm release, or to declare models the curated T1 /
 * generated T2 tiers don't cover.
 *
 * Precedent: LiteLLM's `register_model({...})` + aider's
 * `aider/resources/model-settings.yml`.
 *
 * @module config/capability-overlay
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { nexusDataPath } from './nexus-data-dir.js';

import type { ILogger } from '../core/index.js';
import { createLogger } from '../core/index.js';
import { ModelCapabilitySchema } from './model-capabilities-types.js';
import type { ModelCapability } from './model-capabilities-types.js';

/** Environment variable an operator can set to override the default path. */
export const OVERLAY_ENV_VAR = 'NEXUS_MODEL_REGISTRY_OVERLAY';

/** Max file size accepted for the overlay (1 MB — far larger than expected). */
export const OVERLAY_MAX_BYTES = 1 * 1024 * 1024;

/**
 * Default overlay location: `<NEXUS_DATA_DIR>/models.yaml`. Returns the
 * absolute path without checking if it exists.
 */
export function defaultOverlayPath(): string {
  return nexusDataPath('models.yaml');
}

/**
 * Resolves the overlay path: `$NEXUS_MODEL_REGISTRY_OVERLAY` wins if set,
 * otherwise the default `~/.nexus-agents/models.yaml`.
 */
export function resolveOverlayPath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env[OVERLAY_ENV_VAR];
  if (override !== undefined && override !== '') return override;
  return defaultOverlayPath();
}

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

/** Structured reason for a rejected or skipped entry. */
export interface OverlayRejection {
  readonly index: number;
  readonly id?: string;
  readonly reason: string;
}

export interface OverlayLoadResult {
  readonly entries: readonly ModelCapability[];
  readonly rejections: readonly OverlayRejection[];
  readonly path: string;
  readonly status: 'missing' | 'empty' | 'malformed' | 'too-large' | 'loaded';
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Expected YAML root shape:
 *
 *   version: 1
 *   models:
 *     - id: claude-opus
 *       displayName: "Claude Opus (overridden)"
 *       provider: anthropic
 *       contextWindow: 1000000
 *       ...
 *     - ...
 *
 * or simply:
 *
 *   - id: ...
 *     ...
 *
 * Both a top-level array and an object with `models:` are accepted for
 * ergonomics; everything else is rejected with a structured reason.
 */
export function loadCapabilityOverlay(
  pathOrEnv?: string | NodeJS.ProcessEnv,
  logger?: ILogger
): OverlayLoadResult {
  const log = logger ?? createLogger({ component: 'capability-overlay' });
  const path = resolvePath(pathOrEnv);

  if (!existsSync(path)) {
    return { entries: [], rejections: [], path, status: 'missing' };
  }

  const sizeStatus = checkSize(path, log);
  if (sizeStatus !== undefined) return sizeStatus;

  const bodyResult = readBody(path, log);
  if ('result' in bodyResult) return bodyResult.result;
  const body = bodyResult.body;
  if (body === '') {
    log.info('Model registry overlay file is empty', { path });
    return { entries: [], rejections: [], path, status: 'empty' };
  }

  const parseResult = parseBody(body, path, log);
  if ('result' in parseResult) return parseResult.result;
  const parsed = parseResult.parsed;

  const rawEntries = extractEntries(parsed);
  if (rawEntries === undefined) {
    log.warn('Model registry overlay has unrecognized shape; treated as empty', {
      path,
    });
    return {
      entries: [],
      rejections: [{ index: -1, reason: 'Expected array or { models: [...] }' }],
      path,
      status: 'malformed',
    };
  }

  const { entries, rejections } = validateEntries(rawEntries, log, path);
  return { entries, rejections, path, status: 'loaded' };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolvePath(pathOrEnv: string | NodeJS.ProcessEnv | undefined): string {
  if (typeof pathOrEnv === 'string') return pathOrEnv;
  if (pathOrEnv !== undefined) return resolveOverlayPath(pathOrEnv);
  return resolveOverlayPath();
}

type ReadBodyResult = { body: string } | { result: OverlayLoadResult };
function readBody(path: string, log: ILogger): ReadBodyResult {
  try {
    return { body: readFileSync(path, 'utf-8').trim() };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn('Model registry overlay file read failed; treated as empty', {
      path,
      errorMessage: message,
    });
    return {
      result: {
        entries: [],
        rejections: [{ index: -1, reason: `file read error: ${message}` }],
        path,
        status: 'malformed',
      },
    };
  }
}

type ParseBodyResult = { parsed: unknown } | { result: OverlayLoadResult };
function parseBody(body: string, path: string, log: ILogger): ParseBodyResult {
  try {
    return { parsed: parseYaml(body) };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn('Model registry overlay YAML parse failed; treated as empty', {
      path,
      errorMessage: message,
    });
    return {
      result: {
        entries: [],
        rejections: [{ index: -1, reason: `YAML parse error: ${message}` }],
        path,
        status: 'malformed',
      },
    };
  }
}

function checkSize(path: string, log: ILogger): OverlayLoadResult | undefined {
  let size: number;
  try {
    size = statSync(path).size;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn('Model registry overlay statSync failed; treated as missing', {
      path,
      errorMessage: message,
    });
    return { entries: [], rejections: [], path, status: 'missing' };
  }
  if (size <= OVERLAY_MAX_BYTES) return undefined;
  log.warn('Model registry overlay exceeds size cap; refusing to load', {
    path,
    size,
    maxBytes: OVERLAY_MAX_BYTES,
  });
  return {
    entries: [],
    rejections: [
      {
        index: -1,
        reason: `file size ${String(size)} exceeds cap ${String(OVERLAY_MAX_BYTES)}`,
      },
    ],
    path,
    status: 'too-large',
  };
}

function extractIdForError(raw: unknown): string | undefined {
  if (raw === null || typeof raw !== 'object' || !('id' in raw)) return undefined;
  const idValue = raw.id;
  if (typeof idValue === 'string' && idValue !== '') return idValue;
  return undefined;
}

function extractEntries(parsed: unknown): unknown[] | undefined {
  if (Array.isArray(parsed)) return parsed as unknown[];
  if (parsed !== null && typeof parsed === 'object') {
    const obj = parsed as { models?: unknown };
    if (Array.isArray(obj.models)) return obj.models as unknown[];
  }
  return undefined;
}

interface ValidatedEntries {
  readonly entries: readonly ModelCapability[];
  readonly rejections: readonly OverlayRejection[];
}

function validateEntries(
  rawEntries: readonly unknown[],
  log: ILogger,
  path: string
): ValidatedEntries {
  const entries: ModelCapability[] = [];
  const rejections: OverlayRejection[] = [];
  for (let i = 0; i < rawEntries.length; i++) {
    const raw = rawEntries[i];
    const idCandidate = extractIdForError(raw);
    const parsed = ModelCapabilitySchema.safeParse(raw);
    if (!parsed.success) {
      const rejection: OverlayRejection = {
        index: i,
        ...(idCandidate !== undefined && idCandidate !== '' ? { id: idCandidate } : {}),
        reason: parsed.error.message,
      };
      rejections.push(rejection);
      log.warn('Model registry overlay entry rejected by schema', {
        path,
        index: i,
        id: idCandidate,
        errorMessage: parsed.error.message,
      });
      continue;
    }
    entries.push(parsed.data);
  }
  return { entries, rejections };
}
