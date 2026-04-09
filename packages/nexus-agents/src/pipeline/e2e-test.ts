/* eslint-disable no-console, @typescript-eslint/require-await, @typescript-eslint/no-unused-vars */
/**
 * E2E Pipeline Test — validates the full development pipeline flow.
 *
 * Tests: research → plan → vote (with rejection iteration) → PM decompose →
 * parallel implement → QA (with rejection iteration) → security scan
 */

import { runDevPipeline } from './dev-pipeline.js';
import type { DevPipelineStages } from './dev-pipeline.js';

let voteCount = 0;

const mockStages: DevPipelineStages = {
  research: async (task) => {
    console.log('[RESEARCH] Input:', task.slice(0, 80));
    return 'Research: health check endpoint needed, returns system status as JSON.';
  },
  plan: async (task, research, feedback) => {
    console.log('[PLAN] Has feedback:', feedback !== undefined);
    if (feedback !== undefined) console.log('[PLAN] Incorporating:', feedback.slice(0, 100));
    return 'Plan: 1. Add /health endpoint 2. Return uptime+version+memory 3. Add tests 4. Error handling';
  },
  vote: async (plan) => {
    voteCount++;
    console.log(`[VOTE #${String(voteCount)}] Plan length: ${String(plan.length)}`);
    if (voteCount === 1) {
      return {
        kind: 'rejected' as const,
        feedback: 'Missing error handling for degraded services',
        approvalPercentage: 33,
      };
    }
    return { kind: 'approved' as const, approvalPercentage: 83 };
  },
  decompose: async (plan) => {
    console.log('[PM] Decomposing into tasks...');
    return [
      {
        id: 'h-1',
        title: 'Health endpoint',
        description: 'Create GET /health',
        assignedTo: 'coder' as const,
        status: 'pending' as const,
      },
      {
        id: 'h-2',
        title: 'Health tests',
        description: 'Unit + integration tests',
        assignedTo: 'coder' as const,
        status: 'pending' as const,
      },
    ];
  },
  implement: async (task) => {
    console.log(`[CODE ${task.id}] Implementing: ${task.title}`);
    if (task.feedback !== undefined)
      console.log(`[CODE ${task.id}] Addressing QA feedback: ${task.feedback.slice(0, 80)}`);
    return `// ${task.title}\nexport function health() { return { status: "ok" }; }`;
  },
  qaReview: async (task, _impl) => {
    // h-2 fails first time, passes on retry
    if (task.id === 'h-2' && task.feedback === undefined) {
      console.log(`[QA ${task.id}] NEEDS_WORK — missing edge case`);
      return {
        verdict: 'needs_work' as const,
        feedback: 'Add timeout edge case test',
        issues: ['No timeout test'],
      };
    }
    console.log(`[QA ${task.id}] PASS`);
    return { verdict: 'pass' as const, feedback: 'Approved', issues: [] };
  },
  securityScan: async () => {
    console.log('[SECURITY] Scanning...');
    return { passed: true, feedback: 'No critical findings' };
  },
};

async function main(): Promise<void> {
  console.log('\n=== E2E Pipeline Test ===\n');
  console.log('Task: Add a health check endpoint to nexus-agents REST server\n');

  const result = await runDevPipeline(
    'Add a health check endpoint to the nexus-agents REST server',
    mockStages
  );

  console.log('\n=== Results ===');
  console.log(`Completed: ${String(result.completed)}`);
  console.log(
    `Vote iterations: ${String(result.voteIterations)} (expected: 2 — first rejected, second approved)`
  );
  console.log(
    `QA iterations: ${String(result.qaIterations)} (expected: 3 — h-1 passes, h-2 fails then passes)`
  );
  console.log(`Tasks: ${String(result.tasks.length)} (expected: 2)`);
  console.log(`Security: ${String(result.securityPassed)}`);

  console.log('\n=== Flow Verification ===');
  const checks = [
    ['Vote feedback loop works', result.voteIterations === 2],
    ['Tasks decomposed', result.tasks.length === 2],
    ['QA iteration works (reject→retry)', result.qaIterations === 3],
    ['Security gate passed', result.securityPassed],
    ['Pipeline completed', result.completed],
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
