/**
 * HTTP client for models.dev catalog (#7072, #6625).
 *
 * Single source for fetching models.dev catalog with SSRF check, payload size limit,
 * and strict schema validation. Shared between `sync-models-dev.ts` and `model-drift-sources.ts`.
 *
 * @module config/models-dev-client
 */

import { validateCatalogFetchUrl, validateCatalogPayloadSize } from './model-catalog-ssrf.js';
import { parseModelsDevCatalog, type ModelsDevCatalog } from './model-catalog-admission.js';

export const MODELS_DEV_URL = 'https://models.dev/api.json';
export const DEFAULT_FETCH_TIMEOUT_MS = 20_000;

function checkContentLengthHeader(headers: Headers): void {
  const contentLength = headers.get('content-length');
  if (contentLength === null) return;
  const parsedBytes = parseInt(contentLength, 10);
  if (!Number.isFinite(parsedBytes)) return;
  const sizeCheck = validateCatalogPayloadSize(parsedBytes);
  if (!sizeCheck.ok) {
    throw new Error(`Catalog fetch rejected: ${sizeCheck.error}`);
  }
}

function parseRawCatalogJson(text: string): ModelsDevCatalog {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e: unknown) {
    throw new Error(
      `Catalog response is not valid JSON: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  const parsed = parseModelsDevCatalog(raw);
  if (!parsed.ok) {
    throw new Error(`Catalog schema validation rejected input: ${parsed.error}`);
  }
  return parsed.data;
}

async function readBoundedResponseBytes(response: Response): Promise<Uint8Array> {
  const arrayBuffer = await response.arrayBuffer();
  const sizeCheck = validateCatalogPayloadSize(arrayBuffer.byteLength);
  if (!sizeCheck.ok) {
    throw new Error(`Catalog fetch rejected: ${sizeCheck.error}`);
  }
  return new Uint8Array(arrayBuffer);
}

/**
 * Fetch catalog with SSRF check, payload size limit, and strict schema validation.
 */
export async function fetchCatalog(
  url: string = MODELS_DEV_URL,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS
): Promise<ModelsDevCatalog> {
  const urlCheck = validateCatalogFetchUrl(url);
  if (!urlCheck.ok) {
    throw new Error(`SSRF check refused catalog URL: ${urlCheck.error}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(urlCheck.url.toString(), { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`models.dev returned HTTP ${String(response.status)}`);
    }

    checkContentLengthHeader(response.headers);
    const bytes = await readBoundedResponseBytes(response);
    const text = new TextDecoder().decode(bytes);
    return parseRawCatalogJson(text);
  } finally {
    clearTimeout(timer);
  }
}
