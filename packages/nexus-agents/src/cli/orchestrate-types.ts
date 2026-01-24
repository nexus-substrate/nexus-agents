/**
 * Orchestrate Command Shared Types
 *
 * Shared type definitions for the orchestrate command and puppeteer integration.
 * Extracted to break circular dependency between orchestrate-command.ts and
 * orchestrate-puppeteer.ts.
 *
 * @module cli/orchestrate-types
 * (Source: Issue #392 - Circular dependency resolution)
 */

import type { LearnablePolicyStats } from '../agents/orchestration/index.js';

/** Engine type for orchestration */
export type OrchestrateEngine = 'router' | 'puppeteer';

/** Orchestrate command options */
export interface OrchestrateOptions {
  /** Task to execute */
  task: string;
  /** Specific model to use (bypasses routing) */
  model?: 'claude' | 'gemini' | 'codex' | undefined;
  /** Output format */
  format?: 'text' | 'json' | undefined;
  /** Enable verbose output */
  verbose?: boolean | undefined;
  /** Dry run - show routing decision without execution */
  dryRun?: boolean | undefined;
  /** Maximum tokens budget */
  maxTokens?: number | undefined;
  /** Maximum cost budget in USD */
  maxCostUsd?: number | undefined;
  /** Engine type: router (default) or puppeteer (#386) */
  engine?: OrchestrateEngine | undefined;
  /** Enable learnable policy (puppeteer engine only) */
  learn?: boolean | undefined;
  /** Path to load/save policy parameters (puppeteer engine only) */
  policyPath?: string | undefined;
  /** Maximum orchestration steps (puppeteer engine only) */
  maxSteps?: number | undefined;
}

/** Puppeteer orchestration result (extends base result). */
export interface PuppeteerOrchestrationResult {
  success: boolean;
  model: string;
  response?: {
    text: string;
    durationMs?: number;
  };
  routing?: undefined; // Puppeteer doesn't use routing
  error?: string;
  durationMs: number;
  puppeteer?: {
    totalSteps: number;
    trajectoryLength: number;
    finalReward?: number;
    policyStats?: LearnablePolicyStats;
  };
}
