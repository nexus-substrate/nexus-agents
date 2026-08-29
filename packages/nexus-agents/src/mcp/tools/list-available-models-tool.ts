/**
 * `list_available_models` MCP tool (#3406, epic #3403).
 *
 * Actively probes every model-discovery transport — the OpenRouter live catalog
 * and each CLI adapter that can enumerate (`opencode` natively; claude/codex/
 * gemini via the models.dev snapshot) — and returns a per-transport health
 * report: did the probe succeed, how many models, a sample of ids. This is the
 * diagnostic the owner asked for: a one-call way to validate that the CLIs and
 * APIs are wired and reachable.
 *
 * Read-only: it probes/reads and reports. It mutates nothing and does NOT change
 * routing. The OpenRouter catalog is untrusted external input (Epic #818 T3),
 * already Zod-validated + bounded by the source; ids are surfaced as data.
 *
 * @module mcp/tools/list-available-models-tool
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { createLogger, formatZodError, type ILogger } from '../../core/index.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler } from '../middleware/secure-handler.js';
import { buildDefaultModelSources } from '../../config/register-model-sources.js';
import type { AvailableModelsSource } from '../../config/available-models-cache.js';
import { getToolAnnotations } from '../tool-annotations.js';
import {
  toolStructuredError,
  toolSuccess,
  type BaseMcpToolDeps,
  type ToolResult,
} from './tool-result.js';

const DESCRIPTION =
  'Probe every model-discovery transport (OpenRouter API + opencode/claude/codex/gemini CLIs) ' +
  'and report a per-transport health summary: probe ok/failed, model count, and a sample of ids. ' +
  'Use it to validate the CLIs and APIs are wired and reachable. Read-only; does not change routing.';

/** Per-source probe timeout (ms). A hung transport must not block the report. */
const PROBE_TIMEOUT_MS = 12_000;

export const ListAvailableModelsInputSchema = z.object({
  includeModelIds: z
    .boolean()
    .optional()
    .describe('Include the full model-id list per transport (default false → sample of 5 only).'),
  includeOpenRouter: z
    .boolean()
    .optional()
    .describe('Probe the OpenRouter live catalog (default true).'),
});
export type ListAvailableModelsInput = z.infer<typeof ListAvailableModelsInputSchema>;

export interface TransportReport {
  readonly transport: string;
  /**
   * The probe completed without throwing. NOT "this transport is usable" —
   * a probe can succeed and return an empty catalog (#5128). Use
   * {@link TransportReport.servesModels} for usability.
   */
  readonly ok: boolean;
  /**
   * Whether this transport can actually serve a model — `ok` AND a non-empty
   * catalog (#5128).
   *
   * Added because `ok: true, modelCount: 0` was indistinguishable, in the
   * summary, from a working transport. Three of five reported that way against
   * a stale install, and the tool still said every transport was healthy.
   */
  readonly servesModels: boolean;
  readonly modelCount: number;
  readonly sampleModelIds: readonly string[];
  readonly modelIds?: readonly string[];
  readonly error?: string;
}

export interface ListAvailableModelsResponse {
  readonly transports: readonly TransportReport[];
  /**
   * Transports that can serve a model (#5128).
   *
   * This previously counted transports whose probe merely did not throw, so a
   * transport discovering ZERO models was reported as healthy. The field name
   * now means what it says; {@link ListAvailableModelsResponse.reachableTransports}
   * carries the old, weaker meaning under an honest name.
   */
  readonly healthyTransports: number;
  /** Transports whose probe completed, whether or not they found any model. */
  readonly reachableTransports: number;
  readonly totalTransports: number;
  readonly totalModels: number;
  readonly note: string;
}

export interface ListAvailableModelsDeps extends BaseMcpToolDeps {
  /** Injectable source list (tests); defaults to the real transports. */
  readonly sourcesFactory?: (includeOpenRouter: boolean) => readonly AvailableModelsSource[];
}

async function probeSource(
  source: AvailableModelsSource,
  includeModelIds: boolean
): Promise<TransportReport> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`probe timed out after ${String(PROBE_TIMEOUT_MS)}ms`));
    }, PROBE_TIMEOUT_MS);
  });
  try {
    const models = await Promise.race([source.listModels(), timeout]);
    const ids = models.map((m) => m.id);
    return {
      transport: source.name,
      ok: true,
      servesModels: ids.length > 0,
      modelCount: ids.length,
      sampleModelIds: ids.slice(0, 5),
      ...(includeModelIds ? { modelIds: ids } : {}),
    };
  } catch (error: unknown) {
    return {
      transport: source.name,
      ok: false,
      servesModels: false,
      modelCount: 0,
      sampleModelIds: [],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function defaultSources(
  includeOpenRouter: boolean
): Promise<readonly AvailableModelsSource[]> {
  const { createAllAdapters } = await import('../../cli-adapters/factory.js');
  const adapters = createAllAdapters();
  return buildDefaultModelSources(adapters, { includeOpenRouter });
}

export async function listAvailableModelsHandler(
  args: unknown,
  deps: Pick<ListAvailableModelsDeps, 'sourcesFactory'>,
  logger: ILogger
): Promise<ToolResult> {
  const parsed = ListAvailableModelsInputSchema.safeParse(args);
  if (!parsed.success) {
    return toolStructuredError({
      errorCategory: 'validation',
      message: `Validation error: ${formatZodError(parsed.error)}`,
    });
  }
  const includeModelIds = parsed.data.includeModelIds ?? false;
  const includeOpenRouter = parsed.data.includeOpenRouter ?? true;

  const sources =
    deps.sourcesFactory !== undefined
      ? deps.sourcesFactory(includeOpenRouter)
      : await defaultSources(includeOpenRouter);

  const transports = await Promise.all(sources.map((s) => probeSource(s, includeModelIds)));
  const response: ListAvailableModelsResponse = {
    transports,
    healthyTransports: transports.filter((t) => t.servesModels).length,
    reachableTransports: transports.filter((t) => t.ok).length,
    totalTransports: transports.length,
    totalModels: transports.reduce((sum, t) => sum + t.modelCount, 0),
    note:
      'Probe results — existence only; the in-tree registry remains authoritative for pricing/capability. ' +
      'healthyTransports counts transports that can serve a model; reachableTransports counts probes that merely succeeded.',
  };
  logger.debug('list_available_models probed transports', {
    healthy: response.healthyTransports,
    total: response.totalTransports,
  });
  return toolSuccess(JSON.stringify(response, null, 2));
}

/** @category MCP */
export function registerListAvailableModelsTool(
  server: McpServer,
  deps: ListAvailableModelsDeps
): void {
  const logger = deps.logger ?? createLogger({ tool: 'list_available_models' });
  const toolSchema = {
    includeModelIds: z
      .boolean()
      .optional()
      .describe('Include the full model-id list per transport (default false → sample of 5 only).'),
    includeOpenRouter: z
      .boolean()
      .optional()
      .describe('Probe the OpenRouter live catalog (default true).'),
  };

  const secureHandler = createSecureHandler(
    (args: unknown) => listAvailableModelsHandler(args, deps, logger),
    { toolName: 'list_available_models', rateLimiter: deps.rateLimiter, logger }
  );
  const timeoutMs = getToolTimeout('list_available_models', deps.security);
  const wrappedHandler = wrapToolWithTimeout('list_available_models', secureHandler, {
    timeoutMs,
    logger,
  });

  server.registerTool(
    'list_available_models',
    {
      description: DESCRIPTION,
      inputSchema: toolSchema,
      annotations: getToolAnnotations('list_available_models'),
    },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered list_available_models tool');
}
