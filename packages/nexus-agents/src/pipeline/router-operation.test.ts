/**
 * Router construction is a distinct operation, and that is a decision (#5191).
 *
 * A panel ratified it 5/6 after two structural blockers were verified:
 * `createCompositeRouter` takes `Map<RoutingArmId, ICliAdapter>`, while the
 * registry offers `IResilientAdapter` (which `extends IModelAdapter`, not
 * `ICliAdapter`) one CLI at a time. No bridge exists, so the canonical path
 * cannot type-check for either router call site.
 *
 * It also should not be used here. The router IS the selection/failover layer,
 * so resilient-wrapped arms would nest two failover mechanisms, and a shared
 * circuit breaker would make an arm report unavailable without the router ever
 * testing it — the doctor-probe defect (#5209) applied to routing. The arm map
 * is also the LinUCB bandit space, so coupling arm availability to unrelated
 * failures would distort exploration signals.
 *
 * This mirrors `cli/doctor-probe-exemption.test.ts`: the choice lives in the
 * source, so the test asserts the source still makes it. Without this, a future
 * "route everything through the canonical path" cleanup would look correct and
 * silently change routing semantics.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

const ROUTER_SITES = [
  ['expert-bridge', 'pipeline/expert-bridge.ts'],
  ['orchestrate-command', 'cli/orchestrate-command.ts'],
] as const;

function source(rel: string): string {
  return readFileSync(join(SRC, rel), 'utf8');
}

describe('router construction is a second operation (#5191)', () => {
  describe.each(ROUTER_SITES)('%s', (_name, rel) => {
    it('builds its adapter map with createAllAdapters', () => {
      // Matched as an assignment rather than a substring: the explanatory
      // comment names the canonical function to say what is being declined, and
      // a bare substring check would flag that prose as if it were a call.
      const src = source(rel);
      expect(src).toMatch(/adapters\s*=\s*createAllAdapters\(/);
      expect(src).not.toMatch(/adapters\s*=\s*getGlobalRegistry\(/);
    });

    it('states that router construction is the reason', () => {
      const src = source(rel);
      expect(src).toMatch(/ROUTER CONSTRUCTION/);
      expect(src).toContain('#5191');
    });
  });

  it('names the nested-failover hazard, not just the type mismatch', () => {
    // The type mismatch alone would invite "so add a bridge". The semantic
    // reason is what makes this a decision rather than a workaround, so it has
    // to survive in the source.
    const src = source('pipeline/expert-bridge.ts');
    // Both halves of the claim, specifically: the router being the failover
    // layer, and the breaker answering without a test. A loose /failover/i
    // matched a later incidental mention and survived deleting the claim.
    expect(src).toMatch(/router IS the selection\/failover layer/);
    expect(src).toMatch(/nest two failover mechanisms/);
    expect(src).toMatch(/without the[\s\S]{0,40}router ever testing it/);
  });

  it('records the transport constraint at the site that has one', () => {
    // orchestrate-command cannot migrate even if the interface problem were
    // solved, because the registry has no transport concept (#5211).
    const src = source('cli/orchestrate-command.ts');
    expect(src).toContain('#5211');
    expect(src).toMatch(/CodexCliAdapter|transport/);
  });
});
