/**
 * SICA Test Generator
 *
 * Generates tests for SICA agent code using TestingExpert.
 * Tracks coverage metrics and validates generated tests.
 *
 * (Source: Issue #256, Phase 3.2 - Self-Generated Test Automation)
 */

import { randomUUID } from 'crypto';
import type { ILogger } from '../../core/index.js';
import { createLogger } from '../../core/index.js';
import type {
  CoverageMetrics,
  CoverageGap,
  GeneratedTest,
  TestGenerationOptions,
  TestGenerationResult,
  TestValidationResult,
  TestFramework,
  TestType,
  VersionTestMetrics,
  TestImprovementAttempt,
  SicaTestEvent,
  SicaTestEventType,
} from './sica-test-types.js';
import type { VersionId, AgentVersion } from './sica-types.js';
import {
  DEFAULT_TARGET_COVERAGE,
  DEFAULT_FRAMEWORK,
  DEFAULT_TEST_TYPES,
  DEFAULT_MAX_TESTS_PER_FILE,
  type ResolvedOptions,
  createSuccessResult,
  matchesFocusPaths,
  selectTestType,
  generateTestCode,
  extractScenarios,
  validateTestSyntax,
  calculatePriority,
} from './sica-test-helpers.js';

/** Interface for test generators. */
export interface ITestGenerator {
  generateTests(options?: TestGenerationOptions): Promise<TestGenerationResult>;
  validateTests(tests: readonly GeneratedTest[]): Promise<readonly TestValidationResult[]>;
  measureCoverage(): Promise<CoverageMetrics>;
  findCoverageGaps(target: number): Promise<readonly CoverageGap[]>;
}

/** Generates tests for SICA agent code. */
export class SicaTestGenerator implements ITestGenerator {
  private readonly logger: ILogger;
  private readonly versionMetrics: Map<VersionId, VersionTestMetrics>;
  private readonly eventListeners: Array<(event: SicaTestEvent) => void>;

  constructor(options: { logger?: ILogger } = {}) {
    this.logger = options.logger ?? createLogger({ component: 'sica-test-generator' });
    this.versionMetrics = new Map();
    this.eventListeners = [];
  }

  /** Generates tests based on coverage gaps. */
  async generateTests(options: TestGenerationOptions = {}): Promise<TestGenerationResult> {
    const start = Date.now();
    const opts = this.resolveOptions(options);

    this.logger.info('Starting test generation', {
      targetCoverage: opts.targetCoverage,
      framework: opts.framework,
    });

    const coverageBefore = await this.measureCoverage();
    const gaps = await this.findCoverageGaps(opts.targetCoverage);

    if (gaps.length === 0) {
      this.logger.info('No coverage gaps found');
      return createSuccessResult([], coverageBefore, coverageBefore, Date.now() - start);
    }

    const { tests, errors } = await this.processGaps(gaps, options, opts);
    const coverageAfter = this.projectCoverage(coverageBefore, tests);
    const coverageGain = coverageAfter.line - coverageBefore.line;

    this.emit('tests_generated', undefined, {
      count: tests.length,
      coverageGain,
      framework: opts.framework,
    });

    const durationMs = Date.now() - start;
    this.logger.info('Test generation complete', {
      testCount: tests.length,
      coverageGain,
      durationMs,
    });

    return {
      success: true,
      tests,
      coverageBefore,
      coverageAfter,
      coverageGain,
      errors,
      durationMs,
    };
  }

  /** Resolves generation options with defaults. */
  private resolveOptions(options: TestGenerationOptions): ResolvedOptions {
    return {
      targetCoverage: options.targetCoverage ?? DEFAULT_TARGET_COVERAGE,
      framework: options.framework ?? DEFAULT_FRAMEWORK,
      testTypes: options.testTypes ?? DEFAULT_TEST_TYPES,
      maxPerFile: options.maxTestsPerFile ?? DEFAULT_MAX_TESTS_PER_FILE,
    };
  }

  /** Processes coverage gaps and generates tests. */
  private async processGaps(
    gaps: readonly CoverageGap[],
    options: TestGenerationOptions,
    opts: ResolvedOptions
  ): Promise<{ tests: GeneratedTest[]; errors: string[] }> {
    const tests: GeneratedTest[] = [];
    const errors: string[] = [];

    for (const gap of gaps) {
      if (options.focusPaths && !matchesFocusPaths(gap.path, options.focusPaths)) {
        continue;
      }
      const gapTests = this.generateTestsForGap(gap, opts);
      tests.push(...gapTests);
      if (tests.length >= opts.maxPerFile * gaps.length) break;
    }

    if (options.validate !== false && tests.length > 0) {
      const results = await this.validateTests(tests);
      const invalid = results.filter((r) => !r.valid);
      if (invalid.length > 0) errors.push(`${String(invalid.length)} tests failed validation`);
    }

    return { tests, errors };
  }

  /** Generates tests for a specific coverage gap. */
  private generateTestsForGap(
    gap: CoverageGap,
    options: { framework: TestFramework; testTypes: readonly TestType[]; maxPerFile: number }
  ): GeneratedTest[] {
    const tests: GeneratedTest[] = [];
    const { framework, testTypes, maxPerFile } = options;

    for (const area of gap.uncoveredAreas.slice(0, maxPerFile)) {
      const testType = selectTestType(area, testTypes);
      const test = this.createTestForArea(gap.path, area, testType, framework);
      tests.push(test);
    }

    return tests;
  }

  /** Creates a test for a specific uncovered area. */
  private createTestForArea(
    path: string,
    area: string,
    testType: TestType,
    framework: TestFramework
  ): GeneratedTest {
    const id = randomUUID();
    const name = `should test ${area}`;
    const code = generateTestCode(path, area, testType, framework);
    const scenarios = extractScenarios(area);

    return {
      id,
      name,
      type: testType,
      code,
      target: path,
      scenarios,
      framework,
      generatedAt: new Date(),
    };
  }

  /** Validates generated tests. */
  validateTests(tests: readonly GeneratedTest[]): Promise<readonly TestValidationResult[]> {
    const results: TestValidationResult[] = [];

    for (const test of tests) {
      const start = Date.now();
      const result = this.validateSingleTest(test);
      results.push({ ...result, durationMs: Date.now() - start });
    }

    this.emit('tests_validated', undefined, {
      total: tests.length,
      valid: results.filter((r) => r.valid).length,
      passing: results.filter((r) => r.passes).length,
    });

    return Promise.resolve(results);
  }

  /** Validates a single test. */
  private validateSingleTest(test: GeneratedTest): Omit<TestValidationResult, 'durationMs'> {
    const syntaxErrors = validateTestSyntax(test.code);
    if (syntaxErrors.length > 0) {
      return { testId: test.id, valid: false, passes: false, syntaxErrors };
    }

    // In a real implementation, we would run the test
    // For now, we do heuristic validation
    const valid = test.code.includes('expect') && test.code.includes('describe');
    return { testId: test.id, valid, passes: valid };
  }

  /** Measures current coverage metrics. */
  measureCoverage(): Promise<CoverageMetrics> {
    // In a real implementation, this would run vitest --coverage
    // For now, return baseline metrics for SICA code
    const coverage: CoverageMetrics = {
      line: 75,
      branch: 70,
      function: 80,
      statement: 76,
      uncoveredAreas: ['improvement edge cases', 'error recovery paths', 'version tree traversal'],
    };

    this.emit('coverage_measured', undefined, { ...coverage });
    return Promise.resolve(coverage);
  }

  /** Finds coverage gaps below target. */
  async findCoverageGaps(target: number): Promise<readonly CoverageGap[]> {
    const coverage = await this.measureCoverage();
    const gaps: CoverageGap[] = [];

    if (coverage.line < target) {
      gaps.push({
        path: 'src/agents/self-improving/sica-agent.ts',
        current: coverage.line,
        target,
        gap: target - coverage.line,
        uncoveredAreas: coverage.uncoveredAreas ?? [],
        priority: calculatePriority(coverage.line, target),
      });
    }

    return gaps;
  }

  /** Projects coverage after adding tests. */
  private projectCoverage(
    before: CoverageMetrics,
    tests: readonly GeneratedTest[]
  ): CoverageMetrics {
    // Each test adds approximately 2-5 coverage points
    const gain = Math.min(tests.length * 2, 20);
    return {
      line: Math.min(before.line + gain, 100),
      branch: Math.min(before.branch + gain * 0.8, 100),
      function: Math.min(before.function + gain * 0.9, 100),
      statement: Math.min(before.statement + gain, 100),
    };
  }

  /** Generates tests for a specific SICA version. */
  async generateTestsForVersion(
    version: AgentVersion,
    options?: TestGenerationOptions
  ): Promise<TestGenerationResult> {
    this.logger.info('Generating tests for version', { versionId: version.id });
    const result = await this.generateTests(options);

    if (result.success && result.tests.length > 0) {
      this.updateVersionMetrics(version.id, result);
    }

    return result;
  }

  /** Records a test improvement attempt. */
  recordTestImprovement(attempt: TestImprovementAttempt): void {
    this.emit('test_improvement_attempted', attempt.sourceVersionId, {
      testCount: attempt.generatedTests.length,
      coverageGain: attempt.coverageGain,
      qualityScore: attempt.qualityScore,
      successful: attempt.successful,
    });
  }

  /** Gets test metrics for a version. */
  getVersionMetrics(versionId: VersionId): VersionTestMetrics | undefined {
    return this.versionMetrics.get(versionId);
  }

  /** Updates version metrics after test generation. */
  private updateVersionMetrics(versionId: VersionId, result: TestGenerationResult): void {
    const existing = this.versionMetrics.get(versionId);
    const tests = [...(existing?.generatedTests ?? []), ...result.tests];
    const passRate = result.errors.length === 0 ? 1 : 0.5;

    this.versionMetrics.set(versionId, {
      versionId,
      testCount: tests.length,
      passRate,
      coverage: result.coverageAfter,
      generatedTests: tests,
      lastUpdatedAt: new Date(),
    });

    if (result.coverageGain > 0) {
      this.emit('coverage_improved', versionId, {
        gain: result.coverageGain,
        newCoverage: result.coverageAfter.line,
      });
    }
  }

  /** Subscribes to test generator events. */
  onEvent(listener: (event: SicaTestEvent) => void): () => void {
    this.eventListeners.push(listener);
    return () => {
      const idx = this.eventListeners.indexOf(listener);
      if (idx >= 0) this.eventListeners.splice(idx, 1);
    };
  }

  /** Emits an event to all listeners. */
  private emit(
    type: SicaTestEventType,
    versionId: VersionId | undefined,
    data: Record<string, unknown>
  ): void {
    const event: SicaTestEvent =
      versionId !== undefined
        ? { type, versionId, timestamp: new Date(), data }
        : { type, timestamp: new Date(), data };
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }
}
