/**
 * Tests for Scenario CLI Command (Epic #952, Phase 4)
 *
 * @module cli/scenario-command.test
 */

import { describe, it, expect } from 'vitest';
import { resolve, join } from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import * as yaml from 'yaml';
import { createScenarioRunner } from '../testing/e2e/scenario-runner.js';

// ============================================================================
// Fixture Discovery Tests
// ============================================================================

const FIXTURES_DIR = resolve(import.meta.dirname ?? '.', '../testing/e2e/fixtures');

describe('scenario fixtures', () => {
  it('fixture directory exists and has scenario files', async () => {
    const files = await readdir(FIXTURES_DIR);
    const scenarios = files.filter((f: string) => f.endsWith('.scenario.yaml'));

    expect(scenarios.length).toBeGreaterThanOrEqual(4);
  });

  it('each fixture has required fields', async () => {
    const files = await readdir(FIXTURES_DIR);
    const scenarios = files.filter((f: string) => f.endsWith('.scenario.yaml'));

    for (const file of scenarios) {
      const content = await readFile(join(FIXTURES_DIR, file), 'utf-8');
      const data = yaml.parse(content) as Record<string, unknown>;

      expect(data['id']).toBeDefined();
      expect(typeof data['id']).toBe('string');
      expect(data['name']).toBeDefined();
      expect(data['workflow']).toBeDefined();
      expect(data['expectedOutputs']).toBeDefined();
    }
  });

  it('loads e2e-orchestration-sanity fixture', async () => {
    const runner = createScenarioRunner();
    const fixture = await runner.loadFixture(
      join(FIXTURES_DIR, 'e2e-orchestration-sanity.scenario.yaml')
    );

    expect(fixture.id).toBe('e2e-orchestration-sanity');
    expect(fixture.tags).toContain('orchestration');
  });

  it('loads branch-coverage-drill fixture', async () => {
    const runner = createScenarioRunner();
    const fixture = await runner.loadFixture(
      join(FIXTURES_DIR, 'branch-coverage-drill.scenario.yaml')
    );

    expect(fixture.id).toBe('branch-coverage-drill');
    expect(fixture.tags).toContain('coverage');
  });

  it('loads filesystem-rehydration fixture', async () => {
    const runner = createScenarioRunner();
    const fixture = await runner.loadFixture(
      join(FIXTURES_DIR, 'filesystem-rehydration.scenario.yaml')
    );

    expect(fixture.id).toBe('filesystem-rehydration');
    expect(fixture.tags).toContain('checkpoint');
  });

  it('loads mcp-front-end-flow fixture', async () => {
    const runner = createScenarioRunner();
    const fixture = await runner.loadFixture(
      join(FIXTURES_DIR, 'mcp-front-end-flow.scenario.yaml')
    );

    expect(fixture.id).toBe('mcp-front-end-flow');
    expect(fixture.tags).toContain('mcp');
  });
});

// ============================================================================
// Scenario Runner Integration
// ============================================================================

describe('scenario runner with fixtures', () => {
  it('runs e2e-orchestration-sanity in stub mode', async () => {
    const runner = createScenarioRunner();
    const fixture = await runner.loadFixture(
      join(FIXTURES_DIR, 'e2e-orchestration-sanity.scenario.yaml')
    );
    const result = await runner.run(fixture);

    expect(result.scenarioId).toBe('e2e-orchestration-sanity');
    expect(result.passed).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('runs the 4 new scenarios in batch', async () => {
    const runner = createScenarioRunner();

    const newScenarios = [
      'e2e-orchestration-sanity',
      'branch-coverage-drill',
      'filesystem-rehydration',
      'mcp-front-end-flow',
    ];
    const fixtures = await Promise.all(
      newScenarios.map((n) => runner.loadFixture(join(FIXTURES_DIR, `${n}.scenario.yaml`)))
    );

    const results = await runner.runAll(fixtures);

    expect(results).toHaveLength(4);
    expect(results.every((r) => r.passed)).toBe(true);
  });

  it('supports dry-run mode', async () => {
    const runner = createScenarioRunner();
    const fixture = await runner.loadFixture(
      join(FIXTURES_DIR, 'mcp-front-end-flow.scenario.yaml')
    );
    const result = await runner.run(fixture, { dryRun: true });

    expect(result.passed).toBe(true);
    expect(result.scenarioId).toBe('mcp-front-end-flow');
  });
});
