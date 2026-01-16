/**
 * TRINITY Coordinator Helpers
 *
 * Helper functions for parsing and building TRINITY outputs.
 * (Source: Issue #141, arXiv:2512.04695)
 */

import type { Task } from '../../core/index.js';
import type {
  TrinityRole,
  ThinkerOutput,
  WorkerOutput,
  VerifierOutput,
  TrinityConfig,
  ResolvedConfig,
} from './trinity-types.js';
import { TRINITY_ROLE_PROMPTS, DEFAULT_TRINITY_CONFIG } from './trinity-types.js';

/** Build task for a specific TRINITY role. */
export function buildRoleTask(baseTask: Task, role: TrinityRole, context: string): Task {
  const rolePrompt = TRINITY_ROLE_PROMPTS[role];
  const description = `${rolePrompt}\n\n---\n\nOriginal Task: ${baseTask.description}\n\n${context}`;
  return { id: `${baseTask.id}-${role}`, description, context: baseTask.context };
}

/** Extract named sections from text. */
export function extractSections(text: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = text.split('\n');
  let currentSection = '';
  let currentContent: string[] = [];

  for (const line of lines) {
    const sectionMatch = line.match(/^[-*#]*\s*([A-Za-z ]+):\s*(.*)$/);
    if (sectionMatch?.[1] !== undefined) {
      if (currentSection.length > 0) {
        sections[currentSection.toLowerCase()] = currentContent.join('\n').trim();
      }
      currentSection = sectionMatch[1];
      currentContent = sectionMatch[2] !== undefined ? [sectionMatch[2]] : [];
    } else if (currentSection.length > 0) {
      currentContent.push(line);
    }
  }

  if (currentSection.length > 0) {
    sections[currentSection.toLowerCase()] = currentContent.join('\n').trim();
  }

  return sections;
}

/** Extract list items from text. */
export function extractList(text: string): string[] {
  if (text.length === 0) return [];
  const items = text.match(/^[-*\d.]+\s+(.+)$/gm);
  if (items === null) return text.split('\n').filter((l) => l.trim().length > 0);
  return items.map((item) => item.replace(/^[-*\d.]+\s+/, '').trim());
}

/** Parse thinker output from agent response. */
export function parseThinkerOutput(output: string): ThinkerOutput {
  const sections = extractSections(output);
  return {
    problemAnalysis: sections['problem analysis'] ?? sections['analysis'] ?? output.slice(0, 500),
    approach: sections['approach'] ?? sections['plan'] ?? '',
    considerations: extractList(sections['considerations'] ?? ''),
    successCriteria: extractList(sections['success criteria'] ?? ''),
  };
}

/** Parse worker output from agent response. */
export function parseWorkerOutput(output: string): WorkerOutput {
  const sections = extractSections(output);
  return {
    implementation: sections['implementation'] ?? output,
    stepsCompleted: extractList(sections['steps completed'] ?? sections['steps'] ?? ''),
    deviations: extractList(sections['deviations'] ?? ''),
    questions: extractList(sections['questions'] ?? ''),
  };
}

/** Parse verifier output from agent response. */
export function parseVerifierOutput(output: string): VerifierOutput {
  const sections = extractSections(output);
  const verdictText = (sections['verdict'] ?? '').toLowerCase();
  const verdict = verdictText.includes('pass') ? 'pass' : 'fail';
  return {
    verdict,
    correctnessCheck: sections['correctness check'] ?? sections['correctness'] ?? '',
    qualityCheck: sections['quality check'] ?? sections['quality'] ?? '',
    issuesFound: extractList(sections['issues found'] ?? sections['issues'] ?? ''),
    recommendations: extractList(sections['recommendations'] ?? ''),
  };
}

/** Create default worker output. */
export function createDefaultWorkerOutput(): WorkerOutput {
  return { implementation: '', stepsCompleted: [], deviations: [], questions: [] };
}

/** Create default verifier output. */
export function createDefaultVerifierOutput(cancelled = false): VerifierOutput {
  return {
    verdict: 'fail',
    correctnessCheck: cancelled ? 'Cancelled' : '',
    qualityCheck: cancelled ? 'Cancelled' : '',
    issuesFound: cancelled ? ['Coordination cancelled'] : [],
    recommendations: [],
  };
}

/** Merge config with defaults. */
export function resolveConfig(config: TrinityConfig | undefined): ResolvedConfig {
  const d = DEFAULT_TRINITY_CONFIG;
  return {
    maxIterations: config?.maxIterations ?? d.maxIterations,
    timeoutMs: config?.timeoutMs ?? d.timeoutMs,
    includeHistory: config?.includeHistory ?? d.includeHistory,
  };
}
