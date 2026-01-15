/**
 * nexus-agents/testing/e2e - Journey Simulator
 *
 * Layer 3 testing: Simulate complete user journeys through the system.
 * Validates end-to-end functionality with real user workflows.
 *
 * @module testing/e2e/journey-simulator
 * (Source: Issue #281, Consensus Vote 5-0)
 */

import { readFile } from 'node:fs/promises';
import * as yaml from 'yaml';
import { logger } from '../../core/logger.js';
import type {
  IJourneySimulator,
  UserJourney,
  JourneyAction,
  JourneyResult,
  ActionResult,
} from './types.js';

/**
 * Journey action executor interface.
 */
export interface IActionExecutor {
  /**
   * Execute a journey action.
   */
  execute(action: JourneyAction): Promise<ActionResult>;
}

/**
 * Default action executor with simulated responses.
 */
export class DefaultActionExecutor implements IActionExecutor {
  async execute(action: JourneyAction): Promise<ActionResult> {
    const startTime = Date.now();

    try {
      // Simulate action execution
      await this.simulateAction(action);

      return {
        index: 0, // Will be set by caller
        succeeded: true,
        durationMs: Date.now() - startTime,
        output: JSON.stringify({ action: action.type, command: action.command, status: 'ok' }),
      };
    } catch (error) {
      return {
        index: 0,
        succeeded: false,
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Simulate action execution with delays.
   */
  private async simulateAction(action: JourneyAction): Promise<void> {
    const waitDuration = this.getWaitDuration(action);
    const delays: Record<JourneyAction['type'], number> = {
      cli_command: 100,
      mcp_tool: 150,
      workflow_run: 500,
      wait: waitDuration,
    };

    await new Promise((resolve) => setTimeout(resolve, delays[action.type]));

    // Simulate potential failures for testing
    if (action.command.includes('fail')) {
      throw new Error(`Simulated failure for command: ${action.command}`);
    }
  }

  private getWaitDuration(action: JourneyAction): number {
    const duration = action.args?.duration;
    return typeof duration === 'number' ? duration : 1000;
  }
}

/**
 * Schema for parsing journey YAML files.
 */
const UserJourneySchema = {
  parse(data: unknown): UserJourney {
    const obj = data as Record<string, unknown>;
    if (typeof obj.id !== 'string') throw new Error('Missing id');
    if (typeof obj.name !== 'string') throw new Error('Missing name');

    const description = obj.description;
    const successCriteria = obj.successCriteria;
    const maxTime = obj.maxTimeToFirstSuccessMs;

    return {
      id: obj.id,
      name: obj.name,
      description: typeof description === 'string' ? description : '',
      actions: parseActions(obj.actions),
      successCriteria: Array.isArray(successCriteria) ? (successCriteria as string[]) : [],
      maxTimeToFirstSuccessMs: typeof maxTime === 'number' ? maxTime : 60000,
    };
  },
};

function parseActions(raw: unknown): JourneyAction[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const obj = item as Record<string, unknown>;
    const base: { type: JourneyAction['type']; command: string } = {
      type: obj.type as JourneyAction['type'],
      command: obj.command as string,
    };
    const optional: {
      args?: Record<string, unknown>;
      expectedOutcome?: string;
      timeoutMs?: number;
    } = {};
    if (obj.args !== undefined) {
      optional.args = obj.args as Record<string, unknown>;
    }
    if (obj.expectedOutcome !== undefined) {
      optional.expectedOutcome = obj.expectedOutcome as string;
    }
    if (obj.timeoutMs !== undefined) {
      optional.timeoutMs = obj.timeoutMs as number;
    }
    return { ...base, ...optional } as JourneyAction;
  });
}

/**
 * Journey simulator for Layer 3 testing.
 * Simulates complete user journeys through the system.
 */
export class JourneySimulator implements IJourneySimulator {
  private readonly executor: IActionExecutor;
  private readonly log = logger.child({ component: 'JourneySimulator' });

  constructor(executor: IActionExecutor = new DefaultActionExecutor()) {
    this.executor = executor;
  }

  /**
   * Load a journey definition from file.
   */
  async loadJourney(path: string): Promise<UserJourney> {
    const content = await readFile(path, 'utf-8');
    const data: unknown = yaml.parse(content);
    return UserJourneySchema.parse(data);
  }

  /**
   * Simulate a user journey.
   */
  async simulate(journey: UserJourney): Promise<JourneyResult> {
    const startTime = Date.now();
    this.log.info('Starting journey simulation', {
      journeyId: journey.id,
      actionCount: journey.actions.length,
    });

    const state = await this.executeAllActions(journey, startTime);
    return this.buildJourneyResult(journey, startTime, state);
  }

  private async executeAllActions(
    journey: UserJourney,
    startTime: number
  ): Promise<{
    results: ActionResult[];
    firstSuccessTime?: number;
    failedAt?: number;
    error?: string;
  }> {
    const results: ActionResult[] = [];
    let firstSuccessTime: number | undefined;

    for (let i = 0; i < journey.actions.length; i++) {
      const action = journey.actions[i];
      if (action === undefined) continue;
      const outcome = await this.executeActionWithTimeout(action, i, startTime);
      results.push(outcome.result);

      if (outcome.result.succeeded && firstSuccessTime === undefined) {
        firstSuccessTime = Date.now() - startTime;
      }

      if (!outcome.result.succeeded) {
        const result: {
          results: ActionResult[];
          firstSuccessTime?: number;
          failedAt?: number;
          error?: string;
        } = {
          results,
          failedAt: i,
        };
        if (firstSuccessTime !== undefined) {
          result.firstSuccessTime = firstSuccessTime;
        }
        if (outcome.result.error !== undefined) {
          result.error = outcome.result.error;
        }
        return result;
      }

      this.log.debug('Action completed', {
        index: i,
        type: action.type,
        succeeded: true,
        durationMs: outcome.result.durationMs,
      });
    }

    const result: {
      results: ActionResult[];
      firstSuccessTime?: number;
      failedAt?: number;
      error?: string;
    } = { results };
    if (firstSuccessTime !== undefined) {
      result.firstSuccessTime = firstSuccessTime;
    }
    return result;
  }

  private async executeActionWithTimeout(
    action: JourneyAction,
    index: number,
    startTime: number
  ): Promise<{ result: ActionResult }> {
    try {
      const timeoutMs = typeof action.timeoutMs === 'number' ? action.timeoutMs : 30000;
      const timeoutPromise = this.createTimeoutPromise(index, timeoutMs);
      const result = await Promise.race([this.executor.execute(action), timeoutPromise]);
      return { result: { ...result, index } };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      return {
        result: { index, succeeded: false, durationMs: Date.now() - startTime, error: errorMsg },
      };
    }
  }

  private createTimeoutPromise(index: number, timeoutMs: number): Promise<never> {
    return new Promise<never>((_, reject) => {
      const indexStr = String(index);
      const timeoutStr = String(timeoutMs);
      setTimeout(() => {
        reject(new Error(`Action ${indexStr} timed out after ${timeoutStr}ms`));
      }, timeoutMs);
    });
  }

  private buildJourneyResult(
    journey: UserJourney,
    startTime: number,
    state: { results: ActionResult[]; firstSuccessTime?: number; failedAt?: number; error?: string }
  ): JourneyResult {
    const durationMs = Date.now() - startTime;
    const succeeded =
      state.failedAt === undefined && this.checkSuccessCriteria(journey, state.results);
    this.log.info('Journey simulation completed', {
      journeyId: journey.id,
      succeeded,
      durationMs,
      actionsCompleted: state.results.length,
    });

    const base: {
      journeyId: string;
      succeeded: boolean;
      timeToFirstSuccessMs: number;
      actionResults: readonly ActionResult[];
      durationMs: number;
    } = {
      journeyId: journey.id,
      succeeded,
      timeToFirstSuccessMs: state.firstSuccessTime ?? durationMs,
      actionResults: state.results,
      durationMs,
    };
    const optional: { failedAtAction?: number; error?: string } = {};
    if (state.failedAt !== undefined) {
      optional.failedAtAction = state.failedAt;
    }
    if (state.error !== undefined) {
      optional.error = state.error;
    }
    return { ...base, ...optional } as JourneyResult;
  }

  /**
   * Generate documentation from journey results.
   */
  generateDocs(journey: UserJourney, result: JourneyResult): string {
    const lines: string[] = [`# ${journey.name}`, '', journey.description, '', '## Actions', ''];

    this.appendActionDocs(lines, journey, result);
    this.appendSummaryDocs(lines, result);
    this.appendCriteriaDocs(lines, journey);

    return lines.join('\n');
  }

  private appendActionDocs(lines: string[], journey: UserJourney, result: JourneyResult): void {
    for (let i = 0; i < journey.actions.length; i++) {
      const action = journey.actions[i];
      if (action === undefined) continue;
      const actionResult = result.actionResults[i];
      const status = this.getActionStatus(actionResult);
      const indexStr = String(i + 1);

      lines.push(`${indexStr}. ${status} **${action.type}**: \`${action.command}\``);
      if (action.expectedOutcome !== undefined && action.expectedOutcome !== '') {
        lines.push(`   - Expected: ${action.expectedOutcome}`);
      }
      if (actionResult !== undefined) {
        const durationStr = String(actionResult.durationMs);
        lines.push(`   - Duration: ${durationStr}ms`);
        if (actionResult.error !== undefined && actionResult.error !== '') {
          lines.push(`   - Error: ${actionResult.error}`);
        }
      }
    }
  }

  private getActionStatus(actionResult: ActionResult | undefined): string {
    if (actionResult === undefined) return '⏭️';
    return actionResult.succeeded ? '✅' : '❌';
  }

  private appendSummaryDocs(lines: string[], result: JourneyResult): void {
    const statusText = result.succeeded ? 'Passed' : 'Failed';
    const durationStr = String(result.durationMs);
    const firstSuccessStr = String(result.timeToFirstSuccessMs);

    lines.push('');
    lines.push('## Summary');
    lines.push('');
    lines.push(`- **Status**: ${statusText}`);
    lines.push(`- **Duration**: ${durationStr}ms`);
    lines.push(`- **Time to First Success**: ${firstSuccessStr}ms`);

    if (result.failedAtAction !== undefined) {
      const failedAtStr = String(result.failedAtAction + 1);
      const errorStr = result.error ?? 'Unknown error';
      lines.push(`- **Failed at**: Action ${failedAtStr}`);
      lines.push(`- **Error**: ${errorStr}`);
    }
  }

  private appendCriteriaDocs(lines: string[], journey: UserJourney): void {
    lines.push('');
    lines.push('## Success Criteria');
    lines.push('');
    for (const criterion of journey.successCriteria) {
      lines.push(`- [ ] ${criterion}`);
    }
  }

  /**
   * Check if success criteria are met.
   */
  private checkSuccessCriteria(journey: UserJourney, results: readonly ActionResult[]): boolean {
    // All actions must succeed
    if (results.some((r) => !r.succeeded)) {
      return false;
    }

    // All actions must complete
    if (results.length !== journey.actions.length) {
      return false;
    }

    // Check time constraint
    const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);
    if (totalDuration > journey.maxTimeToFirstSuccessMs) {
      return false;
    }

    return true;
  }
}

/**
 * Factory function to create a journey simulator.
 */
export function createJourneySimulator(executor?: IActionExecutor): IJourneySimulator {
  return new JourneySimulator(executor);
}
