/**
 * nexus-agents/testing/adapters - Test Adapter Exports
 *
 * Mock implementations of CLI adapters for testing.
 */

export {
  MockCliAdapter,
  createTestAdapter,
  createFailingAdapter,
  createSlowAdapter,
} from './mock-adapter.js';

export type { MockAdapterConfig, RecordedRequest } from './mock-adapter.js';
