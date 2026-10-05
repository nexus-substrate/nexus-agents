/**
 * E2E Test Global Setup
 *
 * Runs once before all E2E tests.
 *
 * @module testing/e2e/setup
 */

import { NODE_ENGINE_RANGE, isNodeVersionSupported } from '../../version.js';
import { createLogger } from '../../core/logger.js';

const logger = createLogger({ component: 'e2e-setup' });

export function setup(): Promise<void> {
  logger.info('Starting E2E test setup');

  // Validate environment
  validateEnvironment();

  // Initialize any shared resources
  initializeResources();

  logger.info('E2E test setup complete');
  return Promise.resolve();
}

export function teardown(): Promise<void> {
  logger.info('Starting E2E test teardown');

  // Cleanup any shared resources
  cleanupResources();

  logger.info('E2E test teardown complete');
  return Promise.resolve();
}

function validateEnvironment(): void {
  // Check Node.js version
  const nodeVersion = process.version;
  if (!isNodeVersionSupported(nodeVersion)) {
    throw new Error(`Node.js ${NODE_ENGINE_RANGE} required for E2E tests. Found: ${nodeVersion}`);
  }

  logger.debug('Environment validated', { nodeVersion });
}

function initializeResources(): void {
  // Initialize any shared test resources here
  // (e.g., database connections, mock servers, etc.)
  logger.debug('Resources initialized');
}

function cleanupResources(): void {
  // Cleanup any shared test resources here
  logger.debug('Resources cleaned up');
}

// Export default for vitest globalSetup
export default async function (): Promise<() => Promise<void>> {
  await setup();
  return teardown;
}
