/**
 * nexus-agents/agents - CodeExpert Helper Functions
 *
 * Extracted helper functions for CodeExpert to keep the main file under 400 lines.
 */

import type { AgentCapability } from '../../core/index.js';
import type { BaseAgentOptions } from '../base-agent.js';
import type { CodeAnalysisResult, ExpertOptions } from './expert-types.js';
import { EXPERT_DEFAULT_TEMPERATURES, EXPERT_DEFAULT_CAPABILITIES } from './expert-types.js';

/**
 * Configuration options for CodeExpert.
 */
export interface CodeExpertOptions extends ExpertOptions {
  /** Enable strict type checking recommendations */
  strictTypes?: boolean;
  /** Preferred code style (if applicable) */
  codeStyle?: 'functional' | 'object-oriented' | 'mixed';
  /** Target language for code generation */
  targetLanguage?: string;
}

/**
 * System prompt for the CodeExpert agent.
 */
export const CODE_EXPERT_SYSTEM_PROMPT = `You are a senior software engineer expert specializing in code generation, refactoring, optimization, and debugging.

## Core Principles
1. Write clean, maintainable, and well-documented code
2. Follow SOLID principles and established design patterns
3. Prioritize readability over cleverness
4. Consider edge cases and error handling
5. Include appropriate type annotations

## Output Format
Respond with JSON matching this structure:
{
  "content": "Summary of what was done",
  "operationType": "generation" | "refactoring" | "optimization" | "debugging",
  "codeChanges": [
    {
      "file": "path/to/file.ts",
      "modified": "// new or modified code",
      "description": "What this change does"
    }
  ],
  "recommendations": ["Suggestion 1", "Suggestion 2"],
  "warnings": ["Warning 1"],
  "confidence": 0.0-1.0
}

## Guidelines
- For code generation: Create complete, working implementations
- For refactoring: Preserve functionality while improving structure
- For optimization: Measure before and after, document trade-offs
- For debugging: Identify root cause, not just symptoms`;

/**
 * Build base options for CodeExpert constructor.
 */
export function buildCodeExpertBaseOptions(
  options: Partial<BaseAgentOptions>,
  expertOpts: CodeExpertOptions
): BaseAgentOptions {
  const temperature = expertOpts.temperature ?? EXPERT_DEFAULT_TEMPERATURES.code;
  const baseCapabilities = EXPERT_DEFAULT_CAPABILITIES.code_expert;
  const additionalCaps = expertOpts.additionalCapabilities ?? [];

  const baseOptions: BaseAgentOptions = {
    id: options.id ?? 'code-expert',
    role: 'code_expert',
    capabilities: [...baseCapabilities, ...additionalCaps] as AgentCapability[],
    temperature,
    maxTokens: options.maxTokens ?? 8192,
    systemPrompt: expertOpts.systemPromptOverride ?? CODE_EXPERT_SYSTEM_PROMPT,
  };

  if (options.adapter !== undefined) baseOptions.adapter = options.adapter;
  if (options.logger !== undefined) baseOptions.logger = options.logger;

  return baseOptions;
}

/**
 * Infer the operation type from task description.
 */
export function inferOperationType(description: string): CodeAnalysisResult['operationType'] {
  const desc = description.toLowerCase();

  if (desc.includes('debug') || desc.includes('fix bug') || desc.includes('error')) {
    return 'debugging';
  }
  if (desc.includes('optimize') || desc.includes('performance') || desc.includes('faster')) {
    return 'optimization';
  }
  if (desc.includes('refactor') || desc.includes('clean') || desc.includes('restructure')) {
    return 'refactoring';
  }
  return 'generation';
}

/**
 * Generate recommendations based on operation type.
 */
export function generateHeuristicRecommendations(
  operationType: CodeAnalysisResult['operationType']
): string[] {
  const baseRecs = ['Consider adding unit tests', 'Document public interfaces'];

  switch (operationType) {
    case 'generation':
      return [...baseRecs, 'Follow project coding standards', 'Use TypeScript strict mode'];
    case 'refactoring':
      return [...baseRecs, 'Ensure tests pass before and after', 'Make incremental changes'];
    case 'optimization':
      return [...baseRecs, 'Benchmark before optimizing', 'Document trade-offs'];
    case 'debugging':
      return [...baseRecs, 'Add regression test for the bug', 'Check for similar issues'];
    default:
      return baseRecs;
  }
}

/**
 * Detect potential warnings from task description.
 */
export function detectHeuristicWarnings(description: string): string[] {
  const warnings: string[] = [];
  const desc = description.toLowerCase();

  if (desc.includes('database') || desc.includes('sql')) {
    warnings.push('Database changes may require migration');
  }
  if (desc.includes('api') || desc.includes('endpoint')) {
    warnings.push('API changes may be breaking');
  }
  if (desc.includes('security') || desc.includes('auth')) {
    warnings.push('Security-sensitive code requires careful review');
  }
  if (desc.includes('concurrent') || desc.includes('async')) {
    warnings.push('Concurrency requires careful error handling');
  }

  return warnings;
}

/**
 * Extract JSON from text that may contain markdown code blocks.
 */
export function extractJsonFromText(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match?.[1]?.trim() ?? text.trim();
}

/** Valid operationType values for CodeAnalysisResult. */
const VALID_OPERATION_TYPES = new Set<CodeAnalysisResult['operationType']>([
  'generation',
  'refactoring',
  'optimization',
  'debugging',
]);

/** Narrow an unknown value to a CodeAnalysisResult operationType. */
function isValidOperationType(v: unknown): v is CodeAnalysisResult['operationType'] {
  return typeof v === 'string' && VALID_OPERATION_TYPES.has(v as CodeAnalysisResult['operationType']);
}

function isNumberInUnitRange(v: unknown): v is number {
  return typeof v === 'number' && v >= 0 && v <= 1;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

/** Populate optional array fields on result, validating element types. */
function applyOptionalArrays(result: CodeAnalysisResult, p: Record<string, unknown>): void {
  if (isStringArray(p['affectedFiles'])) result.affectedFiles = p['affectedFiles'];
  if (Array.isArray(p['codeChanges'])) {
    result.codeChanges = p['codeChanges'] as CodeAnalysisResult['codeChanges'];
  }
  if (isStringArray(p['recommendations'])) result.recommendations = p['recommendations'];
  if (isStringArray(p['warnings'])) result.warnings = p['warnings'];
}

/**
 * Parse code result from model response.
 *
 * Previously used `JSON.parse(...) as Partial<CodeAnalysisResult>` which
 * skipped runtime validation — an LLM returning `{ confidence: "high" }`
 * would slip through (string passes `?? fallback` since it's truthy).
 * Now validates each field with explicit type guards and falls back to
 * defaults on mismatch (#1913 Class A).
 */
export function parseCodeResult(
  text: string,
  defaultType: CodeAnalysisResult['operationType']
): CodeAnalysisResult {
  try {
    const jsonText = extractJsonFromText(text);
    const rawParsed: unknown = JSON.parse(jsonText);
    if (typeof rawParsed !== 'object' || rawParsed === null || Array.isArray(rawParsed)) {
      throw new Error('Parsed value is not a plain object');
    }
    const p = rawParsed as Record<string, unknown>;

    const result: CodeAnalysisResult = {
      content: typeof p['content'] === 'string' ? p['content'] : 'Code analysis completed',
      operationType: isValidOperationType(p['operationType']) ? p['operationType'] : defaultType,
      confidence: isNumberInUnitRange(p['confidence']) ? p['confidence'] : 0.7,
    };
    applyOptionalArrays(result, p);
    return result;
  } catch {
    // Fall back to treating the whole response as content
    return {
      content: text,
      operationType: defaultType,
      confidence: 0.5,
    };
  }
}
