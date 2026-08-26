/**
 * Tests for the MCP policy-firewall registry and its staged rollout (#4888).
 *
 * @module mcp/middleware/policy-registry.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  getGlobalPolicyFirewall,
  setGlobalPolicyFirewall,
  resetGlobalPolicyFirewall,
  stagePolicyFirewallForRollout,
} from './policy-registry.js';
import { PolicyFirewall, createDefaultPolicyFirewall } from './policy.js';
import { createSecureHandler } from './secure-handler.js';
import type { ILogger } from '../../core/index.js';
import type { PolicyRule } from './policy-types.js';

function recordingLogger(): { logger: ILogger; infos: { message: string; ctx: unknown }[] } {
  const infos: { message: string; ctx: unknown }[] = [];
  const logger = {
    debug: vi.fn(),
    info: vi.fn((message: string, ctx: unknown) => infos.push({ message, ctx })),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as ILogger;
  return { logger, infos };
}

/** A rule that denies everything, so a mode change is observable in a decision. */
const DENY_ALL: PolicyRule = {
  name: 'deny-all',
  description: 'Denies every call so a mode change is observable.',
  check: () => ({ allowed: false, reason: 'denied by test rule' }),
};

describe('global policy firewall registry (#4888)', () => {
  beforeEach(() => {
    resetGlobalPolicyFirewall();
  });

  afterEach(() => {
    resetGlobalPolicyFirewall();
  });

  it('reports no firewall until one is wired', () => {
    // The pre-#4888 state must stay expressible: no firewall means handlers
    // skip the policy check, rather than silently denying.
    expect(getGlobalPolicyFirewall()).toBeUndefined();
  });

  it('returns the wired firewall', () => {
    const firewall = new PolicyFirewall({ mode: 'warn' });

    setGlobalPolicyFirewall(firewall);

    expect(getGlobalPolicyFirewall()).toBe(firewall);
  });

  describe('staged rollout', () => {
    it('downgrades a configured enforce to warn', () => {
      // `getPolicyValues` defaults policyMode to 'enforce', and that default has
      // never been applied to a real call. Applying it the moment the wiring
      // lands would deny on rules nothing has exercised.
      const firewall = new PolicyFirewall({ mode: 'enforce', rules: [DENY_ALL] });
      const { logger } = recordingLogger();

      stagePolicyFirewallForRollout(firewall, logger);

      expect(firewall.getMode()).toBe('warn');
      // Asserted through a decision, not just the mode field: warn mode has to
      // actually allow, or "audit first" is a label on an enforcing gate.
      const decision = firewall.evaluate({ toolName: 'any_tool', args: {}, mode: 'read-only' });
      expect(decision.allowed).toBe(true);
    });

    it('reports the configured mode alongside the one in effect', () => {
      const firewall = new PolicyFirewall({ mode: 'enforce' });
      const { logger, infos } = recordingLogger();

      stagePolicyFirewallForRollout(firewall, logger);

      expect(infos[0]?.message).toContain('warn mode');
      expect(infos[0]?.ctx).toMatchObject({ configuredMode: 'enforce' });
    });

    it('lets an ordinary read-only tool through under the DEFAULT rule set', () => {
      // The benign population, which the DENY_ALL cases above cannot speak for.
      // With the real default rules this passes only because of warn mode — see
      // the next test for what enforcing would do to it today.
      const firewall = createDefaultPolicyFirewall({ mode: 'enforce' });
      const { logger } = recordingLogger();

      stagePolicyFirewallForRollout(firewall, logger);

      const decision = firewall.evaluate({ toolName: 'memory_query', args: {}, mode: 'read-only' });
      expect(decision.allowed).toBe(true);
    });

    it('documents why the enforce path stays closed', () => {
      // Not a wish — the reason there is no opt-in yet. `isMutationTool` treats
      // an unknown tool as a mutation, `READ_ONLY_TOOLS` names two nexus tools,
      // and nothing supplies `executionMode`, so the effective mode is always
      // 'read-only'. Enforcing today denies almost every registered tool.
      const enforcing = createDefaultPolicyFirewall({ mode: 'enforce' });

      const decision = enforcing.evaluate({
        toolName: 'memory_query',
        args: {},
        mode: 'read-only',
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('mutation operation');
    });
  });

  describe('secure handlers consult the wired firewall', () => {
    // The seam #4888 is actually about. The registry and the firewall were both
    // fine in isolation; nothing carried one to the other, so the check inside
    // `createSecureHandler` was unreachable for all 47 registered tools.
    async function callToolWithNoExplicitFirewall(): Promise<{
      isError?: boolean;
      handlerRan: boolean;
    }> {
      let handlerRan = false;
      const handler = createSecureHandler(
        () => {
          handlerRan = true;
          return Promise.resolve({ content: [{ type: 'text' as const, text: 'ok' }] });
        },
        { toolName: 'some_tool' }
      );
      const result = await handler({});
      return { ...(result.isError !== undefined && { isError: result.isError }), handlerRan };
    }

    it('denies through the global firewall when no firewall was passed in deps', async () => {
      setGlobalPolicyFirewall(new PolicyFirewall({ mode: 'enforce', rules: [DENY_ALL] }));

      const { isError, handlerRan } = await callToolWithNoExplicitFirewall();

      expect(isError).toBe(true);
      expect(handlerRan).toBe(false);
    });

    it('runs the tool when the wired firewall is only warning', async () => {
      // The shipped default. Every rule still evaluates; nothing is blocked.
      setGlobalPolicyFirewall(new PolicyFirewall({ mode: 'warn', rules: [DENY_ALL] }));

      const { isError, handlerRan } = await callToolWithNoExplicitFirewall();

      expect(isError).toBeUndefined();
      expect(handlerRan).toBe(true);
    });

    it('leaves handlers unguarded when nothing was wired', async () => {
      const { handlerRan } = await callToolWithNoExplicitFirewall();

      expect(handlerRan).toBe(true);
    });
  });
});
