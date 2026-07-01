/**
 * Tests for the non-routing meta-strategy readiness consumer wired into `run`
 * (#4094). The verdict is SURFACED (logged) for operators; it must NEVER alter the
 * routed decision — that promotion path is #3552, deliberately not built here.
 *
 * The readiness log is emitted once per process (a deterministic function of the
 * static corpus). Each test resets modules so it observes a fresh first emission
 * against a clean `readinessLogged` guard.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { ILogger } from '../../core/index.js';
import type { LogContext } from '../../core/logger.js';

interface LogLine {
  readonly message: string;
  readonly context: LogContext | undefined;
}

/** A logger that records every info/warn line for assertion. */
function capturingLogger(): { logger: ILogger; lines: LogLine[] } {
  const lines: LogLine[] = [];
  const record = (message: string, context?: LogContext): void => {
    lines.push({ message, context });
  };
  const logger: ILogger = {
    debug: () => undefined,
    info: (message, context) => {
      record(message, context);
    },
    warn: (message, context) => {
      record(message, context);
    },
    error: () => undefined,
    child: () => logger,
    setLevel: () => undefined,
  };
  return { logger, lines };
}

const READINESS_MSG = 'meta-strategy learned-selector readiness';

/** Fresh module each test → clean once-per-process `readinessLogged` guard. */
async function freshRouteGoal(): Promise<typeof import('./run-tool.js').routeGoal> {
  vi.resetModules();
  const mod = await import('./run-tool.js');
  return mod.routeGoal;
}

describe('run readiness consumer — non-routing audit signal (#4094)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('surfaces the readiness verdict with delta/testCount when routing a goal', async () => {
    const routeGoal = await freshRouteGoal();
    const { logger, lines } = capturingLogger();
    routeGoal(
      { goal: 'fix the off-by-one bug in pagination.ts and make sure the tests pass' },
      logger
    );

    const readiness = lines.find((l) => l.message === READINESS_MSG);
    expect(readiness).toBeDefined();
    expect(readiness?.context).toMatchObject({
      ready: expect.any(Boolean),
      delta: expect.any(Number),
      testCount: expect.any(Number),
    });
  });

  it('logs the readiness verdict exactly once per process (not per decision)', async () => {
    const routeGoal = await freshRouteGoal();
    const { logger, lines } = capturingLogger();
    routeGoal({ goal: 'run a security audit of the payments module' }, logger);
    routeGoal({ goal: 'research the best vector database for our use case' }, logger);
    routeGoal({ goal: 'hold a consensus vote on whether to adopt GraphQL' }, logger);

    const emissions = lines.filter((l) => l.message === READINESS_MSG);
    expect(emissions).toHaveLength(1);
  });

  it('does NOT alter the routed decision (readiness is observed, never acted on)', async () => {
    const routeGoal = await freshRouteGoal();
    const goal = 'build a greenfield todo app from this written spec';
    // With the readiness consumer active (logger present) vs the routing-only path:
    // the selected strategy must be identical, proving the signal never feeds routing.
    const withLogger = routeGoal({ goal }, capturingLogger().logger);
    const withoutLogger = routeGoal({ goal });

    expect(withLogger.strategy).toBe(withoutLogger.strategy);
    expect(typeof withLogger.strategy).toBe('string');
    expect(withLogger.decisionId).not.toBe(withoutLogger.decisionId); // fresh id per call
  });

  it('is best-effort: a readiness-log failure never breaks routing', async () => {
    const routeGoal = await freshRouteGoal();
    // Throw ONLY on the readiness line so the orchestrator's own info logging (audit
    // sink, selection line) still works — isolating the readiness seam.
    let warned = false;
    const partialLogger: ILogger = {
      debug: () => undefined,
      info: (message: string) => {
        if (message === READINESS_MSG) throw new Error('readiness log boom');
      },
      warn: () => {
        warned = true;
      },
      error: () => undefined,
      child: () => partialLogger,
      setLevel: () => undefined,
    };
    const res = routeGoal({ goal: 'format this JSON snippet' }, partialLogger);
    expect(res.strategy).toBeDefined();
    expect(warned).toBe(true); // the swallow path logged a warn
  });
});
