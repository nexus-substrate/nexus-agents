/**
 * nexus-agents config init command
 *
 * Generates a starter configuration file with sensible defaults.
 *
 * (Source: Issue #65, PROJECT_PLAN.md Section 5.2)
 */

import { existsSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { getErrorMessage } from '../core/index.js';
import { colors } from './ansi-output.js';
import { getInTreeCapabilitiesMatrix } from '../config/model-config-helpers.js';
import type { ModelCapability } from '../config/model-capabilities-types.js';

/**
 * Config init options.
 */
export interface ConfigInitOptions {
  /** Output file path */
  readonly output?: string;
  /** Force overwrite existing file */
  readonly force?: boolean;
}

/**
 * Result of config init operation.
 */
export interface ConfigInitResult {
  readonly success: boolean;
  readonly path: string;
  readonly message: string;
  readonly created: boolean;
}

/** Default configuration file name. */
const DEFAULT_CONFIG_FILE = 'nexus-agents.yaml';

/**
 * Path `config init` writes new configs to (epic #2872). The config loader
 * checks `.nexus-agents/nexus-agents.yaml` ahead of the legacy root-level
 * location, so writing here is forward-compatible. If a legacy root-level
 * config already exists, we keep editing it in place rather than silently
 * moving the user's file — see `resolveOutputPath()` for the precedence.
 */
const DEFAULT_CONFIG_REL_PATH = `.nexus-agents/${DEFAULT_CONFIG_FILE}`;

/**
 * Bucket models into fast / balanced / powerful tiers using the canonical
 * registry's quality scores. #2438: prior versions of this template
 * hardcoded model IDs (claude-sonnet-4, gpt-4o, o1-pro) that aren't in the
 * registry — config init produced a YAML that immediately failed to route.
 *
 * Now we derive the lists at template-generation time from the
 * canonical registry (via `getInTreeCapabilitiesMatrix()`), so
 * updates to the registry flow into `config init` automatically.
 *
 * Tier picks per provider (limit one per provider per tier to keep the
 * starter YAML readable):
 *   - fast      — speed ≥ 9 OR cost ≥ 9
 *   - powerful  — reasoning ≥ 9
 *   - balanced  — everything else with usable quality
 */
/** True when this model is a candidate for the powerful tier. */
function qualifiesPowerful(m: ModelCapability): boolean {
  return (m.qualityScores?.reasoning ?? 0) >= 9;
}

/** True when this model is a candidate for the fast tier. */
function qualifiesFast(m: ModelCapability): boolean {
  const q = m.qualityScores;
  if (q === undefined) return false;
  return q.speed >= 9 || q.cost >= 9;
}

/** True when this model qualifies for any balanced bucket. */
function qualifiesBalanced(m: ModelCapability): boolean {
  return (m.qualityScores?.reasoning ?? 0) >= 7;
}

function bucketModels(): { fast: string[]; balanced: string[]; powerful: string[] } {
  const all = getInTreeCapabilitiesMatrix().models;
  const seenProvider = new Set<string>();
  const sortedByReasoning = [...all].sort(
    (a, b) => (b.qualityScores?.reasoning ?? 0) - (a.qualityScores?.reasoning ?? 0)
  );

  const powerful = pickOnePerProvider(
    sortedByReasoning,
    'powerful',
    qualifiesPowerful,
    seenProvider
  );
  const fast = pickOnePerProvider(all, 'fast', qualifiesFast, seenProvider);
  const balanced = pickOnePerProvider(
    all,
    'balanced',
    (m) => qualifiesBalanced(m) && !powerful.includes(m.id) && !fast.includes(m.id),
    seenProvider
  );
  return { fast, balanced, powerful };
}

function pickOnePerProvider(
  models: readonly ModelCapability[],
  tier: string,
  qualifies: (m: ModelCapability) => boolean,
  seenProvider: Set<string>
): string[] {
  const out: string[] = [];
  for (const m of models) {
    const key = `${tier}:${m.provider}`;
    if (qualifies(m) && !seenProvider.has(key)) {
      out.push(m.id);
      seenProvider.add(key);
    }
  }
  return out;
}

/** Pick the doc-quality default model: highest-reasoning model overall. */
function pickDefaultModel(): string {
  const sorted = [...getInTreeCapabilitiesMatrix().models].sort(
    (a, b) => (b.qualityScores?.reasoning ?? 0) - (a.qualityScores?.reasoning ?? 0)
  );
  // Prefer claude-sonnet over claude-opus as default — opus is overkill for
  // general-purpose, sonnet is the recommended balance per CLAUDE.md.
  const sonnet = sorted.find((m: ModelCapability) => m.id === 'claude-sonnet');
  return sonnet?.id ?? sorted[0]?.id ?? 'claude-sonnet';
}

function renderTierLines(ids: readonly string[]): string {
  if (ids.length === 0) return '      # (no models matched this tier in the canonical registry)';
  return ids.map((id) => `      - ${id}`).join('\n');
}

/**
 * Generated YAML configuration template with comments. Built at call time
 * from the canonical model registry — see #2438. The previous hardcoded
 * names (`claude-sonnet-4`, `gpt-4o`, `o1-pro`, `gemini-ultra`) didn't
 * exist in the registry, so the generated YAML couldn't route.
 */
function renderConfigTemplate(): string {
  const buckets = bucketModels();
  const defaultModel = pickDefaultModel();
  const head = `# Nexus Agents Configuration
# Generated by: nexus-agents config init
# Documentation: https://github.com/nexus-substrate/nexus-agents
#
# Model identifiers below are derived from the canonical registry at
# config/in-tree-data.ts. Update there to change defaults; this
# template is regenerated each time config init runs.

# Model configuration
models:
  # Default model for general tasks
  default: ${defaultModel}

  # Model tiers for capability-matched routing
  tiers:
    # Fast: Quick responses, lower cost
    fast:
${renderTierLines(buckets.fast)}

    # Balanced: Good quality and speed (recommended for most tasks)
    balanced:
${renderTierLines(buckets.balanced)}

    # Powerful: Complex reasoning, highest quality
    powerful:
${renderTierLines(buckets.powerful)}`;
  return head;
}

/** Static template suffix that doesn't depend on the registry. */
const CONFIG_TEMPLATE_TAIL = `

  # Provider-specific configuration (optional)
  # providers:
  #   anthropic:
  #     timeout: 60000
  #     maxRetries: 3
  #   openai:
  #     timeout: 30000
  #     maxRetries: 2

# Expert configuration
experts:
  # Enable built-in experts (code, architecture, security, docs, testing)
  builtin: true

  # Custom expert definitions (optional)
  # custom:
  #   rust_expert:
  #     prompt: |
  #       You are a Rust expert specializing in systems programming,
  #       memory safety, and high-performance code.
  #     tier: powerful
  #     temperature: 0.2
  #
  #   api_expert:
  #     prompt: |
  #       You are an API design expert focusing on REST, GraphQL,
  #       and API security best practices.
  #     tier: balanced
  #     temperature: 0.3

# Workflow configuration
workflows:
  # Directory containing workflow templates
  templatesDir: ./workflows

  # Maximum execution time per workflow (ms)
  timeout: 300000

  # Maximum parallel steps
  maxParallel: 5

# Security configuration
security:
  # Allowed file system paths
  allowedPaths:
    - ./

  # Blocked file patterns (glob)
  blockedPatterns:
    - "**/.env*"
    - "**/credentials*"
    - "**/*.pem"
    - "**/*.key"

  # Rate limiting
  rateLimit:
    enabled: true
    requestsPerMinute: 60

  # Tamper-evident audit chain. The schema only applies its \`enabled: true\`
  # default when this block is present, so it is written out explicitly (#5632).
  audit:
    enabled: true
    enableHashChain: true

  # Path to secrets file (optional)
  # secretsFile: ./.nexus-secrets.yaml

# Gateway middleware configuration (Issue #896, #897)
# gateway:
#   enabled: true
#   # Per-tool tier overrides (DIRECT, ANALYZED, or ORCHESTRATED)
#   tierOverrides:
#     memory_query: DIRECT
#     delegate_to_model: ANALYZED
#     orchestrate: ORCHESTRATED

# Logging configuration
logging:
  # Log level: debug, info, warn, error
  level: info

  # Output format: json, pretty
  format: json

  # Destination: stdout, stderr, file
  # NOTE: stdout is unsafe when running as an MCP stdio server (corrupts
  # JSON-RPC frames). Keep stderr unless you have a specific need.
  destination: stderr

  # Log file path (required if destination is 'file')
  # filePath: ./logs/nexus-agents.log
`;

/**
 * Resolves the output path for the configuration file.
 */
function resolveOutputPath(output?: string): string {
  if (output !== undefined && output !== '') {
    return resolve(process.cwd(), output);
  }
  // Honor a pre-existing legacy root-level config — don't silently move it.
  // New installs land in the dotdir. See epic #2872 / issue #2877.
  const legacyPath = resolve(process.cwd(), DEFAULT_CONFIG_FILE);
  if (existsSync(legacyPath)) {
    return legacyPath;
  }
  return resolve(process.cwd(), DEFAULT_CONFIG_REL_PATH);
}

/**
 * Checks if a file exists at the given path.
 */
function fileExists(path: string): boolean {
  return existsSync(path);
}

/**
 * Ensures the parent directory exists.
 */
async function ensureDirectory(filePath: string): Promise<void> {
  const dir = dirname(filePath);
  if (dir !== '.' && !existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

/**
 * Writes the configuration file.
 */
async function writeConfigFile(path: string): Promise<void> {
  await ensureDirectory(path);
  await writeFile(path, renderConfigTemplate() + CONFIG_TEMPLATE_TAIL, 'utf-8');
}

/**
 * Runs the config init command.
 *
 * @param options - Config init options
 * @returns Result of the operation
 */
export async function runConfigInit(options: ConfigInitOptions = {}): Promise<ConfigInitResult> {
  const outputPath = resolveOutputPath(options.output);

  // Check if file already exists
  if (fileExists(outputPath) && options.force !== true) {
    return {
      success: false,
      path: outputPath,
      message: `File already exists: ${outputPath}. Use --force to overwrite.`,
      created: false,
    };
  }

  try {
    await writeConfigFile(outputPath);

    return {
      success: true,
      path: outputPath,
      message: `Configuration file created: ${outputPath}`,
      created: true,
    };
  } catch (error) {
    const message = getErrorMessage(error);
    return {
      success: false,
      path: outputPath,
      message: `Failed to create configuration file: ${message}`,
      created: false,
    };
  }
}

/**
 * Prints the result of config init.
 */
export function printConfigInitResult(result: ConfigInitResult): void {
  const writeLine = (text: string): void => {
    process.stdout.write(text + '\n');
  };

  writeLine('');

  if (result.success) {
    writeLine(`${colors.green}${colors.bold}Configuration created successfully!${colors.reset}`);
    writeLine('');
    writeLine(`  ${colors.cyan}Path:${colors.reset} ${result.path}`);
    writeLine('');
    writeLine(`${colors.dim}Next steps:${colors.reset}`);
    writeLine(`  1. Edit the configuration file to customize settings`);
    writeLine(`  2. Run ${colors.cyan}nexus-agents${colors.reset} to start the MCP server`);
    writeLine(`  3. Or run ${colors.cyan}nexus-agents doctor${colors.reset} to verify setup`);
  } else {
    writeLine(`${colors.red}${colors.bold}Configuration creation failed${colors.reset}`);
    writeLine('');
    writeLine(`  ${colors.red}Error:${colors.reset} ${result.message}`);
  }

  writeLine('');
}

/**
 * Runs the config init command and prints results.
 * Returns exit code (0 = success, 1 = error).
 */
export async function configInitCommand(options: ConfigInitOptions = {}): Promise<number> {
  const result = await runConfigInit(options);
  printConfigInitResult(result);
  return result.success ? 0 : 1;
}
