/**
 * nexus-agents/swe-bench - Dataset Loader
 *
 * Load SWE-bench datasets from HuggingFace.
 *
 * @module swe-bench/dataset-loader
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import type { Result } from '../core/result.js';
import type { SWEBenchInstance, SWEBenchVariant, SWEBenchDatasetInfo } from './types.js';
import { SWE_BENCH_DATASETS } from './types.js';

/**
 * Error types for dataset loading.
 */
export class DatasetLoadError extends Error {
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'DatasetLoadError';
    this.cause = cause;
  }
}

/**
 * Options for loading dataset.
 */
export interface DatasetLoadOptions {
  /** Maximum instances to load (for testing). */
  readonly limit?: number;
  /** Skip instances that don't match filter. */
  readonly filter?: (instance: SWEBenchInstance) => boolean;
  /** Specific instance IDs to load. */
  readonly instanceIds?: readonly string[];
}

/**
 * Result of loading dataset.
 */
export interface DatasetLoadResult {
  /** Loaded instances. */
  readonly instances: readonly SWEBenchInstance[];
  /** Dataset info. */
  readonly info: SWEBenchDatasetInfo;
  /** Number of instances loaded. */
  readonly count: number;
  /** Number of instances filtered out. */
  readonly filtered: number;
  /** Load duration in ms. */
  readonly durationMs: number;
}

/**
 * Raw instance from HuggingFace dataset.
 */
interface RawSWEBenchInstance {
  instance_id?: string;
  repo?: string;
  base_commit?: string;
  problem_statement?: string;
  hints_text?: string;
  created_at?: string;
  test_patch?: string;
  version?: string;
  environment_setup_commit?: string;
  [key: string]: unknown;
}

/**
 * Checks if a value is a non-empty string.
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Extracts an optional string field from raw data.
 */
function getOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Checks if raw instance has required fields.
 */
function hasRequiredFields(raw: RawSWEBenchInstance): boolean {
  return (
    isNonEmptyString(raw.instance_id) &&
    isNonEmptyString(raw.repo) &&
    isNonEmptyString(raw.base_commit) &&
    isNonEmptyString(raw.problem_statement)
  );
}

/**
 * Builds optional properties object without undefined values.
 */
function buildOptionalProps(raw: RawSWEBenchInstance): Record<string, string> {
  const result: Record<string, string> = {};

  const hintsText = getOptionalString(raw.hints_text);
  const testPatch = getOptionalString(raw.test_patch);
  const version = getOptionalString(raw.version);
  const envCommit = getOptionalString(raw.environment_setup_commit);

  if (hintsText !== undefined) result['hints_text'] = hintsText;
  if (testPatch !== undefined) result['test_patch'] = testPatch;
  if (version !== undefined) result['version'] = version;
  if (envCommit !== undefined) result['environment_setup_commit'] = envCommit;

  return result;
}

/**
 * Validates and transforms raw instance data.
 */
function validateInstance(raw: RawSWEBenchInstance): SWEBenchInstance | null {
  if (!hasRequiredFields(raw)) {
    return null;
  }

  // Build base instance with required fields
  const base = {
    instance_id: raw.instance_id as string,
    repo: raw.repo as string,
    base_commit: raw.base_commit as string,
    problem_statement: raw.problem_statement as string,
    created_at: getOptionalString(raw.created_at) ?? new Date().toISOString(),
  };

  // Build optional properties and merge
  const optionalProps = buildOptionalProps(raw);

  return { ...base, ...optionalProps } as SWEBenchInstance;
}

/**
 * Checks if instance passes filters.
 */
function passesFilters(instance: SWEBenchInstance, options: DatasetLoadOptions): boolean {
  if (options.instanceIds !== undefined && options.instanceIds.length > 0) {
    if (!options.instanceIds.includes(instance.instance_id)) {
      return false;
    }
  }
  if (options.filter !== undefined && !options.filter(instance)) {
    return false;
  }
  return true;
}

/**
 * Fetches dataset from HuggingFace API.
 */
async function fetchFromHuggingFace(
  datasetId: string,
  options: DatasetLoadOptions
): Promise<Result<readonly RawSWEBenchInstance[], DatasetLoadError>> {
  const baseUrl = 'https://datasets-server.huggingface.co/rows';
  const limit = options.limit ?? 1000;
  const offset = 0;
  const url = `${baseUrl}?dataset=${encodeURIComponent(datasetId)}&config=default&split=test&offset=${String(offset)}&length=${String(limit)}`;

  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });

    if (!response.ok) {
      return {
        ok: false,
        error: new DatasetLoadError(
          `HuggingFace API error: ${String(response.status)} ${response.statusText}`
        ),
      };
    }

    const data = (await response.json()) as { rows?: Array<{ row: RawSWEBenchInstance }> };

    if (!Array.isArray(data.rows)) {
      return { ok: false, error: new DatasetLoadError('Invalid response format from HuggingFace') };
    }

    return { ok: true, value: data.rows.map((r) => r.row) };
  } catch (err) {
    return { ok: false, error: new DatasetLoadError('Failed to fetch from HuggingFace', err) };
  }
}

/**
 * Processes raw instances into validated instances.
 */
function processInstances(
  rawInstances: readonly RawSWEBenchInstance[],
  options: DatasetLoadOptions
): { instances: SWEBenchInstance[]; filtered: number } {
  const instances: SWEBenchInstance[] = [];
  let filtered = 0;

  for (const raw of rawInstances) {
    const instance = validateInstance(raw);
    if (instance === null) {
      filtered++;
      continue;
    }

    if (!passesFilters(instance, options)) {
      filtered++;
      continue;
    }

    instances.push(instance);
  }

  return { instances, filtered };
}

/**
 * Loads SWE-bench dataset from HuggingFace.
 */
export async function loadDataset(
  variant: SWEBenchVariant,
  options: DatasetLoadOptions = {}
): Promise<Result<DatasetLoadResult, DatasetLoadError>> {
  const startTime = Date.now();
  const datasetInfo = SWE_BENCH_DATASETS[variant];

  const fetchResult = await fetchFromHuggingFace(datasetInfo.hf_dataset_id, options);
  if (!fetchResult.ok) {
    return { ok: false, error: fetchResult.error };
  }

  const { instances, filtered } = processInstances(fetchResult.value, options);

  return {
    ok: true,
    value: {
      instances,
      info: datasetInfo,
      count: instances.length,
      filtered,
      durationMs: Date.now() - startTime,
    },
  };
}

/**
 * Gets a single instance by ID.
 */
export async function getInstance(
  variant: SWEBenchVariant,
  instanceId: string
): Promise<Result<SWEBenchInstance, DatasetLoadError>> {
  const result = await loadDataset(variant, { instanceIds: [instanceId], limit: 1 });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const firstInstance = result.value.instances[0];
  if (firstInstance === undefined) {
    return { ok: false, error: new DatasetLoadError(`Instance not found: ${instanceId}`) };
  }

  return { ok: true, value: firstInstance };
}

/**
 * Lists available instances (IDs only) for a variant.
 */
export async function listInstances(
  variant: SWEBenchVariant,
  options: DatasetLoadOptions = {}
): Promise<Result<readonly string[], DatasetLoadError>> {
  const result = await loadDataset(variant, options);

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  return { ok: true, value: result.value.instances.map((i) => i.instance_id) };
}

/**
 * Gets dataset info without loading instances.
 */
export function getDatasetInfo(variant: SWEBenchVariant): SWEBenchDatasetInfo {
  return SWE_BENCH_DATASETS[variant];
}

/**
 * Filters instances by repository.
 */
export function filterByRepo(repo: string): (instance: SWEBenchInstance) => boolean {
  return (instance) => instance.repo === repo;
}

/**
 * Filters instances by version.
 */
export function filterByVersion(version: string): (instance: SWEBenchInstance) => boolean {
  return (instance) => instance.version === version;
}
