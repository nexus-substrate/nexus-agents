/**
 * `nexus-agents init --opencode <path>` setup helper (#2504, child 4 of #2500).
 *
 * Injects the nexus-agents MCP block + recommended environment into an
 * existing `opencode.json` without overwriting other operator-set keys.
 * Pairs with the existing `init --portable --mcp-config` (which targets
 * Claude Code's `.mcp.json`). Different harness, same merge-not-overwrite
 * pattern.
 *
 * Behaviour:
 *   - File exists → merge `mcp.nexus-agents` into the existing JSON.
 *     Preserve every other key the operator has set (provider config,
 *     model lists, theme, …). Idempotent: re-running produces the same
 *     final file.
 *   - File missing → write a minimal template with the nexus-agents MCP
 *     block + a stubbed `providers.openai-compat` shell the operator
 *     fills in (placeholder baseURL + `{env:WORKSPACE_PROXY_KEY}`).
 *   - `--dry-run` → print the diff (proposed vs existing) without writing.
 *   - `--validate` → after merge (or alongside dry-run), probe
 *     `providers.openai-compat.options.baseURL/v1/models` with the
 *     resolved apiKey, exit non-zero if unreachable.
 *
 * @module cli/init-opencode
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { createLogger } from '../core/index.js';

const logger = createLogger({ component: 'init-opencode' });

export interface InitOpencodeOptions {
  /** Absolute or relative path to opencode.json. */
  readonly path: string;
  /** Path to the nexus-agents CLI binary that the MCP block will spawn. */
  readonly cliPath: string;
  /** Sandbox flavor written to NEXUS_SANDBOX in the MCP environment. */
  readonly sandboxFlavor?: string;
  /** Print the diff without writing. */
  readonly dryRun?: boolean;
}

export interface InitOpencodeResult {
  readonly path: string;
  readonly action: 'created' | 'updated' | 'unchanged' | 'dry-run';
  readonly diff: string;
}

interface OpencodeMcpBlock {
  type: 'local';
  command: string[];
  enabled: boolean;
  environment: Record<string, string>;
}

interface OpencodeFile {
  $schema?: string;
  providers?: Record<string, unknown>;
  mcp?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Build the canonical nexus-agents MCP block. Mirrors what
 * `Dockerfile.sandbox` writes today plus the env vars from #2501 + #2503.
 */
export function buildNexusMcpBlock(opts: {
  readonly cliPath: string;
  readonly sandboxFlavor?: string;
  readonly opencodeConfigPath: string;
}): OpencodeMcpBlock {
  const env: Record<string, string> = {
    NEXUS_DATA_DIR: '{env:NEXUS_DATA_DIR}',
    NEXUS_OPENCODE_CONFIG: opts.opencodeConfigPath,
  };
  if (opts.sandboxFlavor !== undefined && opts.sandboxFlavor !== '') {
    env['NEXUS_SANDBOX'] = opts.sandboxFlavor;
  }
  return {
    type: 'local',
    command: ['node', opts.cliPath, '--mode=server'],
    enabled: true,
    environment: env,
  };
}

/**
 * Execute the merge. Pure with respect to `opts.dryRun: true` — no fs
 * writes. Returns the final-or-proposed JSON + a diff string suitable
 * for printing.
 */
export function runInitOpencode(opts: InitOpencodeOptions): InitOpencodeResult {
  const existing = readExisting(opts.path);
  const merged = mergeNexusBlock(existing, opts);
  const before = existing === null ? '' : `${JSON.stringify(existing, null, 2)}\n`;
  const after = `${JSON.stringify(merged, null, 2)}\n`;
  const diff = simpleDiff(before, after);

  if (opts.dryRun === true) {
    return { path: opts.path, action: 'dry-run', diff };
  }

  if (existing !== null && before === after) {
    return { path: opts.path, action: 'unchanged', diff };
  }

  writeFileSync(opts.path, after, 'utf8');
  return { path: opts.path, action: existing === null ? 'created' : 'updated', diff };
}

function readExisting(path: string): OpencodeFile | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('opencode.json root must be an object');
    }
    return parsed as OpencodeFile;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse opencode.json at ${path}: ${msg}`);
  }
}

function mergeNexusBlock(existing: OpencodeFile | null, opts: InitOpencodeOptions): OpencodeFile {
  const block = buildNexusMcpBlock({
    cliPath: opts.cliPath,
    ...(opts.sandboxFlavor !== undefined && { sandboxFlavor: opts.sandboxFlavor }),
    opencodeConfigPath: opts.path,
  });

  if (existing === null) {
    return {
      $schema: 'https://opencode.ai/config.json',
      providers: { 'openai-compat': stubOpenaiCompatProvider() },
      mcp: { 'nexus-agents': block },
    };
  }

  // Idempotent merge: preserve user-customised fields if they exist on the
  // current MCP block (e.g. `enabled: false`). Update anything else.
  const existingMcp: Record<string, unknown> = existing.mcp ?? {};
  const rawNexus = existingMcp['nexus-agents'];
  const existingNexus: Partial<OpencodeMcpBlock> =
    typeof rawNexus === 'object' && rawNexus !== null ? rawNexus : {};
  const mergedBlock: OpencodeMcpBlock = {
    type: 'local',
    command: block.command,
    enabled: existingNexus.enabled ?? block.enabled,
    environment: { ...block.environment, ...(existingNexus.environment ?? {}) },
  };

  return {
    ...existing,
    mcp: { ...existingMcp, 'nexus-agents': mergedBlock },
  };
}

/**
 * Stub for `providers.openai-compat`. Operators replace the placeholder
 * baseURL + key with their workspace-proxy values. Empty by design — we
 * never overwrite an existing provider block (see `mergeNexusBlock`).
 */
function stubOpenaiCompatProvider(): Record<string, unknown> {
  return {
    npm: '@ai-sdk/openai-compatible',
    options: {
      baseURL: '<replace with workspace proxy URL>',
      apiKey: '{env:WORKSPACE_PROXY_KEY}',
    },
  };
}

/**
 * Cheap line-based diff. Three-line context, +/- prefixes. Good enough
 * for an operator preview; not a unified-diff replacement.
 */
function simpleDiff(before: string, after: string): string {
  if (before === after) return '(no changes)';
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  const out: string[] = [];
  const max = Math.max(beforeLines.length, afterLines.length);
  for (let i = 0; i < max; i += 1) {
    const b = beforeLines[i];
    const a = afterLines[i];
    if (b === a) {
      out.push(`  ${b ?? ''}`);
    } else {
      if (b !== undefined) out.push(`- ${b}`);
      if (a !== undefined) out.push(`+ ${a}`);
    }
  }
  return out.join('\n');
}

export function ensureOpencodeDirExists(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    throw new Error(
      `Parent directory does not exist: ${dir}. Create it first or pass a path under an existing dir.`
    );
  }
  logger.debug('opencode.json target directory exists', { dir });
}
