/**
 * The registerMcpTools → run_workflow seam, unmocked (#5116).
 *
 * WHY THIS FILE EXISTS SEPARATELY. `cli-server-tools.test.ts` mocks every
 * sub-registration, so the workflow engine is never built there; the factory
 * tests never go through `buildWorkflowEngine`. Both halves are covered and the
 * seam between them is not — the #5120 shape. That gap is why `run_workflow`
 * returned fabricated `status: 'success'` results on a fresh install, and why
 * 1,313 tests passed with the defect present AND with a fix that would have
 * taken down server startup.
 *
 * These tests drive the REAL registration path with no model adapter, which is
 * exactly the configuration production hits when no API key is set.
 *
 * @module cli-server-tools-workflow-seam.test
 */

import { describe, it, expect, vi } from 'vitest';
import { registerMcpTools, type RegisterMcpToolsOptions } from './cli-server-tools.js';
import type { ILogger } from './core/index.js';
import type { WorkflowDefinition } from './core/index.js';
import { deriveWorkflowStatus } from './mcp/tools/run-workflow-helpers.js';

/**
 * A real, resolvable template. An EMPTY template map made the fabricated-success
 * assertion pass for the wrong reason — the workflow never resolved, so execution
 * was never attempted and no mock step result was produced. The fixture has to
 * reach the executor for the assertion to mean anything.
 */
function seamWorkflow(): WorkflowDefinition {
  return {
    name: 'seam-probe',
    version: '1.0.0',
    description: 'Reaches the step executor so the assertion is not vacuous',
    inputs: [],
    steps: [{ id: 'step1', agent: 'code_expert', action: 'analyze', inputs: {} }],
  } as unknown as WorkflowDefinition;
}

interface CapturedTool {
  readonly name: string;
  readonly callback: (args: unknown, extra?: unknown) => Promise<unknown>;
}

function makeCapturingServer(captured: CapturedTool[]): RegisterMcpToolsOptions['server'] {
  return {
    registerTool: vi.fn((name: string, _cfg: unknown, callback: unknown) => {
      captured.push({ name, callback: callback as CapturedTool['callback'] });
    }),
    tool: vi.fn(),
    registerPrompt: vi.fn(),
    registerResource: vi.fn(),
    connect: vi.fn(),
    server: { setRequestHandler: vi.fn() },
    // execute_expert registers through the experimental tasks primitive rather
    // than registerTool — the one tool of 46 outside the standard stack (#4981).
    experimental: {
      tasks: {
        registerToolTask: vi.fn((name: string, _cfg: unknown, callback: unknown) => {
          captured.push({ name, callback: callback as CapturedTool['callback'] });
        }),
      },
    },
  } as unknown as RegisterMcpToolsOptions['server'];
}

function makeLogger(): ILogger {
  const l: Record<string, unknown> = {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    setLevel: vi.fn(),
  };
  l['child'] = vi.fn(() => l as unknown as ILogger);
  return l as unknown as ILogger;
}

describe('registerMcpTools → run_workflow, no model adapter (#5116)', () => {
  function registerWithoutAdapter(): { captured: CapturedTool[]; logger: ILogger } {
    const captured: CapturedTool[] = [];
    const logger = makeLogger();
    registerMcpTools({
      server: makeCapturingServer(captured),
      logger,
      builtInTemplates: new Map([['seam-probe', seamWorkflow()]]),
    });
    return { captured, logger };
  }

  it('registers tools at all — a missing adapter must not take down the server', () => {
    // The naive fix for the fabricated-success bug (removing the inferred
    // useMockExecutor) throws inside registerMcpTools, because the engine is
    // built eagerly at registration and the #507 fail-safe fires at
    // construction. That would kill all 47 tools over one unconfigured
    // adapter. This is the guard against fixing the bug that way.
    const { captured } = registerWithoutAdapter();

    expect(captured.length).toBeGreaterThan(10);
    expect(captured.some((t) => t.name === 'run_workflow')).toBe(true);
  });

  it('keeps list_workflows available without an adapter', () => {
    // Enumerating templates needs no execution capability. Whatever happens to
    // run_workflow, this must keep working — it is the capability split that
    // #5116 option B is built on.
    const { captured } = registerWithoutAdapter();

    expect(captured.some((t) => t.name === 'list_workflows')).toBe(true);
  });

  it('does NOT report a fabricated success for a workflow it cannot execute', async () => {
    const { captured } = registerWithoutAdapter();
    const runWorkflow = captured.find((t) => t.name === 'run_workflow');
    expect(runWorkflow).toBeDefined();

    const result = (await runWorkflow?.callback({ template: 'seam-probe', inputs: {} }, {})) as {
      isError?: boolean;
      content?: Array<{ text?: string }>;
    };

    // Assert on the OUTCOME, not on a message string. An earlier version of
    // this test checked that the response did not contain "Executed step" —
    // and it stopped catching the bug the moment the mock executor's message
    // changed, even with the defect fully restored. Two fixes in one branch
    // masked each other's test.
    //
    // The durable contract: a server that cannot execute must not return a
    // non-error result for a run request. Whether it says "no adapter" or
    // anything else is presentation; claiming a run happened is the defect.
    const text = result.content?.map((c) => c.text ?? '').join(' ') ?? '';
    expect(result.isError).toBe(true);
    expect(text.toLowerCase()).toContain('cannot execute');
    // Also assert the AGGREGATE, because the step-level fix moved the lie up a
    // level once: all-skipped steps aggregated to "status": "completed".
    expect(text).not.toContain('"status": "completed"');
  });

  it('the production registration supplies resolveExecutionEngine', async () => {
    // The optional field's JSDoc claims this test exists. It did not, until an
    // adversarial review pointed out the comment asserted a mitigation that was
    // never written — a claim in a doc comment is not a guarantee.
    //
    // Behavioural rather than structural: if the production registration ever
    // omits the resolver, run_workflow falls back to the LISTING engine, whose
    // executor does not run steps — so this returns a non-error result instead
    // of the honest failure.
    const { captured } = registerWithoutAdapter();
    const runWorkflow = captured.find((t) => t.name === 'run_workflow');

    const result = (await runWorkflow?.callback({ template: 'seam-probe', inputs: {} }, {})) as {
      isError?: boolean;
    };

    expect(result.isError).toBe(true);
  });

  it('does not aggregate all-skipped steps into a completed workflow', () => {
    // The step-level honesty fix ('success' -> 'skipped' for unexecuted steps)
    // moved the fabricated success up a level: deriveWorkflowStatus returned
    // 'completed' whenever nothing had FAILED, which is true of an all-skipped
    // run. Pinned here because the two fixes masked each other once already.
    expect(deriveWorkflowStatus([{ status: 'skipped' }])).toBe('failed');
    expect(deriveWorkflowStatus([{ status: 'skipped' }, { status: 'skipped' }])).toBe('failed');
    expect(deriveWorkflowStatus([{ status: 'success' }])).toBe('completed');
    expect(deriveWorkflowStatus([{ status: 'success' }, { status: 'failed' }])).toBe('failed');
    // The empty case, named explicitly per the disciplines rule.
    expect(deriveWorkflowStatus([])).toBe('failed');
  });
});
