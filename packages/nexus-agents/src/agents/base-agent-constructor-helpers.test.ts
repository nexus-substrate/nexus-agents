/**
 * Tests for BaseAgent Constructor Helpers
 *
 * @module agents/base-agent-constructor-helpers.test
 */

import { describe, it, expect, vi } from 'vitest';
import { setupStateMachine, initializeInfrastructure } from './base-agent-constructor-helpers.js';
import type {
  StateMachineSetupParams,
  InfrastructureInitParams,
} from './base-agent-constructor-helpers.js';

// ============================================================================
// Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
    setLevel: vi.fn(),
  } as never;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeEventBus() {
  return {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  } as never;
}

// ============================================================================
// setupStateMachine
// ============================================================================

describe('setupStateMachine', () => {
  it('returns an AgentStateMachine instance', () => {
    const params: StateMachineSetupParams = {
      agentId: 'agent-1',
      logger: makeLogger(),
      eventBus: makeEventBus(),
      options: undefined,
    };

    const sm = setupStateMachine(params);

    expect(sm).toBeDefined();
    expect(sm.state).toBe('idle');
  });

  it('emits event on state transition', () => {
    const eventBus = makeEventBus();
    const params: StateMachineSetupParams = {
      agentId: 'agent-1',
      logger: makeLogger(),
      eventBus,
      options: undefined,
    };

    const sm = setupStateMachine(params);
    // Trigger a state transition
    sm.transition('task_assigned');

    expect((eventBus as unknown as { emit: ReturnType<typeof vi.fn> }).emit).toHaveBeenCalled();
  });

  it('logs debug on state transition', () => {
    const logger = makeLogger();
    const params: StateMachineSetupParams = {
      agentId: 'agent-1',
      logger,
      eventBus: makeEventBus(),
      options: undefined,
    };

    const sm = setupStateMachine(params);
    sm.transition('task_assigned');

    expect((logger as unknown as { debug: ReturnType<typeof vi.fn> }).debug).toHaveBeenCalledWith(
      'State transition',
      expect.objectContaining({
        from: 'idle',
        to: expect.any(String) as string,
      })
    );
  });

  it('passes options to state machine', () => {
    const params: StateMachineSetupParams = {
      agentId: 'agent-1',
      logger: makeLogger(),
      eventBus: makeEventBus(),
      options: { maxErrorCount: 5 },
    };

    const sm = setupStateMachine(params);

    expect(sm).toBeDefined();
  });
});

// ============================================================================
// initializeInfrastructure
// ============================================================================

describe('initializeInfrastructure', () => {
  it('returns pruning and memory infrastructure', () => {
    const params: InfrastructureInitParams = {
      agentId: 'agent-1',
      role: 'code_expert',
      logger: makeLogger(),
      adapter: undefined,
      pruningConfig: undefined,
      memoryConfig: undefined,
    };

    const result = initializeInfrastructure(params);

    expect(result.pruning).toBeDefined();
    expect(result.memory).toBeDefined();
  });

  it('memory is disabled when no backend configured', () => {
    const params: InfrastructureInitParams = {
      agentId: 'agent-1',
      role: 'code_expert',
      logger: makeLogger(),
      adapter: undefined,
      pruningConfig: undefined,
      memoryConfig: undefined,
    };

    const result = initializeInfrastructure(params);

    expect(result.memory.memoryEnabled).toBe(false);
  });

  it('pruning is enabled by default', () => {
    const params: InfrastructureInitParams = {
      agentId: 'agent-1',
      role: 'code_expert',
      logger: makeLogger(),
      adapter: undefined,
      pruningConfig: undefined,
      memoryConfig: undefined,
    };

    const result = initializeInfrastructure(params);

    expect(result.pruning.contextPruningEnabled).toBe(true);
  });

  it('pruning can be explicitly disabled', () => {
    const params: InfrastructureInitParams = {
      agentId: 'agent-1',
      role: 'code_expert',
      logger: makeLogger(),
      adapter: undefined,
      pruningConfig: { enabled: false },
      memoryConfig: undefined,
    };

    const result = initializeInfrastructure(params);

    expect(result.pruning.contextPruningEnabled).toBe(false);
  });

  it('passes adapter to pruning infrastructure', () => {
    const adapter = { providerId: 'test' } as never;
    const params: InfrastructureInitParams = {
      agentId: 'agent-1',
      role: 'code_expert',
      logger: makeLogger(),
      adapter,
      pruningConfig: undefined,
      memoryConfig: undefined,
    };

    const result = initializeInfrastructure(params);

    // Should succeed without errors
    expect(result.pruning).toBeDefined();
  });

  it('passes memory config when provided', () => {
    const params: InfrastructureInitParams = {
      agentId: 'agent-1',
      role: 'code_expert',
      logger: makeLogger(),
      adapter: undefined,
      pruningConfig: undefined,
      memoryConfig: { enabled: false },
    };

    const result = initializeInfrastructure(params);

    expect(result.memory.memoryEnabled).toBe(false);
  });
});
