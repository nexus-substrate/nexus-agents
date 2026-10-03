/**
 * Tests for weather_report MCP tool handler.
 *
 * @module mcp/tools/weather-report-tool.test
 * (Source: Issue #865)
 */

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { WeatherReportInputSchema } from './weather-report-types.js';
import { getOutcomeStore, resetOutcomeStore } from '../../orchestration/outcomes/index.js';
import type { ToolResult } from './tool-result.js';

vi.mock('../../config/learning-persistence.js', () => ({
  isPersistenceEnabled: vi.fn(() => false),
}));

// ============================================================================
// Schema Validation
// ============================================================================

describe('WeatherReportInputSchema', () => {
  it('accepts empty input with defaults', () => {
    const result = WeatherReportInputSchema.safeParse({});
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.includeAdaptive).toBe(true);
    expect(result.data.cli).toBeUndefined();
    expect(result.data.category).toBeUndefined();
  });

  it('accepts valid cli filter', () => {
    const result = WeatherReportInputSchema.safeParse({ cli: 'claude' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.cli).toBe('claude');
  });

  it('accepts valid gemini cli filter', () => {
    const result = WeatherReportInputSchema.safeParse({ cli: 'gemini' });
    expect(result.success).toBe(true);
  });

  it('accepts valid codex cli filter', () => {
    const result = WeatherReportInputSchema.safeParse({ cli: 'codex' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid cli value', () => {
    const result = WeatherReportInputSchema.safeParse({ cli: 'unknown' });
    expect(result.success).toBe(false);
  });

  it('accepts valid category filter', () => {
    const result = WeatherReportInputSchema.safeParse({
      category: 'code_generation',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.category).toBe('code_generation');
  });

  it('accepts all valid categories', () => {
    const categories = [
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
    ];
    for (const category of categories) {
      const result = WeatherReportInputSchema.safeParse({ category });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid category', () => {
    const result = WeatherReportInputSchema.safeParse({
      category: 'invalid_category',
    });
    expect(result.success).toBe(false);
  });

  it('accepts includeAdaptive false', () => {
    const result = WeatherReportInputSchema.safeParse({
      includeAdaptive: false,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.includeAdaptive).toBe(false);
  });

  it('accepts combined filters', () => {
    const result = WeatherReportInputSchema.safeParse({
      cli: 'claude',
      category: 'security_review',
      includeAdaptive: false,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.cli).toBe('claude');
    expect(result.data.category).toBe('security_review');
    expect(result.data.includeAdaptive).toBe(false);
  });
});

// ============================================================================
// Registration contract
// ============================================================================

describe('registerWeatherReportTool', () => {
  it('registers tool with correct name', async () => {
    const { registerWeatherReportTool } = await import('./weather-report-tool.js');
    const registerTool = vi.fn();
    const mockServer = { registerTool } as unknown as Parameters<
      typeof registerWeatherReportTool
    >[0];
    const mockRateLimiter = {
      tryAcquire: vi.fn().mockReturnValue(true),
    } as unknown as Parameters<typeof registerWeatherReportTool>[1]['rateLimiter'];

    registerWeatherReportTool(mockServer, { rateLimiter: mockRateLimiter });

    expect(registerTool).toHaveBeenCalledOnce();
    const callArgs = registerTool.mock.calls[0] as unknown[];
    expect(callArgs[0]).toBe('weather_report');
  });
});

describe('weather_report output contract (#5842)', () => {
  async function registeredReport(includeAdaptive: boolean): Promise<{
    schema: z.ZodObject<z.ZodRawShape>;
    result: ToolResult;
  }> {
    resetOutcomeStore();
    getOutcomeStore().append({
      id: 'weather-schema-outcome',
      cli: 'claude',
      category: 'code_generation',
      model: 'claude-sonnet',
      success: true,
      durationMs: 125,
      timestamp: new Date().toISOString(),
      source: 'delegate',
    });
    const { registerWeatherReportTool } = await import('./weather-report-tool.js');
    const registerTool = vi.fn();
    registerWeatherReportTool(
      { registerTool } as unknown as Parameters<typeof registerWeatherReportTool>[0],
      {
        rateLimiter: { tryAcquire: vi.fn(() => true) } as unknown as Parameters<
          typeof registerWeatherReportTool
        >[1]['rateLimiter'],
      }
    );
    const call = registerTool.mock.calls[0] as unknown[];
    const config = call[1] as { outputSchema?: z.ZodRawShape };
    expect(config.outputSchema).toBeDefined();
    const handler = call[2] as (args: unknown) => Promise<ToolResult>;
    return {
      schema: z.object(config.outputSchema ?? {}),
      result: await handler({ includeAdaptive }),
    };
  }

  it.each([true, false])(
    'validates a real generated report without losing fields (adaptive=%s)',
    async (adaptive) => {
      const { schema, result } = await registeredReport(adaptive);
      expect(result.isError).toBeUndefined();
      expect(schema.parse(result.structuredContent)).toEqual(result.structuredContent);
      const report = result.structuredContent as Record<string, unknown>;
      expect(report['overall']).toMatchObject({ totalTasks: 1, avgDurationMs: 125 });
      expect(report['cliWeather']).toContainEqual(
        expect.objectContaining({
          cli: 'claude',
          byCategory: { code_generation: { count: 1, successRate: 1, avgDurationMs: 125 } },
        })
      );
      expect(report['costSection']).toBeDefined();
      expect(report['recentWindow']).toBeDefined();
    }
  );

  it('rejects malformed nested stats and unknown report fields', async () => {
    const { schema, result } = await registeredReport(true);
    const report = result.structuredContent as Record<string, unknown>;
    expect(schema.safeParse({ ...report, overall: { totalTasks: 'one' } }).success).toBe(false);
    expect(schema.strict().safeParse({ ...report, untrackedField: true }).success).toBe(false);
  });
});
