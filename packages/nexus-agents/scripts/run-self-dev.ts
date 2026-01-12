#!/usr/bin/env npx tsx
/**
 * Self-Development Workflow Runner
 *
 * Executes the self-development meta-workflow to process approved issues.
 * Auto-selects the best available adapter (CLI first, then API).
 *
 * Usage: npx tsx scripts/run-self-dev.ts
 */

import {
  createSelfDevWorkflowEngine,
  createGitHubClient,
  createGitClient,
  createNotificationService,
  createAuditTrail,
  InMemoryAuditStorage,
} from '../src/workflows/self-development/index.js';
import { createAutoAdapter, getAvailableAdapters } from '../src/adapters/auto-adapter.js';
import { createLogger } from '../src/core/logger.js';
import type { IModelAdapter } from '../src/core/types/model.js';
import type { ILogger } from '../src/core/logger.js';

const logger = createLogger({ component: 'self-dev-runner' });

async function getRepositoryName(): Promise<string | null> {
  const { execSync } = await import('node:child_process');
  try {
    const remote = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
    const match = remote.match(/github\.com[:/](.+?)(\.git)?$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface AdapterResult {
  adapter: IModelAdapter;
  source: string;
  name: string;
  reason: string;
}

async function selectAdapter(log: ILogger): Promise<AdapterResult> {
  const available = await getAvailableAdapters();
  log.info('Available adapters', {
    clis: available.clis.length > 0 ? available.clis : 'none',
    hasApiKey: available.hasAnthropicKey,
  });

  const selection = await createAutoAdapter({ priority: 'cli-first', logger: log });
  log.info('Adapter selected', {
    source: selection.source,
    name: selection.name,
    reason: selection.reason,
  });
  return selection;
}

async function waitForCompletion(
  engine: ReturnType<typeof createSelfDevWorkflowEngine>,
  executionId: string,
  timeout: number
): Promise<ReturnType<typeof engine.getState> | undefined> {
  const startTime = Date.now();
  let state = engine.getState(executionId);
  while (state?.status === 'running' && Date.now() - startTime < timeout) {
    await sleep(2000);
    state = engine.getState(executionId);
    logger.info('Workflow progress', { status: state?.status, phase: state?.currentPhase });
  }
  return state;
}

async function waitForResult(
  engine: ReturnType<typeof createSelfDevWorkflowEngine>,
  executionId: string,
  timeout: number
): Promise<ReturnType<typeof engine.getResult> | undefined> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const result = engine.getResult(executionId);
    if (result !== undefined) return result;
    await sleep(500);
  }
  return undefined;
}

function printAuditTrail(storage: InMemoryAuditStorage): void {
  const events = storage.getAll();
  logger.info('Audit trail', { eventCount: events.length });
  for (const event of events.slice(-10)) {
    logger.info('Audit event', { severity: event.severity, event: event.event });
  }
}

async function runWorkflow(adapter: IModelAdapter, repository: string): Promise<void> {
  const githubClient = createGitHubClient(repository);
  const gitClient = createGitClient(process.cwd());
  const auditStorage = new InMemoryAuditStorage();
  const notifications = createNotificationService(true);

  const engine = createSelfDevWorkflowEngine({
    modelAdapter: adapter,
    githubClient,
    gitClient,
    auditTrail: createAuditTrail('self-dev-run', auditStorage),
    notifications,
  });

  engine.addEventListener((event) => {
    logger.info('Workflow event', { type: event.type, phase: event.phase });
  });

  const state = await engine.start({
    repository,
    autoCommit: false,
    autoMerge: false,
    issueLabels: ['self-development-approved'],
  });

  logger.info('Workflow started', { executionId: state.executionId, phase: state.currentPhase });

  const currentState = await waitForCompletion(engine, state.executionId, 300000);

  if (currentState?.status === 'paused') {
    logger.info('Workflow paused - awaiting human review', { executionId: state.executionId });
    logger.info('Auto-approving for demonstration...');
    await engine.submitReview(state.executionId, 'approved', 'Auto-approved by runner');
  }

  const result = await waitForResult(engine, state.executionId, 60000);

  if (result !== undefined) {
    logger.info('Workflow completed', {
      success: result.success,
      phase: result.phase,
      error: result.error,
    });
    printAuditTrail(auditStorage);
  } else {
    logger.warn('Workflow did not complete within timeout');
  }
}

async function main(): Promise<void> {
  logger.info('Starting Self-Development Workflow');

  const repository = await getRepositoryName();
  if (repository === null) {
    logger.error('Could not determine repository name from git remote');
    process.exit(1);
  }

  logger.info('Repository detected', { repository });

  let adapterResult: AdapterResult;
  try {
    adapterResult = await selectAdapter(logger);
  } catch (error) {
    logger.error(
      'No adapters available',
      error instanceof Error ? error : new Error(String(error))
    );
    logger.error('Please install a CLI (claude, gemini, codex) or set ANTHROPIC_API_KEY');
    process.exit(1);
  }

  await runWorkflow(adapterResult.adapter, repository);
}

main().catch((err: unknown) => {
  logger.error('Fatal error', err instanceof Error ? err : new Error(String(err)));
  process.exit(1);
});
