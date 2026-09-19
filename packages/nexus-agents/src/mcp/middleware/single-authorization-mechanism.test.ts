/**
 * Inbound MCP dispatch has ONE authorization mechanism: PolicyFirewall (#5107).
 *
 * History, because the shape of this file only makes sense with it. The
 * ClawGuard chain adapter was mounted on every `withMiddleware` chain (#1977)
 * and read its policy from AsyncLocalStorage — a store only the two in-process
 * orchestrator / expert callers ever populated, and an inbound MCP request is a
 * SIBLING async context of both. So 124 tests passed over a guard that was a
 * pass-through for every real dispatch. The #5022 panel retired ClawGuard as
 * enforcement, #5106 made it advisory, #5107 deleted the mount, and #5108
 * deleted the deriver that populated the store (moving its secret-path
 * denylist into the `secret-paths` firewall rule).
 *
 * This file lived beside the deriver as `access-policy-reachability.test.ts`
 * and pinned two halves. The half that put a ClawGuard policy in scope and
 * asserted it was NOT consulted went with the deriver — there is no longer a
 * policy to put in scope. The half that survives is the positive claim:
 *
 *   1. the chain reports no authorization stage for the wrapper every
 *      registered tool goes through, and the only authorization stage it CAN
 *      mount is PolicyFirewall's;
 *   2. PolicyFirewall evaluates a real registered tool call through the REAL
 *      server wiring, with no injected firewall and no stub rule set.
 *
 * A deletion whose only evidence is "tests still pass" cannot distinguish
 * "consolidated onto PolicyFirewall" from "dropped, and nothing took its
 * place". These tests can. Do not delete this file to make a refactor green.
 *
 * WHY THE FIREWALL TEST ASSERTS EVALUATION, NOT DENIAL (#5114, #4988).
 * `stagePolicyFirewallForRollout` stages every wired firewall to `warn` unless
 * the operator sets `NEXUS_MCP_POLICY_ENFORCE=1` (#6431), and in warn mode a
 * rule's denial is rewritten to an allow. Enforce by default is #4988's
 * decision. A test asserting a denial would fail today, and the tempting
 * repair would be to weaken it into something that passes. So the assertion is
 * that the real default rules RAN against the real call and returned a
 * decision. When #4988 makes enforce the default, add the denial test beside
 * this one; do not replace it. (`secret-paths-rule.test.ts` already covers the
 * enforce-mode denial against an injected firewall.)
 *
 * @module mcp/middleware/single-authorization-mechanism.test
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { ILogger } from '../../core/index.js';
import { createServer, connectTransport } from '../server.js';
import { registerMcpTools } from '../../cli-server-tools.js';
import { logSecurityConfig } from '../../cli-server-audit.js';
import { getGlobalPolicyFirewall, resetGlobalPolicyFirewall } from './policy-registry.js';
import { createDefaultPolicyFirewall } from './policy.js';
import { createMiddlewareChain } from './middleware-chain.js';
import { wrapToolWithTimeout } from './tool-wrapper.js';

function okResult(): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text' as const, text: 'handler-ran' }] };
}

/** A logger that keeps every call so a test can read what a component reported. */
interface CapturingLogger extends ILogger {
  readonly calls: Array<{ level: string; message: string; context: unknown }>;
}

function capturingLogger(): CapturingLogger {
  const calls: CapturingLogger['calls'] = [];
  const record =
    (level: string) =>
    (message: string, context?: unknown): void => {
      calls.push({ level, message, context });
    };
  const logger: CapturingLogger = {
    calls,
    debug: record('debug'),
    info: record('info'),
    warn: record('warn'),
    error: (message, _error, context) => calls.push({ level: 'error', message, context }),
    child: () => logger,
    setLevel: () => undefined,
  };
  return logger;
}

/** The stage list the chain reports when it is built; `undefined` if it never reported one. */
function reportedStages(logger: CapturingLogger): unknown {
  const built = logger.calls.find((c) => c.message === 'Middleware chain built');
  return (built?.context as { stages?: unknown } | undefined)?.stages;
}

describe('single authorization mechanism on the inbound MCP boundary (#5107)', () => {
  // The chain reports the stages it actually built, from the array it
  // composes — not from a hand-kept list — so a stage cannot be mounted
  // without appearing here. Exact equality on purpose: a new observability
  // stage means editing this list, while a new AUTHORIZATION stage is a
  // #5022-class decision and must not land as a test edit.

  it('the wrapper every registered tool uses mounts no authorization stage', () => {
    const logger = capturingLogger();

    // `wrapToolWithTimeout(name, createSecureHandler(...))` is the production
    // shape (e.g. `list-experts.ts`). Authorization for that shape lives in
    // `createSecureHandler` → `runPolicyCheck` → the process PolicyFirewall,
    // which the real-server test below exercises. The chain itself must be
    // observability and runaway-guarding only.
    wrapToolWithTimeout('list_experts', () => Promise.resolve(okResult()), { logger });

    expect(reportedStages(logger)).toEqual(['metrics', 'audit', 'timeout']);
  });

  it('the only authorization stage the chain can mount is the PolicyFirewall one', () => {
    const logger = capturingLogger();

    createMiddlewareChain({
      toolName: 'single_mechanism_probe',
      policyFirewall: createDefaultPolicyFirewall(),
      logger,
      skip: { audit: true, rateLimit: true, validation: true, timeout: true },
    });

    // Every optional stage off, the firewall on: what remains besides the
    // unconditional metrics stage is the one authorization stage, and it is
    // PolicyFirewall's. A second mechanism re-mounted here — ClawGuard or a
    // successor — appears as a fourth name and fails this line.
    expect(reportedStages(logger)).toEqual(['metrics', 'policy']);
  });
});

describe('PolicyFirewall evaluates a real registered tool call through the real server wiring (#5107)', () => {
  afterEach(() => {
    // Module-level state: `registerMcpTools` wires the firewall for the
    // process, and leaving it would leak into every later test in the file.
    resetGlobalPolicyFirewall();
    vi.restoreAllMocks();
  });

  it('runs the real default rules against list_experts and returns a decision', async () => {
    const serverResult = createServer();
    if (!serverResult.ok) throw new Error(serverResult.error.message);
    const { server } = serverResult.value;
    const logger = capturingLogger();

    // The startup path, minus stdio: `startServer` → `logSecurityConfig`
    // builds the configured firewall → `registerMcpTools` stages it into the
    // process registry and registers every tool. No firewall is injected and
    // no rule set is stubbed — the seam that `policy-registry.test.ts` and
    // `cli-server-tools.test.ts` each mock one half of.
    registerMcpTools({
      server,
      logger,
      builtInTemplates: new Map(),
      policyFirewall: logSecurityConfig(logger),
    });

    const firewall = getGlobalPolicyFirewall();
    if (firewall === undefined) throw new Error('registerMcpTools did not wire a firewall');
    // The real instance with the real rules; the spy only records.
    const evaluate = vi.spyOn(firewall, 'evaluate');
    expect(firewall.getRules().map((r) => r.name)).toEqual([
      'deny-mutations-without-mode',
      'secret-paths',
      'safe-paths',
    ]);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const connected = await connectTransport(server, serverTransport, logger);
    if (!connected.ok) throw new Error(connected.error.message);
    const client = new Client({ name: 'reachability-test', version: '1.0.0' });
    await client.connect(clientTransport);

    try {
      const response = (await client.callTool({ name: 'list_experts', arguments: {} })) as {
        isError?: boolean;
      };

      // Evaluation, not denial — see the module note. The rules ran once for
      // this call, named the tool, and produced a decision.
      expect(evaluate).toHaveBeenCalledTimes(1);
      expect(evaluate.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ toolName: 'list_experts' })
      );
      const decision = evaluate.mock.results[0]?.value as { allowed: boolean; reason: string };
      expect(decision.allowed).toBe(true);
      expect(decision.reason).toEqual(expect.any(String));
      // `warn` is what `stagePolicyFirewallForRollout` stages without the
      // NEXUS_MCP_POLICY_ENFORCE opt-in (#6431); enforce by default is #4988's
      // decision. Pinning it here keeps the "not denial" reasoning above
      // honest: the day this reads `enforce`, the denial test is due.
      expect(firewall.getMode()).toBe('warn');
      expect(response.isError).not.toBe(true);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
