/**
 * nexus-agents/mcp - Weather Report MCP Tool
 *
 * Read-only MCP tool that returns per-CLI, per-category performance
 * data and adaptive routing bonuses from the OutcomeStore.
 *
 * @module mcp/tools/weather-report-tool
 * (Source: Issue #865 — Weather report with adaptive routing)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger } from '../../core/index.js';
import { createLogger, formatZodError } from '../../core/index.js';
import { toolErrorResponse } from '../middleware/tool-error-handler.js';
import type { RateLimiter } from '../middleware/rate-limiter.js';
import type { SecurityConfig } from '../../config/schemas.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import { WeatherReportInputSchema } from './weather-report-types.js';
import type { WeatherReportResponse, CliWeather, AdaptiveBonus } from './weather-report-types.js';
import { generateWeatherReport } from './weather-report.js';
import { toolError, toolSuccessStructured, type ToolResult } from './tool-result.js';

// ============================================================================
// Dependencies
// ============================================================================

export interface WeatherReportDeps {
  readonly logger?: ILogger;
  readonly rateLimiter: RateLimiter;
  readonly security?: SecurityConfig | undefined;
}

// ============================================================================
// Serialization
// ============================================================================

/** Converts Maps to plain objects for JSON serialization. */
function serializeReport(report: WeatherReportResponse): unknown {
  return {
    ...report,
    cliWeather: report.cliWeather.map(serializeCliWeather),
    adaptiveBonuses: report.adaptiveBonuses.map(serializeBonus),
  };
}

function serializeCliWeather(cw: CliWeather): unknown {
  return {
    cli: cw.cli,
    totalTasks: cw.totalTasks,
    successRate: cw.successRate,
    avgDurationMs: cw.avgDurationMs,
    byCategory: Object.fromEntries(cw.byCategory),
  };
}

function serializeBonus(b: AdaptiveBonus): unknown {
  return { ...b };
}

// ============================================================================
// Handler
// ============================================================================

function weatherReportHandler(args: unknown, ctx: HandlerContext): Promise<ToolResult> {
  const parsed = WeatherReportInputSchema.safeParse(args);
  if (!parsed.success) {
    return Promise.resolve(toolError(`Validation error: ${formatZodError(parsed.error)}`));
  }

  try {
    const { cli, category, includeAdaptive } = parsed.data;
    const opts: import('./weather-report-types.js').WeatherReportOptions = {
      ...(cli !== undefined && { cli }),
      ...(category !== undefined && { category }),
      includeAdaptive,
    };
    const report = generateWeatherReport(opts);
    const serialized = serializeReport(report);
    const data = serialized as Record<string, unknown>;
    return Promise.resolve(toolSuccessStructured(data));
  } catch (caught) {
    return Promise.resolve(toolErrorResponse('Weather report failed', caught, ctx.logger));
  }
}

// ============================================================================
// Registration
// ============================================================================

export function registerWeatherReportTool(server: McpServer, deps: WeatherReportDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'weather_report' });
  const toolSchema = {
    cli: z.enum(['claude', 'gemini', 'codex', 'opencode']).optional().describe('Filter by CLI'),
    category: z
      .enum([
        'architecture',
        'code_generation',
        'code_review',
        'research',
        'security_review',
        'planning',
        'documentation',
        'testing',
        'devops',
        'exploration',
      ])
      .optional()
      .describe('Filter by task category'),
    includeAdaptive: z
      .boolean()
      .optional()
      .describe('Include adaptive routing bonuses (default: true)'),
  };

  const description =
    'Get multi-CLI performance weather report. Shows per-CLI success rates, ' +
    'per-category breakdowns, and adaptive routing bonus recommendations ' +
    'based on observed task outcomes.';

  const secureHandler = createSecureHandler(weatherReportHandler, {
    toolName: 'weather_report',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  const timeoutMs = getToolTimeout('weather_report', deps.security);
  const wrappedHandler = wrapToolWithTimeout('weather_report', secureHandler, {
    timeoutMs,
    logger,
  });

  // Note: outputSchema deferred for weather_report due to complex dynamic shape
  // with 12+ optional fields. structuredContent is still returned for future use.
  server.registerTool(
    'weather_report',
    { description, inputSchema: toolSchema },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered weather_report tool');
}
