/**
 * Tests for suggest_research_tasks MCP tool (#1715 / #1711).
 *
 * The engine guardrails (threshold/max/topic/dedup) are unit-tested in
 * research-trigger.test.ts. Here we verify the thin SUGGEST-ONLY wrapper:
 * input → ResearchTriggerConfig mapping, candidate/count/note passthrough,
 * absence of mutating side effects, and registration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCheckForResearchTriggers, mockCheckForCapabilityGapTriggers } = vi.hoisted(() => ({
  mockCheckForResearchTriggers: vi.fn(),
  mockCheckForCapabilityGapTriggers: vi.fn((): unknown[] => []),
}));
vi.mock('../../pipeline/research-trigger.js', () => ({
  checkForResearchTriggers: mockCheckForResearchTriggers,
  checkForCapabilityGapTriggers: mockCheckForCapabilityGapTriggers,
}));

import {
  SuggestResearchTasksInputSchema,
  SUGGEST_RESEARCH_TASKS_NOTE,
  registerSuggestResearchTasksTool,
  type SuggestResearchTasksDeps,
  type SuggestResearchTasksResponse,
} from './suggest-research-tasks-tool.js';
import { checkForResearchTriggers } from '../../pipeline/research-trigger.js';
import { REGISTERED_TOOL_NAMES } from './index.js';
import type { PipelineTask } from '../../pipeline/dev-pipeline.js';

const SAMPLE_TASK: PipelineTask = {
  id: 'research-some-paper',
  title: 'Assess research: Some Paper',
  description: 'Auto-triggered by research_discover (quality: 9/10).',
  assignedTo: 'researcher',
  status: 'pending',
};

function makeDeps(): SuggestResearchTasksDeps {
  return {
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
      setLevel: vi.fn(),
    },
    rateLimiter: { tryAcquire: vi.fn().mockReturnValue(true) },
  } as unknown as SuggestResearchTasksDeps;
}

type RegisteredCallback = (
  args: unknown
) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>;

function captureRegisteredHandler(): {
  server: { registerTool: ReturnType<typeof vi.fn> };
  getHandler: () => RegisteredCallback;
  getName: () => string;
} {
  let captured: RegisteredCallback | undefined;
  let name: string | undefined;
  const registerTool = vi.fn((n: string, _config: unknown, cb: RegisteredCallback): void => {
    name = n;
    captured = cb;
  });
  return {
    server: { registerTool },
    getHandler: () => {
      if (captured === undefined) throw new Error('handler not registered');
      return captured;
    },
    getName: () => name ?? '',
  };
}

async function callHandler(args: unknown): Promise<SuggestResearchTasksResponse> {
  const { server, getHandler } = captureRegisteredHandler();
  registerSuggestResearchTasksTool(server as never, makeDeps());
  const result = await getHandler()(args);
  expect(result.isError).not.toBe(true);
  return JSON.parse(result.content[0]!.text) as SuggestResearchTasksResponse;
}

describe('SuggestResearchTasksInputSchema', () => {
  it('accepts an empty object — all fields optional', () => {
    expect(SuggestResearchTasksInputSchema.safeParse({}).success).toBe(true);
  });

  it('rejects qualityThreshold above 10', () => {
    expect(SuggestResearchTasksInputSchema.safeParse({ qualityThreshold: 11 }).success).toBe(false);
  });

  it('rejects qualityThreshold below 0', () => {
    expect(SuggestResearchTasksInputSchema.safeParse({ qualityThreshold: -1 }).success).toBe(false);
  });

  it('rejects maxTriggers below 1', () => {
    expect(SuggestResearchTasksInputSchema.safeParse({ maxTriggers: 0 }).success).toBe(false);
  });

  it('rejects non-integer maxTriggers', () => {
    expect(SuggestResearchTasksInputSchema.safeParse({ maxTriggers: 1.5 }).success).toBe(false);
  });
});

describe('registerSuggestResearchTasksTool — handler', () => {
  beforeEach(() => {
    mockCheckForResearchTriggers.mockReset();
    mockCheckForResearchTriggers.mockResolvedValue([SAMPLE_TASK]);
  });

  it('maps input straight onto ResearchTriggerConfig (topic/threshold/max/dedup→Set)', async () => {
    await callHandler({
      topic: 'code review automation',
      qualityThreshold: 8,
      maxTriggers: 2,
      existingTaskIds: ['research-a', 'research-b'],
    });

    expect(checkForResearchTriggers).toHaveBeenCalledTimes(1);
    const config = mockCheckForResearchTriggers.mock.calls[0]![0] as Record<string, unknown>;
    expect(config.topic).toBe('code review automation');
    expect(config.qualityThreshold).toBe(8);
    expect(config.maxTriggers).toBe(2);
    expect(config.existingTaskIds).toBeInstanceOf(Set);
    expect([...(config.existingTaskIds as Set<string>)]).toEqual(['research-a', 'research-b']);
  });

  it('passes undefined for omitted optional fields (no Set when no IDs)', async () => {
    await callHandler({});
    const config = mockCheckForResearchTriggers.mock.calls[0]![0] as Record<string, unknown>;
    expect(config.topic).toBeUndefined();
    expect(config.qualityThreshold).toBeUndefined();
    expect(config.maxTriggers).toBeUndefined();
    expect(config.existingTaskIds).toBeUndefined();
  });

  it('includes capability-gap candidates and folds them into the count (#3576)', async () => {
    const gapTask: PipelineTask = {
      ...SAMPLE_TASK,
      id: 'gap-tool-deploy',
      title: 'Build capability: tool "deploy"',
    };
    mockCheckForCapabilityGapTriggers.mockReturnValueOnce([gapTask]);
    const res = await callHandler({});
    expect(res.gapCandidates).toEqual([gapTask]);
    expect(res.candidates).toEqual([SAMPLE_TASK]);
    expect(res.count).toBe(2); // 1 research + 1 gap
  });

  it('returns the engine candidates with count and the untrusted-data note', async () => {
    const res = await callHandler({});
    expect(res.candidates).toEqual([SAMPLE_TASK]);
    expect(res.count).toBe(1);
    expect(res.note).toBe(SUGGEST_RESEARCH_TASKS_NOTE);
    expect(res.note).toMatch(/untrusted/i);
    expect(res.note).toMatch(/nothing was executed or filed/i);
  });

  it('returns an empty candidate list (count 0) when the engine finds nothing', async () => {
    mockCheckForResearchTriggers.mockResolvedValue([]);
    const res = await callHandler({});
    expect(res.candidates).toEqual([]);
    expect(res.count).toBe(0);
  });

  it('is SUGGEST-ONLY — only the read-path engine is called, nothing is mutated', async () => {
    await callHandler({ topic: 'x' });
    // The only collaborator is the read/discover engine. There is no GitHub
    // client, exec, or write call to assert against because the wrapper has
    // no such dependency — verifying the sole call target stays the engine
    // guards against a future mutating dependency creeping in.
    expect(mockCheckForResearchTriggers).toHaveBeenCalledTimes(1);
  });

  it('returns a structured validation error on bad input', async () => {
    const { server, getHandler } = captureRegisteredHandler();
    registerSuggestResearchTasksTool(server as never, makeDeps());
    const result = await getHandler()({ qualityThreshold: 99 });
    expect(result.isError).toBe(true);
    expect(mockCheckForResearchTriggers).not.toHaveBeenCalled();
  });
});

describe('registerSuggestResearchTasksTool — registration', () => {
  it('registers under the name suggest_research_tasks', () => {
    const { server, getName } = captureRegisteredHandler();
    registerSuggestResearchTasksTool(server as never, makeDeps());
    expect(getName()).toBe('suggest_research_tasks');
  });

  it('appears in REGISTERED_TOOL_NAMES', () => {
    expect(REGISTERED_TOOL_NAMES).toContain('suggest_research_tasks');
  });
});
