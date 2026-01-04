/**
 * nexus-agents/mcp - Run Workflow Tool Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Result } from '../../core/index.js';
import type {
  IWorkflowEngine,
  WorkflowDefinition,
  WorkflowResult,
  WorkflowTemplate,
  ExecutionStatus,
  ILogger,
} from '../../core/index.js';
import { WorkflowError, ParseError } from '../../core/index.js';
import {
  registerRunWorkflowTool,
  RunWorkflowInputSchema,
  type RunWorkflowDeps,
  type WorkflowToolResult,
  type DryRunResult,
} from './run-workflow.js';

/** Tool response type */
type ToolResponse = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

/** Tool handler function type */
type ToolHandler = (args: unknown) => Promise<ToolResponse>;

/** Registered tool config */
interface RegisteredToolConfig {
  description?: string;
  inputSchema?: unknown;
}

/** Mock tool registration record */
interface MockRegisteredTool {
  name: string;
  config: RegisteredToolConfig;
  handler: ToolHandler;
}

/** Create a mock MCP server for testing */
function createMockServer(): {
  tools: MockRegisteredTool[];
  registerTool: (name: string, config: RegisteredToolConfig, handler: ToolHandler) => void;
} {
  const tools: MockRegisteredTool[] = [];

  return {
    tools,
    registerTool(name: string, config: RegisteredToolConfig, handler: ToolHandler): void {
      tools.push({ name, config, handler });
    },
  };
}

/** Create a mock workflow definition for testing */
function createMockWorkflowDefinition(overrides?: Partial<WorkflowDefinition>): WorkflowDefinition {
  return {
    name: 'test-workflow',
    version: '1.0.0',
    description: 'A test workflow',
    inputs: [
      { name: 'target', type: 'string', required: true },
      { name: 'options', type: 'object', required: false, default: {} },
    ],
    steps: [
      {
        id: 'step-1',
        agent: 'code_expert',
        action: 'analyze',
        inputs: { target: '${inputs.target}' },
      },
      {
        id: 'step-2',
        agent: 'tech_lead',
        action: 'summarize',
        inputs: { analysis: '${steps.step-1.output}' },
        dependsOn: ['step-1'],
      },
    ],
    ...overrides,
  };
}

/** Create a mock workflow result for testing */
function createMockWorkflowResult(workflowName: string): WorkflowResult {
  return {
    executionId: 'exec-123',
    workflowName,
    stepResults: [
      {
        stepId: 'step-1',
        output: { findings: ['issue-1', 'issue-2'] },
        durationMs: 1000,
        status: 'success',
      },
      {
        stepId: 'step-2',
        output: { summary: 'All checks passed' },
        durationMs: 500,
        status: 'success',
      },
    ],
    output: { summary: 'All checks passed' },
    totalDurationMs: 1500,
  };
}

/** Create template list */
function createDefaultTemplates(): WorkflowTemplate[] {
  return [
    {
      name: 'code-review',
      version: '1.0.0',
      path: '/templates/code-review.yaml',
      description: 'Code review',
      category: 'development',
    },
    {
      name: 'security-audit',
      version: '1.0.0',
      path: '/templates/security-audit.yaml',
      description: 'Security audit',
      category: 'security',
    },
  ];
}

/** Create a mock workflow engine for testing */
function createMockWorkflowEngine(options?: {
  templates?: WorkflowTemplate[];
  loadTemplateResult?: Result<WorkflowDefinition, ParseError>;
  executeResult?: Result<WorkflowResult, WorkflowError>;
}): IWorkflowEngine {
  const defaultWorkflow = createMockWorkflowDefinition({ name: 'code-review' });
  const defaultResult = createMockWorkflowResult('code-review');

  const loadTemplate = vi
    .fn()
    .mockImplementation((): Promise<Result<WorkflowDefinition, ParseError>> => {
      if (options?.loadTemplateResult !== undefined) {
        return Promise.resolve(options.loadTemplateResult);
      }
      return Promise.resolve({ ok: true, value: defaultWorkflow });
    });

  const execute = vi.fn().mockImplementation((): Promise<Result<WorkflowResult, WorkflowError>> => {
    if (options?.executeResult !== undefined) {
      return Promise.resolve(options.executeResult);
    }
    return Promise.resolve({ ok: true, value: defaultResult });
  });

  const getStatus = vi
    .fn()
    .mockReturnValue({ state: 'completed', result: defaultResult } as ExecutionStatus);
  const cancel = vi.fn().mockResolvedValue({ ok: true, value: undefined });
  const listTemplates = vi.fn().mockResolvedValue(options?.templates ?? createDefaultTemplates());

  return { loadTemplate, execute, getStatus, cancel, listTemplates };
}

/** Create a mock logger for testing */
function createMockLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
    setLevel: vi.fn(),
  };
}

describe('RunWorkflowInputSchema', () => {
  it('should validate valid input', () => {
    const result = RunWorkflowInputSchema.safeParse({
      template: 'code-review',
      inputs: { target: 'src/main.ts' },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.template).toBe('code-review');
      expect(result.data.inputs).toEqual({ target: 'src/main.ts' });
      expect(result.data.dryRun).toBe(false);
    }
  });

  it('should accept dryRun option', () => {
    const result = RunWorkflowInputSchema.safeParse({
      template: 'code-review',
      inputs: {},
      dryRun: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dryRun).toBe(true);
    }
  });

  it('should reject empty template', () => {
    const result = RunWorkflowInputSchema.safeParse({ template: '', inputs: {} });
    expect(result.success).toBe(false);
  });

  it('should reject missing inputs', () => {
    const result = RunWorkflowInputSchema.safeParse({ template: 'code-review' });
    expect(result.success).toBe(false);
  });
});

describe('registerRunWorkflowTool', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockEngine: IWorkflowEngine;
  let mockLogger: ILogger;
  let deps: RunWorkflowDeps;

  beforeEach(() => {
    mockServer = createMockServer();
    mockEngine = createMockWorkflowEngine();
    mockLogger = createMockLogger();
    deps = { workflowEngine: mockEngine, logger: mockLogger };
  });

  it('should register the run_workflow tool', () => {
    registerRunWorkflowTool(
      mockServer as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer,
      deps
    );
    expect(mockServer.tools).toHaveLength(1);
    expect(mockServer.tools[0]?.name).toBe('run_workflow');
  });

  it('should have description in config', () => {
    registerRunWorkflowTool(
      mockServer as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer,
      deps
    );
    const tool = mockServer.tools[0];
    expect(tool?.config.description).toBeDefined();
    expect(tool?.config.description).toContain('workflow');
  });

  it('should have inputSchema in config', () => {
    registerRunWorkflowTool(
      mockServer as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer,
      deps
    );
    const tool = mockServer.tools[0];
    expect(tool?.config.inputSchema).toBeDefined();
  });
});

describe('run_workflow tool execution', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockEngine: IWorkflowEngine;
  let mockLogger: ILogger;
  let deps: RunWorkflowDeps;

  beforeEach(() => {
    mockServer = createMockServer();
    mockLogger = createMockLogger();
  });

  function getToolHandler(): ToolHandler {
    const tool = mockServer.tools[0];
    if (tool === undefined) {
      throw new Error('Tool not registered');
    }
    return tool.handler;
  }

  describe('running built-in templates', () => {
    beforeEach(() => {
      mockEngine = createMockWorkflowEngine();
      deps = { workflowEngine: mockEngine, logger: mockLogger };
      registerRunWorkflowTool(
        mockServer as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer,
        deps
      );
    });

    it('should execute a built-in template successfully', async () => {
      const handler = getToolHandler();
      const result = await handler({ template: 'code-review', inputs: { target: 'src/main.ts' } });

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);

      const parsed = JSON.parse(result.content[0]?.text ?? '{}') as WorkflowToolResult;
      expect(parsed.executionId).toBe('exec-123');
      expect(parsed.workflowName).toBe('code-review');
      expect(parsed.status).toBe('completed');
      expect(parsed.stepResults).toHaveLength(2);
      expect(parsed.durationMs).toBe(1500);
    });

    it('should call workflowEngine.execute with correct arguments', async () => {
      const handler = getToolHandler();
      await handler({
        template: 'code-review',
        inputs: { target: 'src/main.ts', options: { verbose: true } },
      });

      expect(mockEngine.execute).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'code-review' }),
        { target: 'src/main.ts', options: { verbose: true } }
      );
    });

    it('should log execution info', async () => {
      const handler = getToolHandler();
      await handler({ template: 'code-review', inputs: { target: 'src/main.ts' } });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'run_workflow called',
        expect.objectContaining({ template: 'code-review' })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Executing workflow',
        expect.objectContaining({ workflowName: 'code-review' })
      );
    });
  });

  describe('missing template error', () => {
    beforeEach(() => {
      mockEngine = createMockWorkflowEngine({
        templates: [{ name: 'only-template', version: '1.0.0', path: '/t.yaml' }],
      });
      deps = { workflowEngine: mockEngine, logger: mockLogger };
      registerRunWorkflowTool(
        mockServer as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer,
        deps
      );
    });

    it('should return error for missing template', async () => {
      const handler = getToolHandler();
      const result = await handler({ template: 'nonexistent-workflow', inputs: {} });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Template not found');
      expect(result.content[0]?.text).toContain('nonexistent-workflow');
    });
  });

  describe('dry run mode', () => {
    beforeEach(() => {
      mockEngine = createMockWorkflowEngine();
      deps = { workflowEngine: mockEngine, logger: mockLogger };
      registerRunWorkflowTool(
        mockServer as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer,
        deps
      );
    });

    it('should validate without executing in dry run mode', async () => {
      const handler = getToolHandler();
      const result = await handler({
        template: 'code-review',
        inputs: { target: 'src/main.ts' },
        dryRun: true,
      });

      expect(result.isError).toBeUndefined();
      expect(mockEngine.execute).not.toHaveBeenCalled();

      const parsed = JSON.parse(result.content[0]?.text ?? '{}') as DryRunResult;
      expect(parsed.valid).toBe(true);
      expect(parsed.workflowName).toBe('code-review');
      expect(parsed.stepCount).toBe(2);
    });

    it('should report missing required inputs in dry run', async () => {
      const handler = getToolHandler();
      const result = await handler({ template: 'code-review', inputs: {}, dryRun: true });

      expect(result.isError).toBeUndefined();
      expect(mockEngine.execute).not.toHaveBeenCalled();

      const parsed = JSON.parse(result.content[0]?.text ?? '{}') as DryRunResult;
      expect(parsed.valid).toBe(false);
      expect(parsed.inputsMissing).toContain('target');
    });

    it('should report provided and required inputs', async () => {
      const handler = getToolHandler();
      const result = await handler({
        template: 'code-review',
        inputs: { target: 'src/main.ts', extra: 'value' },
        dryRun: true,
      });

      const parsed = JSON.parse(result.content[0]?.text ?? '{}') as DryRunResult;
      expect(parsed.inputsProvided).toContain('target');
      expect(parsed.inputsProvided).toContain('extra');
      expect(parsed.inputsRequired).toContain('target');
    });
  });

  describe('workflow execution failure', () => {
    beforeEach(() => {
      mockEngine = createMockWorkflowEngine({
        executeResult: {
          ok: false,
          error: new WorkflowError('Step step-1 failed: Connection timeout', {
            context: { stepId: 'step-1' },
          }),
        },
      });
      deps = { workflowEngine: mockEngine, logger: mockLogger };
      registerRunWorkflowTool(
        mockServer as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer,
        deps
      );
    });

    it('should return error when workflow execution fails', async () => {
      const handler = getToolHandler();
      const result = await handler({ template: 'code-review', inputs: { target: 'src/main.ts' } });

      expect(result.isError).toBe(true);

      const parsed = JSON.parse(result.content[0]?.text ?? '{}') as {
        status: string;
        error: string;
      };
      expect(parsed.status).toBe('failed');
      expect(parsed.error).toContain('Connection timeout');
    });

    it('should log error when execution fails', async () => {
      const handler = getToolHandler();
      await handler({ template: 'code-review', inputs: { target: 'src/main.ts' } });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Workflow execution failed',
        expect.any(WorkflowError),
        expect.objectContaining({ workflowName: 'code-review' })
      );
    });
  });

  describe('template loading from path', () => {
    beforeEach(() => {
      mockEngine = createMockWorkflowEngine();
      deps = { workflowEngine: mockEngine, logger: mockLogger };
      registerRunWorkflowTool(
        mockServer as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer,
        deps
      );
    });

    it('should load template from file path', async () => {
      const handler = getToolHandler();
      await handler({
        template: '/custom/workflows/my-workflow.yaml',
        inputs: { target: 'src/main.ts' },
      });

      expect(mockEngine.loadTemplate).toHaveBeenCalledWith('/custom/workflows/my-workflow.yaml');
      expect(mockEngine.listTemplates).not.toHaveBeenCalled();
    });

    it('should detect yaml extension as file path', async () => {
      const handler = getToolHandler();
      await handler({ template: 'my-workflow.yaml', inputs: { target: 'src/main.ts' } });

      expect(mockEngine.loadTemplate).toHaveBeenCalledWith('my-workflow.yaml');
    });

    it('should detect yml extension as file path', async () => {
      const handler = getToolHandler();
      await handler({ template: 'my-workflow.yml', inputs: { target: 'src/main.ts' } });

      expect(mockEngine.loadTemplate).toHaveBeenCalledWith('my-workflow.yml');
    });
  });

  describe('template loading failure', () => {
    beforeEach(() => {
      mockEngine = createMockWorkflowEngine({
        loadTemplateResult: { ok: false, error: new ParseError('Invalid YAML syntax at line 10') },
      });
      deps = { workflowEngine: mockEngine, logger: mockLogger };
      registerRunWorkflowTool(
        mockServer as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer,
        deps
      );
    });

    it('should return error when template fails to load', async () => {
      const handler = getToolHandler();
      const result = await handler({ template: '/invalid/workflow.yaml', inputs: {} });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Failed to load template');
      expect(result.content[0]?.text).toContain('Invalid YAML syntax');
    });
  });

  describe('input validation', () => {
    beforeEach(() => {
      mockEngine = createMockWorkflowEngine();
      deps = { workflowEngine: mockEngine, logger: mockLogger };
      registerRunWorkflowTool(
        mockServer as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer,
        deps
      );
    });

    it('should reject invalid input schema', async () => {
      const handler = getToolHandler();
      const result = await handler({ template: '', inputs: {} });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Validation error');
    });

    it('should reject missing required workflow inputs', async () => {
      const handler = getToolHandler();
      const result = await handler({ template: 'code-review', inputs: {} });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Missing required input');
      expect(result.content[0]?.text).toContain('target');
    });
  });

  describe('without logger', () => {
    beforeEach(() => {
      mockEngine = createMockWorkflowEngine();
      deps = { workflowEngine: mockEngine };
      registerRunWorkflowTool(
        mockServer as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer,
        deps
      );
    });

    it('should work without logger', async () => {
      const handler = getToolHandler();
      const result = await handler({ template: 'code-review', inputs: { target: 'src/main.ts' } });

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);
    });
  });
});
