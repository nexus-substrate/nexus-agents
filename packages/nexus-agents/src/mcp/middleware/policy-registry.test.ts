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
  getGlobalExecutionMode,
  setGlobalExecutionMode,
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
    /** An env with the opt-in unset, whatever the test process carries. */
    const UNSET: NodeJS.ProcessEnv = {};

    it('downgrades a configured enforce to warn when the opt-in is unset', () => {
      // `getPolicyValues` defaults policyMode to 'enforce', and that default has
      // never been applied to a real call. Applying it the moment the wiring
      // lands would deny on rules nothing has exercised.
      const firewall = new PolicyFirewall({ mode: 'enforce', rules: [DENY_ALL] });
      const { logger } = recordingLogger();

      stagePolicyFirewallForRollout(firewall, logger, UNSET);

      expect(firewall.getMode()).toBe('warn');
      // Asserted through a decision, not just the mode field: warn mode has to
      // actually allow, or "audit first" is a label on an enforcing gate.
      const decision = firewall.evaluate({ toolName: 'any_tool', args: {}, mode: 'read-only' });
      expect(decision.allowed).toBe(true);
    });

    it('reports the effective mode and why, never the configured value (#6431)', () => {
      // The old line reported `configuredMode: 'enforce'` next to a firewall it
      // had just set to warn. A reader who stopped at that field believed in an
      // enforcement that did not happen. The line now names the mode in effect
      // and the reason it is in effect, and nothing else about modes.
      const firewall = new PolicyFirewall({ mode: 'enforce' });
      const { logger, infos } = recordingLogger();

      stagePolicyFirewallForRollout(firewall, logger, UNSET);

      expect(infos[0]?.ctx).toMatchObject({
        policyMode: 'warn (rollout default)',
        denialsApplied: false,
      });
      expect(infos[0]?.ctx).not.toHaveProperty('configuredMode');
    });

    describe('NEXUS_MCP_POLICY_ENFORCE (#6431, the opt-in #4987 described but never wired)', () => {
      it.each(['1', 'true', 'TRUE'])('=%s runs the firewall in enforce', (value) => {
        const firewall = new PolicyFirewall({ mode: 'enforce', rules: [DENY_ALL] });
        const { logger, infos } = recordingLogger();

        stagePolicyFirewallForRollout(firewall, logger, { NEXUS_MCP_POLICY_ENFORCE: value });

        expect(firewall.getMode()).toBe('enforce');
        // Through a decision: enforce has to actually deny.
        const decision = firewall.evaluate({ toolName: 'any_tool', args: {}, mode: 'read-only' });
        expect(decision.allowed).toBe(false);
        expect(infos[0]?.ctx).toMatchObject({
          policyMode: 'enforce (NEXUS_MCP_POLICY_ENFORCE)',
          denialsApplied: true,
        });
      });

      it('enforces even when the config said warn — the env var is the switch', () => {
        // `security.policy.policyMode` is still not read for the effective
        // mode; the operator flag is the one control, and this pins that a
        // config `warn` cannot silently win over an explicit opt-in.
        const firewall = new PolicyFirewall({ mode: 'warn', rules: [DENY_ALL] });
        const { logger } = recordingLogger();

        stagePolicyFirewallForRollout(firewall, logger, { NEXUS_MCP_POLICY_ENFORCE: '1' });

        expect(firewall.getMode()).toBe('enforce');
      });

      it.each(['0', 'false', 'yes', 'on', ''])('=%j leaves the firewall in warn', (value) => {
        // `yes`/`on`/'' are outside the parseBoolEnv accept-set: they fall back
        // to off here, and config/env-schema.ts reports them as invalid at
        // startup so the fallback is never silent.
        const firewall = new PolicyFirewall({ mode: 'enforce', rules: [DENY_ALL] });
        const { logger, infos } = recordingLogger();

        stagePolicyFirewallForRollout(firewall, logger, { NEXUS_MCP_POLICY_ENFORCE: value });

        expect(firewall.getMode()).toBe('warn');
        expect(infos[0]?.ctx).toMatchObject({ policyMode: 'warn (rollout default)' });
      });

      it('reads process.env when no env is injected', () => {
        vi.stubEnv('NEXUS_MCP_POLICY_ENFORCE', '1');
        try {
          const firewall = new PolicyFirewall({ mode: 'enforce' });
          stagePolicyFirewallForRollout(firewall, recordingLogger().logger);
          expect(firewall.getMode()).toBe('enforce');
        } finally {
          vi.unstubAllEnvs();
        }
      });
    });

    it('lets an ordinary read-only tool through under the DEFAULT rule set', () => {
      // The benign population, which the DENY_ALL cases above cannot speak for.
      // Since #5114 this passes on the merits (memory_query is readOnlyHint:
      // true), not only because of warn mode — the next test pins that.
      const firewall = createDefaultPolicyFirewall({ mode: 'enforce' });
      const { logger } = recordingLogger();

      stagePolicyFirewallForRollout(firewall, logger, UNSET);

      const decision = firewall.evaluate({ toolName: 'memory_query', args: {}, mode: 'read-only' });
      expect(decision.allowed).toBe(true);
    });

    it('documents what enforcing does now that tools are classified (#5114)', () => {
      // Before #5114 `isMutationTool` guessed "mutation" for 45 of 47 registered
      // tools, which is why the enforce path was closed. The manifest now
      // classifies every tool, so an enforcing firewall under an explicit
      // read-only lock lets a read-only tool through and denies a real
      // mutation. Since #6431 the default mode is read-write, and the registry
      // carries it to every secure handler (the seam tests below).
      const enforcing = createDefaultPolicyFirewall({ mode: 'enforce' });

      const read = enforcing.evaluate({ toolName: 'memory_query', args: {}, mode: 'read-only' });
      expect(read.allowed).toBe(true);

      const write = enforcing.evaluate({ toolName: 'memory_write', args: {}, mode: 'read-only' });
      expect(write.allowed).toBe(false);
      expect(write.reason).toContain('mutation operation');
    });
  });

  describe('execution mode reaches the secure handler (#6431, #6294)', () => {
    // The operator's `policy.defaultMode` used to travel from config to a log
    // line and stop: `createSecureHandler` resolved a literal 'read-only', so
    // an enforcing firewall would have denied every mutation tool no matter
    // what the operator set. The registry now carries the mode, the same seam
    // #4888 chose for the firewall.
    async function callMutationToolWithNoExplicitMode(): Promise<{
      isError?: boolean;
      handlerRan: boolean;
    }> {
      let handlerRan = false;
      const handler = createSecureHandler(
        () => {
          handlerRan = true;
          return Promise.resolve({ content: [{ type: 'text' as const, text: 'ok' }] });
        },
        // memory_write is readOnlyHint: false in the manifest.
        { toolName: 'memory_write' }
      );
      const result = await handler({});
      return { ...(result.isError !== undefined && { isError: result.isError }), handlerRan };
    }

    it('defaults to read-write, the schema default', () => {
      expect(getGlobalExecutionMode()).toBe('read-write');
    });

    it('lets a mutation tool run through an ENFORCING default rule set under the default mode', async () => {
      // The benign population on the production seam: enforce + shipped rules +
      // no mode passed by the registration = allowed.
      setGlobalPolicyFirewall(createDefaultPolicyFirewall({ mode: 'enforce' }));

      const { isError, handlerRan } = await callMutationToolWithNoExplicitMode();

      expect(isError).toBeUndefined();
      expect(handlerRan).toBe(true);
    });

    it('denies the same call once the operator sets the read-only lock', async () => {
      // Mutating the middle link: the same handler, the same firewall, only the
      // registry's mode changed — so the allow above is the mode's doing, not
      // a rule that cannot fire.
      setGlobalPolicyFirewall(createDefaultPolicyFirewall({ mode: 'enforce' }));
      setGlobalExecutionMode('read-only');

      const { isError, handlerRan } = await callMutationToolWithNoExplicitMode();

      expect(isError).toBe(true);
      expect(handlerRan).toBe(false);
    });

    it('resolves the mode at CALL time, not at handler creation (#6431 review)', async () => {
      // Handlers are created at registration, before `registerMcpTools` sets
      // the operator's mode; a mode captured in the closure would be the
      // pre-registration default for the life of the process.
      setGlobalPolicyFirewall(createDefaultPolicyFirewall({ mode: 'enforce' }));
      let handlerRan = false;
      const handler = createSecureHandler(
        () => {
          handlerRan = true;
          return Promise.resolve({ content: [{ type: 'text' as const, text: 'ok' }] });
        },
        { toolName: 'memory_write' }
      );

      setGlobalExecutionMode('read-only');
      const result = await handler({});

      expect(result.isError).toBe(true);
      expect(handlerRan).toBe(false);
    });

    it('starts at the schema default before any reset has run (#6431 review)', async () => {
      // The initial literal and the reset value come from one helper; this
      // reads the module-initial value on a fresh module instance, which no
      // `resetGlobalPolicyFirewall()` has touched.
      vi.resetModules();
      const fresh = await import('./policy-registry.js');
      const { DEFAULT_EXECUTION_MODE } = await import('../../config/schemas-security.js');
      expect(fresh.getGlobalExecutionMode()).toBe(DEFAULT_EXECUTION_MODE);
    });

    it('resets to the default alongside the firewall', () => {
      setGlobalExecutionMode('read-only');
      resetGlobalPolicyFirewall();
      expect(getGlobalExecutionMode()).toBe('read-write');
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
