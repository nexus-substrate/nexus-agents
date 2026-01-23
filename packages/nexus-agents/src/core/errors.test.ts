import { describe, it, expect } from 'vitest';
import {
  NexusError,
  ValidationError,
  ConfigError,
  ModelError,
  AgentError,
  AgentFailureError,
  MemoryFailureError,
  ReflectionFailureError,
  PlanningFailureError,
  ActionFailureError,
  WorkflowError,
  SecurityError,
  TimeoutError,
  RateLimitError,
  ErrorCode,
  AgentErrorCategory,
  type SerializedError,
} from './errors.js';

describe('ErrorCode', () => {
  it('contains all validation error codes', () => {
    expect(ErrorCode.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
    expect(ErrorCode.INVALID_INPUT).toBe('INVALID_INPUT');
    expect(ErrorCode.MISSING_REQUIRED).toBe('MISSING_REQUIRED');
    expect(ErrorCode.SCHEMA_ERROR).toBe('SCHEMA_ERROR');
  });

  it('contains all configuration error codes', () => {
    expect(ErrorCode.CONFIG_ERROR).toBe('CONFIG_ERROR');
    expect(ErrorCode.CONFIG_NOT_FOUND).toBe('CONFIG_NOT_FOUND');
    expect(ErrorCode.CONFIG_INVALID).toBe('CONFIG_INVALID');
  });

  it('contains all model error codes', () => {
    expect(ErrorCode.MODEL_ERROR).toBe('MODEL_ERROR');
    expect(ErrorCode.MODEL_UNAVAILABLE).toBe('MODEL_UNAVAILABLE');
    expect(ErrorCode.MODEL_RATE_LIMITED).toBe('MODEL_RATE_LIMITED');
    expect(ErrorCode.MODEL_TIMEOUT).toBe('MODEL_TIMEOUT');
  });

  it('contains all agent error codes', () => {
    expect(ErrorCode.AGENT_ERROR).toBe('AGENT_ERROR');
    expect(ErrorCode.AGENT_NOT_FOUND).toBe('AGENT_NOT_FOUND');
    expect(ErrorCode.AGENT_EXECUTION_FAILED).toBe('AGENT_EXECUTION_FAILED');
    expect(ErrorCode.AGENT_MEMORY_FAILURE).toBe('AGENT_MEMORY_FAILURE');
    expect(ErrorCode.AGENT_REFLECTION_FAILURE).toBe('AGENT_REFLECTION_FAILURE');
    expect(ErrorCode.AGENT_PLANNING_FAILURE).toBe('AGENT_PLANNING_FAILURE');
    expect(ErrorCode.AGENT_ACTION_FAILURE).toBe('AGENT_ACTION_FAILURE');
  });

  it('contains all workflow error codes', () => {
    expect(ErrorCode.WORKFLOW_ERROR).toBe('WORKFLOW_ERROR');
    expect(ErrorCode.WORKFLOW_NOT_FOUND).toBe('WORKFLOW_NOT_FOUND');
    expect(ErrorCode.WORKFLOW_PARSE_ERROR).toBe('WORKFLOW_PARSE_ERROR');
    expect(ErrorCode.WORKFLOW_EXECUTION_FAILED).toBe('WORKFLOW_EXECUTION_FAILED');
  });

  it('contains all security error codes', () => {
    expect(ErrorCode.SECURITY_ERROR).toBe('SECURITY_ERROR');
    expect(ErrorCode.PATH_TRAVERSAL).toBe('PATH_TRAVERSAL');
    expect(ErrorCode.UNAUTHORIZED).toBe('UNAUTHORIZED');
  });

  it('contains all system error codes', () => {
    expect(ErrorCode.TIMEOUT_ERROR).toBe('TIMEOUT_ERROR');
    expect(ErrorCode.RATE_LIMIT_ERROR).toBe('RATE_LIMIT_ERROR');
    expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
  });
});

describe('NexusError', () => {
  describe('construction', () => {
    it('creates error with message and code', () => {
      const error = new NexusError('Test error', { code: ErrorCode.INTERNAL_ERROR });

      expect(error.message).toBe('Test error');
      expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(error.name).toBe('NexusError');
    });

    it('creates error with context', () => {
      const context = { userId: '123', action: 'test' };
      const error = new NexusError('Test error', {
        code: ErrorCode.INTERNAL_ERROR,
        context,
      });

      expect(error.context).toEqual(context);
    });

    it('creates error with cause', () => {
      const cause = new Error('Original error');
      const error = new NexusError('Wrapped error', {
        code: ErrorCode.INTERNAL_ERROR,
        cause,
      });

      expect(error.cause).toBe(cause);
    });

    it('creates error with all options', () => {
      const cause = new Error('Original error');
      const context = { operation: 'test' };
      const error = new NexusError('Full error', {
        code: ErrorCode.VALIDATION_ERROR,
        cause,
        context,
      });

      expect(error.message).toBe('Full error');
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error.cause).toBe(cause);
      expect(error.context).toEqual(context);
    });

    it('has a stack trace', () => {
      const error = new NexusError('Test error', { code: ErrorCode.INTERNAL_ERROR });

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('NexusError');
    });
  });

  describe('instanceof checks', () => {
    it('is instanceof Error', () => {
      const error = new NexusError('Test', { code: ErrorCode.INTERNAL_ERROR });
      expect(error instanceof Error).toBe(true);
    });

    it('is instanceof NexusError', () => {
      const error = new NexusError('Test', { code: ErrorCode.INTERNAL_ERROR });
      expect(error instanceof NexusError).toBe(true);
    });
  });

  describe('toJSON()', () => {
    it('serializes basic error', () => {
      const error = new NexusError('Test error', { code: ErrorCode.INTERNAL_ERROR });
      const json = error.toJSON();

      expect(json.name).toBe('NexusError');
      expect(json.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(json.message).toBe('Test error');
      expect(json.stack).toBeDefined();
    });

    it('serializes error with context', () => {
      const context = { userId: '123' };
      const error = new NexusError('Test error', {
        code: ErrorCode.INTERNAL_ERROR,
        context,
      });
      const json = error.toJSON();

      expect(json.context).toEqual(context);
    });

    it('serializes error with NexusError cause', () => {
      const cause = new NexusError('Original error', { code: ErrorCode.VALIDATION_ERROR });
      const error = new NexusError('Wrapped error', {
        code: ErrorCode.INTERNAL_ERROR,
        cause,
      });
      const json = error.toJSON();

      expect(json.cause).toBeDefined();
      expect(json.cause?.name).toBe('NexusError');
      expect(json.cause?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(json.cause?.message).toBe('Original error');
    });

    it('does not serialize regular Error as cause', () => {
      const cause = new Error('Regular error');
      const error = new NexusError('Wrapped error', {
        code: ErrorCode.INTERNAL_ERROR,
        cause,
      });
      const json = error.toJSON();

      expect(json.cause).toBeUndefined();
    });

    it('omits undefined context', () => {
      const error = new NexusError('Test error', { code: ErrorCode.INTERNAL_ERROR });
      const json = error.toJSON();

      expect('context' in json).toBe(false);
    });

    it('serializes nested NexusError causes', () => {
      const root = new NexusError('Root', { code: ErrorCode.VALIDATION_ERROR });
      const middle = new NexusError('Middle', { code: ErrorCode.CONFIG_ERROR, cause: root });
      const top = new NexusError('Top', { code: ErrorCode.INTERNAL_ERROR, cause: middle });
      const json = top.toJSON();

      expect(json.cause?.code).toBe(ErrorCode.CONFIG_ERROR);
      expect(json.cause?.cause?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });
  });
});

describe('ValidationError', () => {
  it('has correct name and code', () => {
    const error = new ValidationError('Invalid input');

    expect(error.name).toBe('ValidationError');
    expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it('is instanceof NexusError', () => {
    const error = new ValidationError('Invalid input');
    expect(error instanceof NexusError).toBe(true);
    expect(error instanceof ValidationError).toBe(true);
  });

  it('accepts optional context', () => {
    const error = new ValidationError('Invalid input', { context: { field: 'email' } });
    expect(error.context).toEqual({ field: 'email' });
  });

  it('accepts optional cause', () => {
    const cause = new Error('Parse error');
    const error = new ValidationError('Invalid input', { cause });
    expect(error.cause).toBe(cause);
  });
});

describe('ConfigError', () => {
  it('has correct name and code', () => {
    const error = new ConfigError('Config not found');

    expect(error.name).toBe('ConfigError');
    expect(error.code).toBe(ErrorCode.CONFIG_ERROR);
  });

  it('is instanceof NexusError', () => {
    const error = new ConfigError('Config not found');
    expect(error instanceof NexusError).toBe(true);
    expect(error instanceof ConfigError).toBe(true);
  });
});

describe('ModelError', () => {
  it('has correct name and code', () => {
    const error = new ModelError('Model unavailable');

    expect(error.name).toBe('ModelError');
    expect(error.code).toBe(ErrorCode.MODEL_ERROR);
  });

  it('is instanceof NexusError', () => {
    const error = new ModelError('Model unavailable');
    expect(error instanceof NexusError).toBe(true);
    expect(error instanceof ModelError).toBe(true);
  });
});

describe('AgentError', () => {
  it('has correct name and code', () => {
    const error = new AgentError('Agent execution failed');

    expect(error.name).toBe('AgentError');
    expect(error.code).toBe(ErrorCode.AGENT_ERROR);
  });

  it('is instanceof NexusError', () => {
    const error = new AgentError('Agent execution failed');
    expect(error instanceof NexusError).toBe(true);
    expect(error instanceof AgentError).toBe(true);
  });
});

describe('AgentErrorCategory', () => {
  it('contains all category values', () => {
    expect(AgentErrorCategory.MEMORY).toBe('memory');
    expect(AgentErrorCategory.REFLECTION).toBe('reflection');
    expect(AgentErrorCategory.PLANNING).toBe('planning');
    expect(AgentErrorCategory.ACTION).toBe('action');
    expect(AgentErrorCategory.SYSTEM).toBe('system');
  });
});

describe('AgentFailureError', () => {
  describe('category to error code mapping', () => {
    it('maps MEMORY category to AGENT_MEMORY_FAILURE code', () => {
      const error = new AgentFailureError('Memory failure', {
        category: AgentErrorCategory.MEMORY,
      });
      expect(error.code).toBe(ErrorCode.AGENT_MEMORY_FAILURE);
    });

    it('maps REFLECTION category to AGENT_REFLECTION_FAILURE code', () => {
      const error = new AgentFailureError('Reflection failure', {
        category: AgentErrorCategory.REFLECTION,
      });
      expect(error.code).toBe(ErrorCode.AGENT_REFLECTION_FAILURE);
    });

    it('maps PLANNING category to AGENT_PLANNING_FAILURE code', () => {
      const error = new AgentFailureError('Planning failure', {
        category: AgentErrorCategory.PLANNING,
      });
      expect(error.code).toBe(ErrorCode.AGENT_PLANNING_FAILURE);
    });

    it('maps ACTION category to AGENT_ACTION_FAILURE code', () => {
      const error = new AgentFailureError('Action failure', {
        category: AgentErrorCategory.ACTION,
      });
      expect(error.code).toBe(ErrorCode.AGENT_ACTION_FAILURE);
    });

    it('maps SYSTEM category to INTERNAL_ERROR code', () => {
      const error = new AgentFailureError('System failure', {
        category: AgentErrorCategory.SYSTEM,
      });
      expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
    });
  });

  describe('construction', () => {
    it('has correct name', () => {
      const error = new AgentFailureError('Failure', {
        category: AgentErrorCategory.MEMORY,
      });
      expect(error.name).toBe('AgentFailureError');
    });

    it('defaults recoverable to false', () => {
      const error = new AgentFailureError('Failure', {
        category: AgentErrorCategory.MEMORY,
      });
      expect(error.recoverable).toBe(false);
    });

    it('defaults retryable to false', () => {
      const error = new AgentFailureError('Failure', {
        category: AgentErrorCategory.MEMORY,
      });
      expect(error.retryable).toBe(false);
    });

    it('accepts recoverable option', () => {
      const error = new AgentFailureError('Failure', {
        category: AgentErrorCategory.MEMORY,
        recoverable: true,
      });
      expect(error.recoverable).toBe(true);
    });

    it('accepts retryable option', () => {
      const error = new AgentFailureError('Failure', {
        category: AgentErrorCategory.MEMORY,
        retryable: true,
      });
      expect(error.retryable).toBe(true);
    });

    it('accepts suggestedAction option', () => {
      const error = new AgentFailureError('Failure', {
        category: AgentErrorCategory.MEMORY,
        suggestedAction: 'Retry with smaller context',
      });
      expect(error.suggestedAction).toBe('Retry with smaller context');
    });

    it('stores category', () => {
      const error = new AgentFailureError('Failure', {
        category: AgentErrorCategory.PLANNING,
      });
      expect(error.category).toBe(AgentErrorCategory.PLANNING);
    });
  });

  describe('instanceof checks', () => {
    it('is instanceof NexusError', () => {
      const error = new AgentFailureError('Failure', {
        category: AgentErrorCategory.MEMORY,
      });
      expect(error instanceof NexusError).toBe(true);
    });

    it('is instanceof AgentFailureError', () => {
      const error = new AgentFailureError('Failure', {
        category: AgentErrorCategory.MEMORY,
      });
      expect(error instanceof AgentFailureError).toBe(true);
    });
  });

  describe('toJSON()', () => {
    it('includes category in serialization', () => {
      const error = new AgentFailureError('Failure', {
        category: AgentErrorCategory.MEMORY,
      });
      const json = error.toJSON();

      expect(json.category).toBe(AgentErrorCategory.MEMORY);
    });

    it('includes recoverable in serialization', () => {
      const error = new AgentFailureError('Failure', {
        category: AgentErrorCategory.MEMORY,
        recoverable: true,
      });
      const json = error.toJSON();

      expect(json.recoverable).toBe(true);
    });

    it('includes base NexusError fields', () => {
      const error = new AgentFailureError('Failure', {
        category: AgentErrorCategory.MEMORY,
        context: { taskId: '123' },
      });
      const json = error.toJSON();

      expect(json.name).toBe('AgentFailureError');
      expect(json.message).toBe('Failure');
      expect(json.code).toBe(ErrorCode.AGENT_MEMORY_FAILURE);
      expect(json.context).toEqual({ taskId: '123' });
    });
  });
});

describe('MemoryFailureError', () => {
  it('has correct name and category', () => {
    const error = new MemoryFailureError('Failed to retrieve context');

    expect(error.name).toBe('MemoryFailureError');
    expect(error.category).toBe(AgentErrorCategory.MEMORY);
    expect(error.code).toBe(ErrorCode.AGENT_MEMORY_FAILURE);
  });

  it('defaults retryable to true', () => {
    const error = new MemoryFailureError('Failed to retrieve context');
    expect(error.retryable).toBe(true);
  });

  it('has default suggestedAction', () => {
    const error = new MemoryFailureError('Failed to retrieve context');
    expect(error.suggestedAction).toBe('Verify context availability and retry');
  });

  it('allows overriding defaults', () => {
    const error = new MemoryFailureError('Failed to retrieve context', {
      retryable: false,
      suggestedAction: 'Clear cache and retry',
    });

    expect(error.retryable).toBe(false);
    expect(error.suggestedAction).toBe('Clear cache and retry');
  });

  it('is instanceof AgentFailureError', () => {
    const error = new MemoryFailureError('Failure');
    expect(error instanceof AgentFailureError).toBe(true);
    expect(error instanceof NexusError).toBe(true);
  });
});

describe('ReflectionFailureError', () => {
  it('has correct name and category', () => {
    const error = new ReflectionFailureError('Failed to verify output');

    expect(error.name).toBe('ReflectionFailureError');
    expect(error.category).toBe(AgentErrorCategory.REFLECTION);
    expect(error.code).toBe(ErrorCode.AGENT_REFLECTION_FAILURE);
  });

  it('defaults retryable to true', () => {
    const error = new ReflectionFailureError('Failed to verify output');
    expect(error.retryable).toBe(true);
  });

  it('has default suggestedAction', () => {
    const error = new ReflectionFailureError('Failed to verify output');
    expect(error.suggestedAction).toBe('Request explicit verification step');
  });

  it('allows overriding defaults', () => {
    const error = new ReflectionFailureError('Failed to verify output', {
      retryable: false,
      suggestedAction: 'Add human review step',
    });

    expect(error.retryable).toBe(false);
    expect(error.suggestedAction).toBe('Add human review step');
  });

  it('is instanceof AgentFailureError', () => {
    const error = new ReflectionFailureError('Failure');
    expect(error instanceof AgentFailureError).toBe(true);
    expect(error instanceof NexusError).toBe(true);
  });
});

describe('PlanningFailureError', () => {
  it('has correct name and category', () => {
    const error = new PlanningFailureError('Failed to create plan');

    expect(error.name).toBe('PlanningFailureError');
    expect(error.category).toBe(AgentErrorCategory.PLANNING);
    expect(error.code).toBe(ErrorCode.AGENT_PLANNING_FAILURE);
  });

  it('defaults retryable to true', () => {
    const error = new PlanningFailureError('Failed to create plan');
    expect(error.retryable).toBe(true);
  });

  it('has default suggestedAction', () => {
    const error = new PlanningFailureError('Failed to create plan');
    expect(error.suggestedAction).toBe('Simplify task or provide more constraints');
  });

  it('allows overriding defaults', () => {
    const error = new PlanningFailureError('Failed to create plan', {
      retryable: false,
      suggestedAction: 'Break down into subtasks',
    });

    expect(error.retryable).toBe(false);
    expect(error.suggestedAction).toBe('Break down into subtasks');
  });

  it('is instanceof AgentFailureError', () => {
    const error = new PlanningFailureError('Failure');
    expect(error instanceof AgentFailureError).toBe(true);
    expect(error instanceof NexusError).toBe(true);
  });
});

describe('ActionFailureError', () => {
  it('has correct name and category', () => {
    const error = new ActionFailureError('Failed to execute action');

    expect(error.name).toBe('ActionFailureError');
    expect(error.category).toBe(AgentErrorCategory.ACTION);
    expect(error.code).toBe(ErrorCode.AGENT_ACTION_FAILURE);
  });

  it('defaults retryable to true', () => {
    const error = new ActionFailureError('Failed to execute action');
    expect(error.retryable).toBe(true);
  });

  it('has default suggestedAction', () => {
    const error = new ActionFailureError('Failed to execute action');
    expect(error.suggestedAction).toBe('Retry action or use alternative approach');
  });

  it('allows overriding defaults', () => {
    const error = new ActionFailureError('Failed to execute action', {
      retryable: false,
      suggestedAction: 'Use fallback tool',
    });

    expect(error.retryable).toBe(false);
    expect(error.suggestedAction).toBe('Use fallback tool');
  });

  it('is instanceof AgentFailureError', () => {
    const error = new ActionFailureError('Failure');
    expect(error instanceof AgentFailureError).toBe(true);
    expect(error instanceof NexusError).toBe(true);
  });
});

describe('WorkflowError', () => {
  it('has correct name and code', () => {
    const error = new WorkflowError('Workflow execution failed');

    expect(error.name).toBe('WorkflowError');
    expect(error.code).toBe(ErrorCode.WORKFLOW_ERROR);
  });

  it('is instanceof NexusError', () => {
    const error = new WorkflowError('Workflow execution failed');
    expect(error instanceof NexusError).toBe(true);
    expect(error instanceof WorkflowError).toBe(true);
  });

  it('accepts context with workflow details', () => {
    const error = new WorkflowError('Step 3 failed', {
      context: { workflowId: 'wf-123', step: 3 },
    });
    expect(error.context).toEqual({ workflowId: 'wf-123', step: 3 });
  });
});

describe('SecurityError', () => {
  it('has correct name and code', () => {
    const error = new SecurityError('Unauthorized access');

    expect(error.name).toBe('SecurityError');
    expect(error.code).toBe(ErrorCode.SECURITY_ERROR);
  });

  it('is instanceof NexusError', () => {
    const error = new SecurityError('Unauthorized access');
    expect(error instanceof NexusError).toBe(true);
    expect(error instanceof SecurityError).toBe(true);
  });

  it('accepts context with security details', () => {
    const error = new SecurityError('Path traversal detected', {
      context: { path: '../etc/passwd', violation: 'PATH_TRAVERSAL' },
    });
    expect(error.context).toEqual({ path: '../etc/passwd', violation: 'PATH_TRAVERSAL' });
  });
});

describe('TimeoutError', () => {
  it('has correct name and code', () => {
    const error = new TimeoutError('Operation timed out');

    expect(error.name).toBe('TimeoutError');
    expect(error.code).toBe(ErrorCode.TIMEOUT_ERROR);
  });

  it('is instanceof NexusError', () => {
    const error = new TimeoutError('Operation timed out');
    expect(error instanceof NexusError).toBe(true);
    expect(error instanceof TimeoutError).toBe(true);
  });

  it('accepts context with timeout details', () => {
    const error = new TimeoutError('Request timed out', {
      context: { timeout: 30000, operation: 'model.generate' },
    });
    expect(error.context).toEqual({ timeout: 30000, operation: 'model.generate' });
  });
});

describe('RateLimitError', () => {
  it('has correct name and code', () => {
    const error = new RateLimitError('Rate limit exceeded');

    expect(error.name).toBe('RateLimitError');
    expect(error.code).toBe(ErrorCode.RATE_LIMIT_ERROR);
  });

  it('is instanceof NexusError', () => {
    const error = new RateLimitError('Rate limit exceeded');
    expect(error instanceof NexusError).toBe(true);
    expect(error instanceof RateLimitError).toBe(true);
  });

  it('accepts context with rate limit details', () => {
    const error = new RateLimitError('API rate limit hit', {
      context: { retryAfter: 60, limit: 100, remaining: 0 },
    });
    expect(error.context).toEqual({ retryAfter: 60, limit: 100, remaining: 0 });
  });
});

describe('Error inheritance chain', () => {
  it('all specialized errors extend NexusError', () => {
    const errors = [
      new ValidationError('test'),
      new ConfigError('test'),
      new ModelError('test'),
      new AgentError('test'),
      new WorkflowError('test'),
      new SecurityError('test'),
      new TimeoutError('test'),
      new RateLimitError('test'),
    ];

    for (const error of errors) {
      expect(error instanceof NexusError).toBe(true);
      expect(error instanceof Error).toBe(true);
    }
  });

  it('AgentFailureError subclasses extend AgentFailureError', () => {
    const errors = [
      new MemoryFailureError('test'),
      new ReflectionFailureError('test'),
      new PlanningFailureError('test'),
      new ActionFailureError('test'),
    ];

    for (const error of errors) {
      expect(error instanceof AgentFailureError).toBe(true);
      expect(error instanceof NexusError).toBe(true);
      expect(error instanceof Error).toBe(true);
    }
  });

  it('error names are set correctly for all error types', () => {
    const errorNames: Array<[Error, string]> = [
      [new NexusError('test', { code: ErrorCode.INTERNAL_ERROR }), 'NexusError'],
      [new ValidationError('test'), 'ValidationError'],
      [new ConfigError('test'), 'ConfigError'],
      [new ModelError('test'), 'ModelError'],
      [new AgentError('test'), 'AgentError'],
      [new AgentFailureError('test', { category: AgentErrorCategory.MEMORY }), 'AgentFailureError'],
      [new MemoryFailureError('test'), 'MemoryFailureError'],
      [new ReflectionFailureError('test'), 'ReflectionFailureError'],
      [new PlanningFailureError('test'), 'PlanningFailureError'],
      [new ActionFailureError('test'), 'ActionFailureError'],
      [new WorkflowError('test'), 'WorkflowError'],
      [new SecurityError('test'), 'SecurityError'],
      [new TimeoutError('test'), 'TimeoutError'],
      [new RateLimitError('test'), 'RateLimitError'],
    ];

    for (const [error, expectedName] of errorNames) {
      expect(error.name).toBe(expectedName);
    }
  });
});

describe('Error serialization edge cases', () => {
  it('handles empty context object', () => {
    const error = new NexusError('Test', {
      code: ErrorCode.INTERNAL_ERROR,
      context: {},
    });
    const json = error.toJSON();

    expect(json.context).toEqual({});
  });

  it('handles complex nested context', () => {
    const context = {
      user: { id: '123', roles: ['admin', 'user'] },
      request: { method: 'POST', path: '/api/test' },
      metadata: { timestamp: 1234567890, version: '1.0.0' },
    };
    const error = new NexusError('Test', {
      code: ErrorCode.INTERNAL_ERROR,
      context,
    });
    const json = error.toJSON();

    expect(json.context).toEqual(context);
  });

  it('serialized error is JSON serializable', () => {
    const cause = new NexusError('Cause', {
      code: ErrorCode.VALIDATION_ERROR,
      context: { field: 'email' },
    });
    const error = new NexusError('Top', {
      code: ErrorCode.INTERNAL_ERROR,
      cause,
      context: { operation: 'test' },
    });

    const serialized = JSON.stringify(error.toJSON());
    const parsed = JSON.parse(serialized) as SerializedError;

    expect(parsed.name).toBe('NexusError');
    expect(parsed.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(parsed.message).toBe('Top');
    expect(parsed.context).toEqual({ operation: 'test' });
    expect(parsed.cause?.code).toBe(ErrorCode.VALIDATION_ERROR);
  });
});
