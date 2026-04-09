/* eslint-disable no-console, @typescript-eslint/require-await, @typescript-eslint/no-unused-vars, @typescript-eslint/strict-boolean-expressions */
/**
 * Real E2E Pipeline Test — runs against actual TypeDoc warnings fix (#1697)
 *
 * Uses mock stages that simulate realistic expert behavior for a
 * real nexus-agents improvement task. Validates the full pipeline
 * flow with a non-trivial multi-task decomposition.
 */

import { runDevPipeline } from './dev-pipeline.js';
import type { DevPipelineStages, PipelineTask } from './dev-pipeline.js';
import * as fs from 'node:fs';

const planFile = '/tmp/typedoc-warnings-plan.md';
const taskInput = fs.existsSync(planFile)
  ? fs.readFileSync(planFile, 'utf-8')
  : 'Fix the 3 TypeDoc warnings in nexus-agents';

let voteCount = 0;

const stages: DevPipelineStages = {
  research: async (task) => {
    console.log('[RESEARCH] Analyzing TypeDoc warnings...');
    return `Research findings:
- Warning 1: ICircuitBreaker in circuit-breaker-types.ts referenced by CliRetryLoopConfig but not exported
- Warning 2: FailureCategory in circuit-breaker-types.ts referenced by cliCategorizeError but not exported
- Warning 3: @internal markers on symbols that are either unused or actually exported
- Location: packages/nexus-agents/src/cli-adapters/circuit-breaker-types.ts
- Barrel: packages/nexus-agents/src/cli-adapters/index.ts
- Export barrel: packages/nexus-agents/src/exports/cli-adapters.ts`;
  },

  plan: async (task, research, feedback) => {
    console.log(
      `[PLAN] ${feedback ? 'Revising with feedback: ' + feedback.slice(0, 80) : 'Creating plan...'}`
    );
    const plan = feedback
      ? `Revised plan incorporating feedback:
1. Export ICircuitBreaker and FailureCategory from cli-adapters barrel
2. Add re-exports to exports/cli-adapters.ts for public API
3. Audit @internal markers — remove from actually-exported symbols
4. ${feedback.includes('test') ? 'Add export contract tests for new exports' : 'Verify TypeDoc builds with 0 warnings'}
5. Run full TypeDoc build to confirm warnings resolved`
      : `Plan:
1. Export ICircuitBreaker from cli-adapters/index.ts
2. Export FailureCategory from cli-adapters/index.ts
3. Add to exports/cli-adapters.ts
4. Run TypeDoc to verify warnings resolved`;
    return plan;
  },

  vote: async (plan) => {
    voteCount++;
    console.log(`[VOTE #${String(voteCount)}] Evaluating plan...`);
    if (voteCount === 1) {
      return {
        kind: 'rejected' as const,
        feedback:
          'Plan should also include export contract tests to prevent regression. Also verify @internal markers.',
        approvalPercentage: 40,
      };
    }
    return { kind: 'approved' as const, approvalPercentage: 83 };
  },

  decompose: async (plan) => {
    console.log('[PM] Decomposing into tasks...');
    return [
      {
        id: 'td-1',
        title: 'Export circuit breaker types',
        description:
          'Export ICircuitBreaker and FailureCategory from cli-adapters/index.ts and exports/cli-adapters.ts',
        assignedTo: 'coder' as const,
        status: 'pending' as const,
      },
      {
        id: 'td-2',
        title: 'Audit @internal markers',
        description: 'Check all @internal JSDoc tags — remove stale ones, add missing ones',
        assignedTo: 'coder' as const,
        status: 'pending' as const,
      },
      {
        id: 'td-3',
        title: 'Add export contract tests',
        description: 'Add test assertions for ICircuitBreaker and FailureCategory exports',
        assignedTo: 'coder' as const,
        status: 'pending' as const,
      },
    ];
  },

  implement: async (task) => {
    console.log(
      `[CODE ${task.id}] ${task.title}${task.feedback ? ' (addressing: ' + task.feedback.slice(0, 50) + ')' : ''}`
    );
    if (task.id === 'td-1') {
      return `// cli-adapters/index.ts
export type { ICircuitBreaker, FailureCategory } from './circuit-breaker-types.js';

// exports/cli-adapters.ts
export type { ICircuitBreaker, FailureCategory } from '../cli-adapters/circuit-breaker-types.js';`;
    }
    if (task.id === 'td-2') {
      return `// Audit results:
// - ApiErrorSchema had stale @internal — removed (it IS exported)
// - ICircuitBreaker had no JSDoc — now exported, no @internal needed
// - FailureCategory had no JSDoc — now exported, no @internal needed`;
    }
    return `// export-contracts.test.ts additions:
it('exports ICircuitBreaker type', () => {
  expect(typeof ICircuitBreaker).toBeDefined();
});
it('exports FailureCategory type', () => {
  expect(typeof FailureCategory).toBeDefined();
});`;
  },

  qaReview: async (task, impl) => {
    console.log(`[QA ${task.id}] Reviewing...`);
    // td-3 needs work first time (missing import in test)
    if (task.id === 'td-3' && !task.feedback) {
      return {
        verdict: 'needs_work' as const,
        feedback: 'Test imports missing — add import statement',
        issues: ['Missing import'],
      };
    }
    return { verdict: 'pass' as const, feedback: 'Approved', issues: [] };
  },

  securityScan: async () => {
    console.log('[SECURITY] Scanning for type export security implications...');
    return { passed: true, feedback: 'No security implications from type exports' };
  },
};

async function main(): Promise<void> {
  console.log('\n=== Real E2E Pipeline Test: Fix TypeDoc Warnings (#1697) ===\n');
  const result = await runDevPipeline(taskInput, stages);

  console.log('\n=== Results ===');
  console.log(`Completed: ${String(result.completed)}`);
  console.log(`Vote iterations: ${String(result.voteIterations)}`);
  console.log(`QA iterations: ${String(result.qaIterations)}`);
  console.log(`Tasks: ${String(result.tasks.length)}`);
  console.log(`Security: ${String(result.securityPassed)}`);

  console.log('\n=== Tasks with implementations ===');
  for (const t of result.tasks) {
    console.log(`\n--- ${t.id}: ${t.title} (${t.status}) ---`);
    if (t.implementation) console.log(t.implementation.slice(0, 300));
  }

  console.log('\n=== Verification ===');
  const checks = [
    ['Pipeline completed', result.completed],
    ['Vote iterated (rejected then approved)', result.voteIterations === 2],
    ['3 tasks decomposed', result.tasks.length === 3],
    ['QA iterated (td-3 rejected then passed)', result.qaIterations === 4],
    [
      'All tasks have implementations',
      result.tasks.every((t) => t.implementation !== undefined && t.implementation !== ''),
    ],
    ['Security passed', result.securityPassed],
  ] as const;

  let allPassed = true;
  for (const [name, passed] of checks) {
    console.log(`${passed ? '✓' : '✗'} ${name}`);
    if (!passed) allPassed = false;
  }

  console.log(`\n${allPassed ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'}`);
  process.exit(allPassed ? 0 : 1);
}

void main();
