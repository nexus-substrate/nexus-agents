/**
 * Table-driven contract for the async-dispatch input on every async-capable
 * tool (#4968): `dispatch` is accepted everywhere; the three tools that spelled
 * it `mode` now reject that alias; all tools reject `mode: 'async'`
 * with an error that names `dispatch` instead of dropping the key; and
 * `run_dev_pipeline`'s real `mode` (`autonomous` | `harness`) is untouched.
 *
 * The wrong-key rows run against the ADVERTISED shape — the object the MCP SDK
 * builds and parses before a handler sees anything — because that is the only
 * layer where the rejection can fire (see the module doc of
 * `async-dispatch-input.ts`). Deleting `REJECTED_MODE_KEY` from the fragment
 * must turn those rows red.
 *
 * @module mcp/tools/async-dispatch-input.test
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { asyncDispatchInput, WRONG_KEY_MODE_MESSAGE } from './async-dispatch-input.js';
import { ConsensusVoteInputSchema } from './consensus-vote-types.js';
import { RunWorkflowInputSchema } from './run-workflow-types.js';
import { ORCHESTRATE_TOOL_SCHEMA, OrchestrateInputSchema } from './orchestrate-types.js';
import { DevPipelineInputSchema } from './dev-pipeline-tool.js';
import { PipelineInputSchema } from './pipeline-tool.js';
import { RunInputSchema } from './run-tool.js';
import { PrReviewInputSchema } from './pr-review-tool.js';
import { ExecuteSpecInputSchema, registerExecuteSpecTool } from './execute-spec-tool.js';
import { SupplyChainTradeoffPanelInputSchema } from './supply-chain-tradeoff-panel.js';
import { RunGraphWorkflowInputSchema, registerRunGraphWorkflowTool } from './run-graph-workflow.js';

type Shape = Record<string, z.ZodType>;

/** Capture the `inputSchema` a register function advertises to the SDK. */
function captureAdvertisedShape(
  register: (server: never, deps: never) => void,
  toolName: string
): Shape {
  let captured: Shape | undefined;
  const server = {
    registerTool: (name: string, config: { inputSchema: Shape }) => {
      if (name === toolName) captured = config.inputSchema;
    },
  };
  register(
    server as never,
    {
      rateLimiter: { tryConsume: () => ({ allowed: true, remaining: 99 }) },
    } as never
  );
  if (captured === undefined) throw new Error(`${toolName} did not register an inputSchema`);
  return captured;
}

interface ToolRow {
  readonly tool: string;
  /** Source file, so the table is checked against the `runAsJob` callers on disk. */
  readonly file: string;
  /** The handler's internal schema (what `safeParse` runs). */
  readonly schema: z.ZodObject<z.ZodRawShape>;
  /** What `server.registerTool` advertises — the object the SDK parses. */
  readonly advertised: () => Shape;
  /** Minimal valid arguments. */
  readonly base: Record<string, unknown>;
}

const TOOLS: readonly ToolRow[] = [
  {
    tool: 'consensus_vote',
    file: 'consensus-vote.ts',
    schema: ConsensusVoteInputSchema,
    advertised: () => ConsensusVoteInputSchema.shape,
    base: { proposal: 'ship it' },
  },
  {
    tool: 'run_workflow',
    file: 'run-workflow.ts',
    schema: RunWorkflowInputSchema,
    advertised: () => RunWorkflowInputSchema.shape,
    base: { template: 'code-review', inputs: {} },
  },
  {
    tool: 'orchestrate',
    file: 'orchestrate.ts',
    schema: OrchestrateInputSchema,
    advertised: () => ORCHESTRATE_TOOL_SCHEMA,
    base: { task: 'do the thing' },
  },
  {
    tool: 'run_dev_pipeline',
    file: 'dev-pipeline-tool.ts',
    schema: DevPipelineInputSchema,
    advertised: () => DevPipelineInputSchema.shape,
    base: { task: 'implement it' },
  },
  {
    tool: 'run_pipeline',
    file: 'pipeline-tool.ts',
    schema: PipelineInputSchema,
    advertised: () => PipelineInputSchema.shape,
    base: { task: 'valid task' },
  },
  {
    tool: 'run',
    file: 'run-tool.ts',
    schema: RunInputSchema,
    advertised: () => RunInputSchema.shape,
    base: { goal: 'a goal' },
  },
  {
    tool: 'pr_review',
    file: 'pr-review-tool.ts',
    schema: PrReviewInputSchema,
    advertised: () => PrReviewInputSchema.shape,
    base: { prTitle: 'x', prDiff: 'diff --git a/x.ts b/x.ts\n@@ -1 +1 @@\n-a\n+b\n' },
  },
  {
    tool: 'execute_spec',
    file: 'execute-spec-tool.ts',
    schema: ExecuteSpecInputSchema,
    advertised: () => captureAdvertisedShape(registerExecuteSpecTool, 'execute_spec'),
    base: { spec: '# Feature' },
  },
  {
    tool: 'supply_chain_tradeoff_panel',
    file: 'supply-chain-tradeoff-panel.ts',
    schema: SupplyChainTradeoffPanelInputSchema,
    advertised: () => SupplyChainTradeoffPanelInputSchema.shape,
    base: { proposal: 'adopt it' },
  },
  {
    tool: 'run_graph_workflow',
    file: 'run-graph-workflow.ts',
    schema: RunGraphWorkflowInputSchema,
    advertised: () => captureAdvertisedShape(registerRunGraphWorkflowTool, 'run_graph_workflow'),
    base: { workflow: 'echo' },
  },
];

function messagesOf(result: z.ZodSafeParseResult<unknown>): string[] {
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

describe('async-dispatch input table covers every runAsJob caller (#4968)', () => {
  it('lists exactly the tool files that dispatch through runAsJob', () => {
    // Guard the table: a new async-capable tool that does not compose the
    // fragment must show up here, not silently re-open the split.
    const onDisk = readdirSync(import.meta.dirname)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .filter((f) => /runAsJob[<(]/.test(readFileSync(join(import.meta.dirname, f), 'utf8')))
      .sort();
    expect(onDisk).toEqual(TOOLS.map((t) => t.file).sort());
  });
});

describe.each(TOOLS)(
  '$tool accepts the canonical `dispatch` key',
  ({ schema, advertised, base }) => {
    it.each(['sync', 'async'] as const)('parses dispatch: %s on the internal schema', (value) => {
      const parsed = schema.safeParse({ ...base, dispatch: value });
      expect(messagesOf(parsed)).toEqual([]);
      expect(parsed.success && parsed.data['dispatch']).toBe(value);
    });

    it('parses dispatch: async on the advertised shape (what the SDK builds)', () => {
      const parsed = z.object(advertised()).safeParse({ ...base, dispatch: 'async' });
      expect(messagesOf(parsed)).toEqual([]);
      expect(parsed.success && parsed.data['dispatch']).toBe('async');
    });

    it('advertises dispatch as the sync|async enum in JSON Schema', () => {
      const json = z.toJSONSchema(z.object(advertised()), { io: 'input' }) as {
        properties: Record<string, { enum?: string[] }>;
      };
      expect(json.properties['dispatch']?.enum).toEqual(['sync', 'async']);
    });
  }
);

describe.each(TOOLS)('$tool rejects the wrong key `mode`', ({ schema, advertised, base }) => {
  it.each(['async', 'sync'] as const)(
    'mode: %s on the advertised shape is rejected with an error naming dispatch',
    (value) => {
      // This is the row the wrong-key trap exists for: the SDK parses exactly
      // this object, and before #4968 the key was stripped and the run was sync.
      const parsed = z.object(advertised()).safeParse({ ...base, mode: value });
      const messages = messagesOf(parsed);
      expect(messages).toEqual([`mode: ${WRONG_KEY_MODE_MESSAGE}`]);
    }
  );

  it('mode: async on the internal schema is rejected the same way', () => {
    expect(messagesOf(schema.safeParse({ ...base, mode: 'async' }))).toEqual([
      `mode: ${WRONG_KEY_MODE_MESSAGE}`,
    ]);
  });

  it.each(['sync', 'async'] as const)(
    'rejects mode even when dispatch: %s is present',
    (dispatch) => {
      const parsed = z.object(advertised()).safeParse({ ...base, dispatch, mode: 'async' });
      expect(messagesOf(parsed)).toEqual([`mode: ${WRONG_KEY_MODE_MESSAGE}`]);
    }
  );

  it('the rejection message names the key to send', () => {
    expect(WRONG_KEY_MODE_MESSAGE).toContain('`dispatch: "async"`');
  });
});

describe('run_dev_pipeline keeps its real `mode` (#4968)', () => {
  it.each(['autonomous', 'harness'] as const)('mode: %s still parses', (mode) => {
    const parsed = DevPipelineInputSchema.safeParse({ task: 'implement it', mode });
    expect(messagesOf(parsed)).toEqual([]);
    expect(parsed.success && parsed.data.mode).toBe(mode);
  });

  it('defaults mode to autonomous', () => {
    expect(DevPipelineInputSchema.parse({ task: 'implement it' }).mode).toBe('autonomous');
  });

  it('a value that is neither a pipeline mode nor a dispatch value keeps the enum error', () => {
    const messages = messagesOf(DevPipelineInputSchema.safeParse({ task: 't', mode: 'bogus' }));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('autonomous');
    expect(messages[0]).not.toContain('dispatch');
  });
});

describe('fragment helpers (#4968)', () => {
  it('asyncDispatchInput accepts valid dispatch, rejects invalid values, and defaults to omission', () => {
    const obj = z.object(asyncDispatchInput());
    expect(obj.safeParse({ dispatch: 'later' }).success).toBe(false);
    expect(obj.parse({ dispatch: 'async' }).dispatch).toBe('async');
    expect(obj.parse({}).dispatch).toBeUndefined();
  });
});
