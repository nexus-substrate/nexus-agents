/**
 * Tests that an API routing arm can record and replay its own outcomes (#4400).
 *
 * `OutcomeCliSchema` was `CliName | 'unknown'`, with no `api:*` member — so no
 * `TaskOutcome.cli` could ever equal an API arm's id. `LinUCBBandit.warmStart`
 * matches arms BY NAME and silently `continue`d on a miss, so every API arm
 * discarded its entire history and began each process cold, reporting nothing.
 *
 * @module cli-adapters/api-arm-outcomes.test
 */

import { describe, it, expect } from 'vitest';
import { LinUCBBandit } from './linucb-bandit.js';
import { TaskOutcomeSchema, type TaskOutcome } from '../orchestration/outcomes/outcome-types.js';
import { apiArmId } from './types-core.js';

function outcome(cli: string, success: boolean): TaskOutcome {
  return {
    id: `o-${cli}-${String(success)}-${String(cli.length * (success ? 3 : 7))}`,
    cli,
    category: 'code_generation',
    model: 'claude-sonnet-4-6',
    success,
    durationMs: 100,
    timestamp: '2026-08-10T00:00:00.000Z',
    source: 'delegate',
  } as unknown as TaskOutcome;
}

describe('API arm outcome attribution (#4400)', () => {
  describe('schema', () => {
    it('accepts an api:* arm id', () => {
      const parsed = TaskOutcomeSchema.safeParse(outcome('api:custom-openai', true));

      expect(parsed.success).toBe(true);
    });

    it('accepts every api arm the router can register', () => {
      for (const vendor of ['anthropic', 'openai', 'google', 'custom-openai'] as const) {
        expect(TaskOutcomeSchema.safeParse(outcome(apiArmId(vendor), true)).success).toBe(true);
      }
    });

    it('still accepts the four CLI slots', () => {
      for (const cli of ['claude', 'gemini', 'codex', 'opencode']) {
        expect(TaskOutcomeSchema.safeParse(outcome(cli, true)).success).toBe(true);
      }
    });

    it("still accepts 'unknown' (#3624)", () => {
      expect(TaskOutcomeSchema.safeParse(outcome('unknown', false)).success).toBe(true);
    });

    it('still rejects a string that is not an arm at all', () => {
      // The union grew; it did not become permissive.
      expect(TaskOutcomeSchema.safeParse(outcome('not-an-arm', true)).success).toBe(false);
    });
  });

  describe('warm start', () => {
    it('replays history into an api arm', () => {
      // Before the schema widened, this count was necessarily 0 — the outcome
      // could not carry the arm's id in the first place.
      const bandit = new LinUCBBandit(['claude', 'api:custom-openai']);

      const replayed = bandit.warmStart([
        outcome('api:custom-openai', true),
        outcome('api:custom-openai', false),
      ]);

      expect(replayed).toBe(2);
    });

    it('replays CLI and api arms side by side', () => {
      const bandit = new LinUCBBandit(['claude', 'api:custom-openai']);

      expect(bandit.warmStart([outcome('claude', true), outcome('api:custom-openai', true)])).toBe(
        2
      );
    });

    it('still skips an arm this bandit does not have', () => {
      const bandit = new LinUCBBandit(['claude']);

      expect(bandit.warmStart([outcome('api:custom-openai', true)])).toBe(0);
    });
  });
});
