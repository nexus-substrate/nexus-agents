/**
 * nexus-agents/cli-adapters - Codex CLI Adapter
 *
 * Subprocess-based adapter for Codex CLI.
 * Extends SubprocessCliAdapter to reuse retry logic, health checks,
 * version detection, and capacity tracking.
 *
 * (Source: cli-project_plan.md v2.1.0)
 * (Source: Issue #1140 — Migrated to SubprocessCliAdapter base class)
 *
 * SECURITY: All spawn() calls use array-based args without shell: true.
 * User task content is passed as a single argv element (no shell interpolation).
 */

import { writeFileSync, rmSync } from 'node:fs';
import { nexusMkdtempSync } from '../../config/nexus-tmp-dir.js';
import { join } from 'node:path';
import type {
  ICliResponseParser,
  CliTask,
  ModelInfo,
  CliName,
  BaseAdapterOptions,
} from '../types.js';
import { SubprocessCliAdapter, type CommandConfig } from '../subprocess-adapter.js';
import { CodexResponseParser } from '../parsers/codex-parser.js';
import type { CliModelInfo } from '../types-capability.js';
import { listModelsForCli } from '../../config/models-dev-by-vendor.js';
import { CODEX_LEGACY_DEFAULTS, toCodexModelSlug } from './codex-adapter-helpers.js';
import {
  getDefaultModelForCli,
  getCliModelName,
  buildModelInfo,
} from '../../config/model-config-helpers.js';

// Re-export CLI-specific helpers for backward compatibility
export { createCodexError, normalizeCodexResponse, delay } from './codex-adapter-helpers.js';

/**
 * Codex CLI adapter using subprocess transport.
 *
 * Extends SubprocessCliAdapter which provides:
 * - Retry logic with exponential backoff
 * - Health checks with version compatibility
 * - Capacity tracking
 * - Subprocess spawn with timeout handling
 */
export class CodexCliAdapter extends SubprocessCliAdapter {
  readonly name: CliName = 'codex';
  protected readonly parser: ICliResponseParser = new CodexResponseParser();

  private readonly model: string;

  constructor(options?: BaseAdapterOptions) {
    super(options?.logger);
    this.model = options?.model ?? getCliModelName(getDefaultModelForCli('codex'));
  }

  /** Key-free model enumeration via the models.dev snapshot (#3405). */
  listModels(): Promise<readonly CliModelInfo[]> {
    return Promise.resolve(listModelsForCli(this.name));
  }

  /**
   * Gets Codex model information.
   * Resolves from canonical registry when possible, falls back to legacy lookup.
   */
  getModelInfo(): ModelInfo {
    const fromRegistry = buildModelInfo('codex', this.model);
    if (fromRegistry !== undefined) return fromRegistry;
    return {
      id: this.model,
      name: CODEX_LEGACY_DEFAULTS.displayNames[this.model] ?? this.model,
      contextWindow: CODEX_LEGACY_DEFAULTS.contextWindow,
      maxOutput: CODEX_LEGACY_DEFAULTS.maxOutput,
      costPerMillionInput:
        CODEX_LEGACY_DEFAULTS.inputCosts[this.model] ?? CODEX_LEGACY_DEFAULTS.inputCost,
      costPerMillionOutput:
        CODEX_LEGACY_DEFAULTS.outputCosts[this.model] ?? CODEX_LEGACY_DEFAULTS.outputCost,
    };
  }

  /**
   * Gets CLI command and arguments for execution.
   * Task content is passed as a positional argument (not via stdin).
   */
  protected getCommand(task: CliTask): CommandConfig {
    const args: string[] = ['exec'];

    // Add JSON output
    args.push('--json');

    // Add model only if specified (use CLI default otherwise). task.model is
    // the canonical registry id, which codex rejects — translate it (#5091).
    const model = task.model ?? this.model;
    if (model !== '') {
      args.push('-m', toCodexModelSlug(model, this.logger));
    }

    // Add sandbox mode for safety (read-only by default)
    args.push('-s', 'read-only');

    // Skip git repo check for standalone prompts
    args.push('--skip-git-repo-check');

    // Honor systemPrompt via codex's `model_instructions_file` config key
    // (per openai/codex#11588 — closed with this workaround). We materialize
    // the prompt into a tempfile, pass it via `-c`, and clean up on exit.
    let cleanup: (() => void) | undefined;
    if (task.systemPrompt !== undefined && task.systemPrompt !== '') {
      const dir = nexusMkdtempSync('nexus-codex-sysprompt-');
      const file = join(dir, 'instructions.md');
      writeFileSync(file, task.systemPrompt, { encoding: 'utf8', mode: 0o600 });
      args.push('-c', `model_instructions_file=${file}`);
      cleanup = (): void => {
        // Recursive rm so we drop the parent tempdir, not just the file
        // inside it. Pre-fix every codex call with a systemPrompt leaked
        // one empty `/tmp/nexus-codex-sysprompt-XXXXXX` dir until the OS
        // reaper ran — exhausting inodes on long-running MCP daemons.
        try {
          rmSync(dir, { recursive: true, force: true });
        } catch {
          // best-effort; tempdir auto-cleanup will eventually reap it
        }
      };
    }

    // Add the task content (no JSON.stringify needed without shell: true)
    args.push(task.content);

    return cleanup === undefined ? { command: 'codex', args } : { command: 'codex', args, cleanup };
  }
}
