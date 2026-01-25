/**
 * Demo Command Types
 *
 * Type definitions for the demo command.
 *
 * @module cli/demo-command-types
 * (Source: Issue #424 - Demo mode for API-free exploration)
 */

/**
 * Demo command subcommands.
 */
export type DemoSubcommand = 'routing' | 'expert-list' | 'workflow';

/**
 * Options for the demo command.
 */
export interface DemoOptions {
  readonly subcommand: DemoSubcommand;
  readonly task?: string;
  readonly workflowName?: string;
}

/**
 * Mock routing decision for demo mode.
 */
export interface MockRoutingResult {
  readonly task: string;
  readonly taskProfile: {
    readonly complexity: 'low' | 'medium' | 'high';
    readonly codeGeneration: boolean;
    readonly reasoning: boolean;
    readonly estimatedTokens: number;
  };
  readonly budgetResults: readonly {
    readonly model: string;
    readonly withinBudget: boolean;
    readonly reason: string;
  }[];
  readonly topsisRanking: readonly {
    readonly model: string;
    readonly score: number;
    readonly quality: number;
    readonly cost: number;
    readonly latency: number;
  }[];
  readonly selectedModel: string;
  readonly selectionReason: string;
}

/**
 * Mock workflow for demo mode.
 */
export interface MockWorkflow {
  readonly name: string;
  readonly description: string;
  readonly inputs: readonly {
    readonly name: string;
    readonly type: string;
    readonly required: boolean;
  }[];
  readonly steps: readonly {
    readonly id: string;
    readonly agent: string;
    readonly description: string;
  }[];
}

/**
 * ANSI color codes for terminal output.
 */
export const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
} as const;

/**
 * Validates if a string is a valid demo subcommand.
 */
export function isValidDemoSubcommand(value: string | undefined): value is DemoSubcommand {
  return value === 'routing' || value === 'expert-list' || value === 'workflow';
}
