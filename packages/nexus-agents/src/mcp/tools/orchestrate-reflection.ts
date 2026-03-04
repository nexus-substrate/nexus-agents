/**
 * Post-task reflection loop for automated session learning (Issue #1392).
 *
 * After worker dispatch completes, analyzes outcomes to extract structured
 * learnings and writes them to SessionMemory. Gated behind
 * NEXUS_REFLECTIVE_MEMORY=true. Best-effort — never throws.
 *
 * @module mcp/tools/orchestrate-reflection
 * (Source: Issue #1392, arXiv:2303.11366 — Reflexion)
 */

import type { WorkerResult } from '../../orchestration/aorchestra/index.js';
import type { IModelAdapter } from '../../core/index.js';
import type { ContentBlock } from '../../core/types/model.js';
import { createLogger, getErrorMessage } from '../../core/index.js';
import { isReflectiveMemoryEnabled } from './reflective-retriever.js';
import { createSessionMemory } from '../../context/session-memory.js';
import * as os from 'node:os';
import * as path from 'node:path';

const logger = createLogger({ component: 'orchestrate-reflection' });

/** Maximum tokens for reflection prompt response. */
const REFLECTION_MAX_TOKENS = 1000;

// ============================================================================
// Types
// ============================================================================

/** A structured learning extracted from reflection. */
export interface ExtractedLearning {
  readonly pattern: string;
  readonly context: string;
  readonly confidence: number;
}

/** Result of a reflection pass. */
export interface ReflectionResult {
  readonly learnings: readonly ExtractedLearning[];
  readonly written: number;
}

// ============================================================================
// Prompt Builder
// ============================================================================

/**
 * Build a reflection prompt from worker results.
 * Asks the LLM to extract actionable learnings in a structured format.
 */
export function buildReflectionPrompt(
  taskDescription: string,
  results: readonly WorkerResult[]
): string {
  const successes = results.filter((r) => r.status === 'success');
  const errors = results.filter((r) => r.status === 'error');

  const parts: string[] = [
    'You are a reflection agent. Analyze these task outcomes and extract reusable learnings.',
    '',
    `## Task: ${taskDescription.slice(0, 300)}`,
    '',
    `## Outcomes: ${String(successes.length)} succeeded, ${String(errors.length)} failed`,
  ];

  for (const r of successes.slice(0, 3)) {
    parts.push(`- ${r.role}: success (${String(r.durationMs)}ms)`);
  }
  for (const r of errors.slice(0, 3)) {
    parts.push(`- ${r.role}: FAILED — ${r.error?.slice(0, 100) ?? 'unknown'}`);
  }

  parts.push('');
  parts.push('Extract 1-3 learnings. Each MUST have:');
  parts.push('- pattern: A reusable technique or anti-pattern (1 sentence)');
  parts.push('- context: When this applies (1 sentence)');
  parts.push('- confidence: 0.0-1.0 (higher for clear patterns)');
  parts.push('');
  parts.push('Return ONLY valid JSON array: [{"pattern":"...","context":"...","confidence":0.8}]');

  return parts.join('\n');
}

// ============================================================================
// Learning Parser
// ============================================================================

/** Parse learnings from LLM response text. Returns empty array on failure. */
export function parseLearnings(text: string): ExtractedLearning[] {
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch === null) return [];

    const parsed: unknown = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    const learnings: ExtractedLearning[] = [];
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) continue;
      const record = item as Record<string, unknown>;
      if (typeof record['pattern'] !== 'string') continue;
      if (typeof record['context'] !== 'string') continue;
      const confidence = typeof record['confidence'] === 'number' ? record['confidence'] : 0.5;
      learnings.push({
        pattern: record['pattern'].slice(0, 200),
        context: record['context'].slice(0, 200),
        confidence: Math.max(0, Math.min(1, confidence)),
      });
    }
    return learnings.slice(0, 3);
  } catch {
    return [];
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Generate reflections from worker dispatch results and write to SessionMemory.
 *
 * Best-effort: never throws, never blocks the dispatch pipeline.
 * Only runs when NEXUS_REFLECTIVE_MEMORY=true.
 *
 * @param taskDescription - Original task description
 * @param results - Worker results from dispatch
 * @param modelAdapter - Model adapter for LLM reflection prompt
 * @returns Reflection result with learnings count, or undefined if skipped
 */
export async function generateReflection(
  taskDescription: string,
  results: readonly WorkerResult[],
  modelAdapter: IModelAdapter
): Promise<ReflectionResult | undefined> {
  if (!isReflectiveMemoryEnabled()) return undefined;
  if (results.length === 0) return undefined;

  try {
    const prompt = buildReflectionPrompt(taskDescription, results);
    const response = await modelAdapter.complete({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: REFLECTION_MAX_TOKENS,
    });

    if (!response.ok) {
      logger.debug('Reflection LLM call failed', { error: response.error.message });
      return { learnings: [], written: 0 };
    }

    const text = response.value.content
      .filter((b: ContentBlock): b is ContentBlock & { type: 'text' } => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    const learnings = parseLearnings(text);
    const written = writeLearningsToSession(learnings, taskDescription);

    logger.info('Reflection complete', {
      extracted: learnings.length,
      written,
    });

    return { learnings, written };
  } catch (error: unknown) {
    logger.debug('Reflection failed (best-effort)', { error: getErrorMessage(error) });
    return { learnings: [], written: 0 };
  }
}

/** Write extracted learnings to SessionMemory. Returns count written. */
function writeLearningsToSession(
  learnings: readonly ExtractedLearning[],
  taskDescription: string
): number {
  if (learnings.length === 0) return 0;

  try {
    const memoryDir = path.join(os.homedir(), '.nexus-agents', 'memory', 'sessions');
    const memory = createSessionMemory(memoryDir);
    const sessionId = `reflection-${String(Date.now())}`;
    const startResult = memory.startSession(sessionId);
    if (!startResult.ok) return 0;

    let written = 0;
    for (const learning of learnings) {
      const result = memory.recordLearning({
        pattern: learning.pattern,
        context: learning.context,
        confidence: learning.confidence,
        source: `reflection:${taskDescription.slice(0, 50)}`,
      });
      if (result.ok) written++;
    }

    memory.endSession(`Reflection: ${taskDescription.slice(0, 100)}`);
    return written;
  } catch {
    return 0;
  }
}
