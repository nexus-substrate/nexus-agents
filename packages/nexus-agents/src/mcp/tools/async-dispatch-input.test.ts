/**
 * Table-driven contract for the async-dispatch input on every async-capable
 * tool (#4968): `dispatch` is accepted everywhere; the three tools that spelled
 * it `mode` accept the deprecated alias with a warning and reject a
 * disagreeing pair; the seven `dispatch`-only tools reject `mode: 'async'`
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
import type { ToolResult } from './tool-result.js';
import {
  DEPRECATED_MODE_ALIAS_INPUT,
  MODE_ALIAS_REMOVAL_ISSUE,
  WARNINGS_META_KEY,
  WRONG_KEY_MODE_MESSAGE,
  deprecatedModeWarning,
  resolveDispatch,
  withWarnings,
} from './async-dispatch-input.js';
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
  /** `deprecated-mode`: had `mode`, now also takes `dispatch`. `dispatch`: never had `mode`. */
  readonly kind: 'deprecated-mode' | 'dispatch';
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
    kind: 'deprecated-mode',
    schema: ConsensusVoteInputSchema,
    advertised: () => ConsensusVoteInputSchema.shape,
    base: { proposal: 'ship it' },
  },
  {
    tool: 'run_workflow',
    file: 'run-workflow.ts',
    kind: 'deprecated-mode',
    schema: RunWorkflowInputSchema,
    advertised: () => RunWorkflowInputSchema.shape,
    base: { template: 'code-review', inputs: {} },
  },
  {
    tool: 'orchestrate',
    file: 'orchestrate.ts',
    kind: 'deprecated-mode',
    schema: OrchestrateInputSchema,
    advertised: () => ORCHESTRATE_TOOL_SCHEMA,
    base: { task: 'do the thing' },
  },
  {
    tool: 'run_dev_pipeline',
    file: 'dev-pipeline-tool.ts',
    kind: 'dispatch',
    schema: DevPipelineInputSchema,
    advertised: () => DevPipelineInputSchema.shape,
    base: { task: 'implement it' },
  },
  {
    tool: 'run_pipeline',
    file: 'pipeline-tool.ts',
    kind: 'dispatch',
    schema: PipelineInputSchema,
    advertised: () => PipelineInputSchema.shape,
    base: { task: 'valid task' },
  },
  {
    tool: 'run',
    file: 'run-tool.ts',
    kind: 'dispatch',
    schema: RunInputSchema,
    advertised: () => RunInputSchema.shape,
    base: { goal: 'a goal' },
  },
  {
    tool: 'pr_review',
    file: 'pr-review-tool.ts',
    kind: 'dispatch',
    schema: PrReviewInputSchema,
    advertised: () => PrReviewInputSchema.shape,
    base: { prTitle: 'x', prDiff: 'diff --git a/x.ts b/x.ts\n@@ -1 +1 @@\n-a\n+b\n' },
  },
  {
    tool: 'execute_spec',
    file: 'execute-spec-tool.ts',
    kind: 'dispatch',
    schema: ExecuteSpecInputSchema,
    advertised: () => captureAdvertisedShape(registerExecuteSpecTool, 'execute_spec'),
    base: { spec: '# Feature' },
  },
  {
    tool: 'supply_chain_tradeoff_panel',
    file: 'supply-chain-tradeoff-panel.ts',
    kind: 'dispatch',
    schema: SupplyChainTradeoffPanelInputSchema,
    advertised: () => SupplyChainTradeoffPanelInputSchema.shape,
    base: { proposal: 'adopt it' },
  },
  {
    tool: 'run_graph_workflow',
    file: 'run-graph-workflow.ts',
    kind: 'dispatch',
    schema: RunGraphWorkflowInputSchema,
    advertised: () => captureAdvertisedShape(registerRunGraphWorkflowTool, 'run_graph_workflow'),
    base: { workflow: 'echo' },
  },
];

const DEPRECATED_MODE_TOOLS = TOOLS.filter((t) => t.kind === 'deprecated-mode');
const DISPATCH_TOOLS = TOOLS.filter((t) => t.kind === 'dispatch');

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
    expect(DEPRECATED_MODE_TOOLS.map((t) => t.tool)).toEqual([
      'consensus_vote',
      'run_workflow',
      'orchestrate',
    ]);
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

describe.each(DEPRECATED_MODE_TOOLS)(
  '$tool accepts deprecated `mode` with a warning',
  ({ schema, advertised, base }) => {
    it('mode: async parses, resolves to async, and warns naming dispatch', () => {
      const parsed = schema.safeParse({ ...base, mode: 'async' });
      expect(messagesOf(parsed)).toEqual([]);
      if (!parsed.success) return;
      expect(resolveDispatch(parsed.data)).toBe('async');
      const warning = deprecatedModeWarning(parsed.data);
      expect(warning).toContain('dispatch: "async"');
      expect(warning).toContain(MODE_ALIAS_REMOVAL_ISSUE);
    });

    it('mode: async survives the advertised shape (not stripped)', () => {
      const parsed = z.object(advertised()).safeParse({ ...base, mode: 'async' });
      expect(parsed.success && parsed.data['mode']).toBe('async');
    });

    it('dispatch present → no warning, whatever mode says', () => {
      const parsed = schema.safeParse({ ...base, dispatch: 'async', mode: 'async' });
      expect(messagesOf(parsed)).toEqual([]);
      if (!parsed.success) return;
      expect(resolveDispatch(parsed.data)).toBe('async');
      expect(deprecatedModeWarning(parsed.data)).toBeUndefined();
    });

    it('neither key → undefined dispatch and no warning', () => {
      const parsed = schema.safeParse(base);
      expect(messagesOf(parsed)).toEqual([]);
      if (!parsed.success) return;
      expect(resolveDispatch(parsed.data)).toBeUndefined();
      expect(deprecatedModeWarning(parsed.data)).toBeUndefined();
    });

    it.each([
      ['async', 'sync'],
      ['sync', 'async'],
    ] as const)(
      'dispatch: %s with mode: %s is a validation error naming both',
      (dispatch, mode) => {
        const parsed = schema.safeParse({ ...base, dispatch, mode });
        const messages = messagesOf(parsed);
        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain(`dispatch: "${dispatch}"`);
        expect(messages[0]).toContain(`mode: "${mode}"`);
      }
    );

    it('both present and agreeing → no warning', () => {
      const parsed = schema.safeParse({ ...base, dispatch: 'sync', mode: 'sync' });
      expect(parsed.success && deprecatedModeWarning(parsed.data)).toBeUndefined();
    });

    it('describes mode as deprecated and points at the removal issue', () => {
      const description = advertised()['mode']?.description ?? '';
      expect(description).toContain('DEPRECATED');
      expect(description).toContain(MODE_ALIAS_REMOVAL_ISSUE);
    });
  }
);

describe.each(DISPATCH_TOOLS)(
  '$tool rejects the wrong key `mode`',
  ({ schema, advertised, base }) => {
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

    it('the rejection message names the key to send', () => {
      expect(WRONG_KEY_MODE_MESSAGE).toContain('`dispatch: "async"`');
    });
  }
);

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
  it('resolveDispatch prefers dispatch over mode (precedence row)', () => {
    // The schemas reject a disagreeing pair before the helper runs, so
    // precedence is only observable on the helper itself. Pin it here: a
    // resolution written `mode ?? dispatch` would pass every schema row.
    expect(resolveDispatch({ dispatch: 'async', mode: 'sync' })).toBe('async');
    expect(resolveDispatch({ dispatch: 'sync', mode: 'async' })).toBe('sync');
    expect(resolveDispatch({ mode: 'async' })).toBe('async');
    expect(resolveDispatch({})).toBeUndefined();
  });

  it('DEPRECATED_MODE_ALIAS_INPUT exposes dispatch and mode as the same enum', () => {
    const obj = z.object(DEPRECATED_MODE_ALIAS_INPUT);
    expect(obj.safeParse({ dispatch: 'later' }).success).toBe(false);
    expect(obj.safeParse({ mode: 'later' }).success).toBe(false);
    expect(obj.safeParse({}).success).toBe(true);
  });

  it('withWarnings attaches under the namespaced _meta key and keeps prior _meta', () => {
    const errored: ToolResult = {
      content: [{ type: 'text', text: 'x' }],
      _meta: { 'nexus-agents/error': { a: 1 } },
    };
    const decorated = withWarnings(errored, ['w1', undefined, 'w2']);
    expect(decorated._meta).toEqual({
      'nexus-agents/error': { a: 1 },
      [WARNINGS_META_KEY]: ['w1', 'w2'],
    });
  });

  it('withWarnings appends to warnings already present', () => {
    const plain: ToolResult = { content: [] };
    const once = withWarnings(plain, ['w1']);
    const twice = withWarnings(once, ['w2']);
    expect(twice._meta?.[WARNINGS_META_KEY]).toEqual(['w1', 'w2']);
  });

  it('withWarnings with nothing to say leaves the result untouched (no empty key)', () => {
    const result: ToolResult = { content: [{ type: 'text', text: 'x' }] };
    expect(withWarnings(result, [undefined])).toBe(result);
    expect(withWarnings(result, [])).toBe(result);
  });
});
