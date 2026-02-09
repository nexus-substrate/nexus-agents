/**
 * nexus-agents/cli - Mode Detector
 *
 * Automatic detection of nexus-agents invocation mode based on
 * environment variables, TTY state, and explicit flags.
 *
 * (Source: Node.js 22.x TTY documentation)
 * (Source: MCP Protocol 2025-11-25 - client detection patterns)
 */

/**
 * Server mode for nexus-agents.
 * - server: MCP server only (responds to MCP client calls)
 * - orchestrator: CLI orchestrator (calls external CLIs like Gemini, Codex)
 * - mesh: Not yet implemented — reserved for future bidirectional mode
 */
export type ServerMode = 'server' | 'orchestrator' | 'mesh';

/**
 * Detection result with mode and reasoning.
 */
export interface ModeDetectionResult {
  /** The detected or explicit mode */
  readonly mode: ServerMode;
  /** Source of mode determination */
  readonly source: 'explicit' | 'auto';
  /** Human-readable reason for the detection */
  readonly reason: string;
  /** Detection time in milliseconds */
  readonly detectionTimeMs: number;
  /** Environment signals detected */
  readonly signals: DetectionSignals;
}

/**
 * Signals used for mode detection.
 */
export interface DetectionSignals {
  /** Whether stdin is a TTY (interactive terminal) */
  readonly stdinIsTty: boolean;
  /** Whether stdout is a TTY */
  readonly stdoutIsTty: boolean;
  /** MCP client name from environment, if present */
  readonly mcpClientName: string | undefined;
  /** Whether running in CI environment */
  readonly isCI: boolean;
  /** CI platform name, if detected */
  readonly ciPlatform: string | undefined;
  /** Whether running in a container */
  readonly isContainer: boolean;
}

/**
 * Options for mode detection.
 */
export interface DetectModeOptions {
  /** Explicit mode flag from CLI args (overrides auto-detection) */
  readonly explicitMode?: ServerMode | undefined;
  /** Override for stdin TTY check (for testing) */
  readonly stdinIsTty?: boolean | undefined;
  /** Override for stdout TTY check (for testing) */
  readonly stdoutIsTty?: boolean | undefined;
  /** Override for environment variables (for testing) */
  readonly env?: Record<string, string | undefined> | undefined;
}

/**
 * Known CI environment variables by platform.
 * (Source: Various CI platform documentation)
 */
const CI_ENVIRONMENT_VARS: ReadonlyArray<{ envVar: string; platform: string }> = [
  { envVar: 'CI', platform: 'generic' },
  { envVar: 'GITHUB_ACTIONS', platform: 'GitHub Actions' },
  { envVar: 'GITLAB_CI', platform: 'GitLab CI' },
  { envVar: 'CIRCLECI', platform: 'CircleCI' },
  { envVar: 'TRAVIS', platform: 'Travis CI' },
  { envVar: 'JENKINS_URL', platform: 'Jenkins' },
  { envVar: 'BUILDKITE', platform: 'Buildkite' },
  { envVar: 'DRONE', platform: 'Drone CI' },
  { envVar: 'AZURE_PIPELINES', platform: 'Azure Pipelines' },
  { envVar: 'TF_BUILD', platform: 'Azure Pipelines' },
  { envVar: 'TEAMCITY_VERSION', platform: 'TeamCity' },
  { envVar: 'BITBUCKET_BUILD_NUMBER', platform: 'Bitbucket Pipelines' },
];

/**
 * Container detection environment variables.
 */
const CONTAINER_INDICATORS = ['KUBERNETES_SERVICE_HOST', 'DOCKER_CONTAINER'] as const;

/**
 * Validates that a string is a valid ServerMode.
 *
 * @param value - Value to validate
 * @returns True if value is a valid ServerMode
 */
export function isValidServerMode(value: unknown): value is ServerMode {
  return value === 'server' || value === 'orchestrator' || value === 'mesh';
}

/**
 * Detects CI environment from environment variables.
 *
 * @param env - Environment variables to check
 * @returns CI detection result with platform name if detected
 */
function detectCIEnvironment(env: Record<string, string | undefined>): {
  isCI: boolean;
  platform: string | undefined;
} {
  for (const { envVar, platform } of CI_ENVIRONMENT_VARS) {
    const value = env[envVar];
    if (value !== undefined && value !== '' && value !== 'false') {
      return { isCI: true, platform };
    }
  }
  return { isCI: false, platform: undefined };
}

/**
 * Detects if running inside a container.
 *
 * @param env - Environment variables to check
 * @returns True if container environment detected
 */
function detectContainer(env: Record<string, string | undefined>): boolean {
  return CONTAINER_INDICATORS.some((indicator) => {
    const value = env[indicator];
    return value !== undefined && value !== '';
  });
}

/**
 * Checks if a stream is a TTY.
 * (Source: Node.js 22.x TTY documentation)
 *
 * @param stream - The stream to check
 * @returns True if the stream is a TTY
 */
function isTtyStream(stream: { isTTY?: boolean }): boolean {
  return stream.isTTY === true;
}

/**
 * Gathers all detection signals from the environment.
 *
 * @param options - Detection options with potential overrides
 * @returns Detection signals
 */
function gatherSignals(options: DetectModeOptions): DetectionSignals {
  const env = options.env ?? process.env;

  // TTY detection - process.stdin.isTTY is undefined when not a TTY
  const stdinIsTty = options.stdinIsTty ?? isTtyStream(process.stdin);
  const stdoutIsTty = options.stdoutIsTty ?? isTtyStream(process.stdout);

  // MCP client detection
  const mcpClientName = env['MCP_CLIENT_NAME'];

  // CI detection
  const ciResult = detectCIEnvironment(env);

  // Container detection
  const isContainer = detectContainer(env);

  return {
    stdinIsTty,
    stdoutIsTty,
    mcpClientName,
    isCI: ciResult.isCI,
    ciPlatform: ciResult.platform,
    isContainer,
  };
}

/**
 * Determines the mode based on gathered signals.
 *
 * Detection priority:
 * 1. MCP client detected -> server mode (we're being called by Claude/other MCP client)
 * 2. Non-interactive stdin -> server mode (piped input, likely MCP)
 * 3. CI environment -> orchestrator mode (we orchestrate other CLIs)
 * 4. Interactive terminal -> orchestrator mode (CLI orchestration)
 *
 * @param signals - Detection signals
 * @returns Mode and reason tuple
 */
function determineMode(signals: DetectionSignals): { mode: ServerMode; reason: string } {
  // Priority 1: MCP client explicitly identified
  if (signals.mcpClientName !== undefined && signals.mcpClientName !== '') {
    return {
      mode: 'server',
      reason: `MCP client detected: ${signals.mcpClientName}`,
    };
  }

  // Priority 2: Non-interactive stdin suggests MCP server usage
  if (!signals.stdinIsTty) {
    return {
      mode: 'server',
      reason: 'stdin is not a TTY (piped input detected)',
    };
  }

  // Priority 3: CI environment - orchestrate other CLIs
  if (signals.isCI) {
    const platformInfo = signals.ciPlatform !== undefined ? ` (${signals.ciPlatform})` : '';
    return {
      mode: 'orchestrator',
      reason: `CI environment detected${platformInfo}`,
    };
  }

  // Priority 4: Container without TTY likely CI/server context
  if (signals.isContainer && !signals.stdoutIsTty) {
    return {
      mode: 'orchestrator',
      reason: 'Container environment with non-interactive output',
    };
  }

  // Default: Interactive terminal gets orchestrator capabilities
  return {
    mode: 'orchestrator',
    reason: 'Interactive terminal detected (TTY)',
  };
}

/**
 * Detects the appropriate server mode for nexus-agents.
 *
 * Detection is fast (<100ms) and considers:
 * - Explicit --mode flag (highest priority)
 * - MCP_CLIENT_NAME environment variable
 * - stdin TTY state
 * - CI environment variables
 * - Container detection
 *
 * @param options - Optional detection configuration
 * @returns Detection result with mode, source, and reasoning
 *
 * @example
 * ```typescript
 * // Auto-detect mode
 * const result = detectMode();
 * console.log(`Mode: ${result.mode} (${result.reason})`);
 *
 * // With explicit override
 * const result = detectMode({ explicitMode: 'mesh' });
 * console.log(`Mode: ${result.mode} (${result.source})`);
 * ```
 */
export function detectMode(options: DetectModeOptions = {}): ModeDetectionResult {
  const startTime = performance.now();

  // Priority 1: Explicit mode flag always wins
  if (options.explicitMode !== undefined && isValidServerMode(options.explicitMode)) {
    const endTime = performance.now();
    return {
      mode: options.explicitMode,
      source: 'explicit',
      reason: `Explicit --mode=${options.explicitMode} flag provided`,
      detectionTimeMs: endTime - startTime,
      signals: gatherSignals(options),
    };
  }

  // Gather environment signals
  const signals = gatherSignals(options);

  // Determine mode from signals
  const { mode, reason } = determineMode(signals);

  const endTime = performance.now();

  return {
    mode,
    source: 'auto',
    reason,
    detectionTimeMs: endTime - startTime,
    signals,
  };
}

/**
 * Formats a mode detection result for logging.
 *
 * @param result - Detection result to format
 * @returns Formatted string for logging
 */
export function formatModeDetection(result: ModeDetectionResult): string {
  const parts: string[] = [
    `mode=${result.mode}`,
    `source=${result.source}`,
    `reason="${result.reason}"`,
    `time=${result.detectionTimeMs.toFixed(2)}ms`,
  ];

  return parts.join(' ');
}
