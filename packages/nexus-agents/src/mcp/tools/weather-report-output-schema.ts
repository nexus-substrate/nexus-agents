/** Complete serialized weather_report output contract (#5842). */
import { z } from 'zod';
import type {
  WeatherReportResponse,
  CliWeather,
  AdapterAttemptStats,
} from './weather-report-types.js';
import { TASK_CATEGORIES } from '../../config/task-specialization-types.js';
import { StrategyNameSchema, CostProfileSchema } from '../../orchestration/strategy-manifest.js';
import { DecisionGateSchema } from '../../observability/decision-cost-store.js';
import type { GroupStats } from '../../orchestration/outcomes/outcome-types.js';
import { ObservedAttemptUsageSchema } from '../../observability/attempt-usage.js';
import type { ConsensusDecisionTokenReport } from '../../observability/consensus-decision-tokens.js';

/** The existing MCP serializer omits per-CLI adapter stats and converts Maps. */
export type SerializedCliWeather = Omit<CliWeather, keyof AdapterAttemptStats | 'byCategory'> & {
  readonly byCategory: Readonly<Record<string, GroupStats>>;
};
export type SerializedWeatherReport = Omit<WeatherReportResponse, 'cliWeather'> & {
  readonly cliWeather: readonly SerializedCliWeather[];
};
/** JSON omits undefined-valued properties; Zod optional fields also accept undefined. */
type SerializedValue<T> = T extends readonly (infer Entry)[]
  ? readonly SerializedValue<Entry>[]
  : T extends object
    ? { [K in keyof T as undefined extends T[K] ? never : K]: SerializedValue<T[K]> } & {
        [K in keyof T as undefined extends T[K] ? K : never]?:
          SerializedValue<Exclude<T[K], undefined>> | undefined;
      }
    : T;
type SchemaShape<T> = { [K in keyof T]-?: z.ZodType<SerializedValue<T[K]>> };

const GROUP_STATS_SCHEMA = z.object({
  count: z.number(),
  successRate: z.number(),
  avgDurationMs: z.number(),
});
const CLI_WEATHER_SCHEMA = z.object({
  cli: z.string(),
  totalTasks: z.number(),
  successRate: z.number(),
  avgDurationMs: z.number(),
  byCategory: z.record(z.string(), GROUP_STATS_SCHEMA),
} satisfies SchemaShape<SerializedCliWeather>);

const ATTEMPT_TELEMETRY_SCHEMA = z.object({
  scope: z.literal('observed outer-attempt usage, not all physical attempts'),
  measurement: z.enum(['lower-bound', 'unmeasured']),
  decisionsWithTelemetry: z.number(),
  decisionsLackingTelemetry: z.number(),
  invalidTelemetry: z.number(),
  observableAttempts: z.number().nullable(),
  observedAttempts: z.number().nullable(),
  reportedAttempts: z.number().nullable(),
  unobservedAttempts: z.number().nullable(),
  coverage: z.number().nullable(),
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  totalTokens: z.number().nullable(),
  cachedTokens: z.number().nullable(),
  reasoningTokens: z.number().nullable(),
  cacheCreationTokens: z.number().nullable(),
} satisfies SchemaShape<NonNullable<ConsensusDecisionTokenReport['attemptTelemetry']>>);

const CONSENSUS_TOKENS_SCHEMA = z.object({
  matchedQuorumDecisions: z.number(),
  matchedNoQuorumDecisions: z.number(),
  unmatchedQuorumVoteRecords: z.number(),
  unmatchedNoQuorumVoteRecords: z.number(),
  unmatchedCostRecords: z.number(),
  ambiguousDecisionIds: z.number(),
  invalidCostRecords: z.number(),
  totalReportedFinalSeatTokens: z.number(),
  noQuorumReportedFinalSeatTokens: z.number(),
  reportedTokensPerMatchedQuorumDecision: z.number().nullable(),
  tokenMeasuredVoters: z.number(),
  tokenUnmeasuredVoters: z.number(),
  tokenCoverage: z.number().nullable(),
  measurement: z.literal('lower-bound-final-seats'),
  attemptTelemetry: ATTEMPT_TELEMETRY_SCHEMA.optional(),
  observedAttemptUsage: ObservedAttemptUsageSchema.extend({ decisions: z.number() })
    .nullable()
    .optional(),
  matchedDecisionsWithOutcomes: z.number().optional(),
  matchedOutcomeRows: z.number().optional(),
  unmatchedOutcomeRows: z.number().optional(),
  matchedLlmAnsweredOutcomeRows: z.number().optional(),
  outcomeJoinCoverage: z.number().nullable().optional(),
  matchedPipelineRuns: z.number().optional(),
  matchedPipelineOutcomeRows: z.number().optional(),
  unmatchedPipelineOutcomeRows: z.number().optional(),
  pipelineOutcomeJoinCoverage: z.number().nullable().optional(),
  unreadablePipelineTraces: z.number().optional(),
} satisfies SchemaShape<ConsensusDecisionTokenReport>);

const COST_SECTION_SCHEMA = z.object({
  decisionCosts: z.object({
    windowMs: z.number(),
    totalDecisions: z.number(),
    totalCostUsd: z.number(),
    byGate: z.array(
      z.object({
        gate: DecisionGateSchema,
        decisionCount: z.number(),
        avgCostUsd: z.number(),
        avgTokens: z.number(),
        avgVoters: z.number(),
        totalCostUsd: z.number(),
        totalTokens: z.number(),
        measuredVoters: z.number(),
        unmeasuredVoters: z.number(),
        tokenMeasuredVoters: z.number(),
        tokenUnmeasuredVoters: z.number(),
        tokenCoverage: z.number().nullable(),
        costIsFloor: z.boolean(),
      })
    ),
  }),
  consensusDecisionTokens: CONSENSUS_TOKENS_SCHEMA,
  strategyCostProfiles: z.array(
    z.object({
      strategy: StrategyNameSchema,
      entrypointTool: z.string(),
      costProfile: CostProfileSchema.optional(),
    })
  ),
} satisfies SchemaShape<NonNullable<WeatherReportResponse['costSection']>>);

/** Every response key is declared; records retain dynamic category names. */
export const WEATHER_REPORT_OUTPUT_SCHEMA = {
  overall: z.object({
    totalTasks: z.number(),
    successRate: z.number(),
    avgDurationMs: z.number(),
    adapterAttemptSuccessRate: z.number(),
    adapterUnavailableCount: z.number(),
    adapterUnavailableRate: z.number(),
  }),
  cliWeather: z.array(CLI_WEATHER_SCHEMA),
  adaptiveBonuses: z.array(
    z.object({
      cli: z.string(),
      category: z.enum(TASK_CATEGORIES),
      staticBonus: z.number(),
      adaptiveBonus: z.number(),
      sampleCount: z.number(),
      sufficient: z.boolean(),
    })
  ),
  tierRecommendations: z.array(
    z.object({
      category: z.string(),
      direction: z.enum(['promote', 'demote']),
      currentTier: z.number(),
      recommendedTier: z.number(),
      successRate: z.number(),
      sampleCount: z.number(),
      reason: z.string(),
    })
  ),
  learningInsights: z
    .array(
      z.object({
        cli: z.string(),
        category: z.enum(TASK_CATEGORIES),
        trend: z.enum(['improving', 'declining', 'stable']),
        confidence: z.number(),
        adjustedBaseline: z.number(),
        sampleCount: z.number(),
      })
    )
    .optional(),
  recommendedMappings: z
    .array(
      z.object({
        category: z.enum(TASK_CATEGORIES),
        recommendedCli: z.string(),
        successRate: z.number(),
        sampleCount: z.number(),
        confidence: z.enum(['high', 'medium', 'low']),
      })
    )
    .optional(),
  rateLimits: z
    .array(
      z.object({
        provider: z.string(),
        totalHits: z.number(),
        lastHitAt: z.number(),
        avgRetryAfterMs: z.number().optional(),
      })
    )
    .optional(),
  toolPerformance: z
    .array(
      z.object({
        toolName: z.string(),
        totalCalls: z.number(),
        successRate: z.number(),
        avgDurationMs: z.number(),
        errorCount: z.number(),
      })
    )
    .optional(),
  failureBreakdown: z
    .array(z.object({ category: z.string(), count: z.number(), percentage: z.number() }))
    .optional(),
  agentHealth: z
    .object({
      activeSessions: z.number(),
      stalledSessions: z.number(),
      unmeasuredSessions: z.number().optional(),
      sessions: z.array(
        z.object({
          sessionId: z.string(),
          expertId: z.string(),
          health: z.enum(['alive', 'slow', 'stalled']),
          elapsedMs: z.number(),
          timeSinceHeartbeatMs: z.number(),
          heartbeatCount: z.number(),
        })
      ),
    })
    .optional(),
  expertPerformance: z
    .array(
      z.object({
        role: z.string(),
        totalTasks: z.number(),
        successRate: z.number(),
        avgDurationMs: z.number(),
        dominantErrorPattern: z.string().optional(),
        consecutiveFailures: z.number(),
        lastSuccessAt: z.string().optional(),
        degraded: z.boolean(),
      })
    )
    .optional(),
  swarmHealth: z
    .object({
      agentUtilization: z.number(),
      collaborationEfficiency: z.number(),
      routingAccuracy: z.number(),
      weeklyRegret: z.number(),
      adaptationSpeed: z.number(),
      adaptationSpeedCategories: z.number(),
      observedCategories: z.number(),
      analyzedCategories: z.number(),
      observedRoles: z.number(),
    })
    .optional(),
  triageStats: z
    .object({
      totalRetried: z.number(),
      retrySuccessRate: z.number(),
      actionBreakdown: z.array(z.object({ action: z.string(), count: z.number() })),
    })
    .optional(),
  costSection: COST_SECTION_SCHEMA.optional(),
  modelWeather: z
    .array(
      z.object({
        model: z.string(),
        vendor: z.string(),
        family: z.string(),
        scope: z.enum(['literal', 'family']),
        sampleCount: z.number(),
        successRate: z.number(),
        avgDurationMs: z.number(),
      })
    )
    .optional(),
  recentWindow: z
    .object({
      windowMs: z.number(),
      totalTasks: z.number(),
      successRate: z.number(),
      avgDurationMs: z.number(),
    })
    .optional(),
  explorationRate: z.number(),
  coldStartThreshold: z.number(),
  collectedAt: z.string(),
} satisfies SchemaShape<SerializedWeatherReport>;
