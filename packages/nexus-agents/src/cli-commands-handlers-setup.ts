/**
 * nexus-agents CLI Command Handlers - Init / Setup
 *
 * The `init` and `setup` handlers and the private helpers reachable only
 * from them, extracted from cli-commands-handlers.ts (#6148, panel option B)
 * to bring that file back inside the 600-line ceiling in .rules/governance.md.
 * Same sibling convention as cli-commands-handlers-complex.ts.
 *
 * @module cli-commands-handlers-setup
 */

import { setupCommand, setupCommandAsync } from './cli/index.js';
import { initPortable, formatInitPortableMessage } from './cli/init-portable.js';
import {
  EXIT_CODES,
  cliExit,
  cliExitFromStatus,
  type CliExitResult,
  type ParsedCliArgs,
} from './cli-types.js';

/**
 * Validates init flag combinations. Returns a failing {@link CliExitResult}
 * when a problem is found (caller propagates it to the dispatcher), or
 * `undefined` when the flags are valid.
 */
function validateInitFlags(args: ParsedCliArgs): CliExitResult | undefined {
  const hasPortable = args.options.portable === true;
  const hasOpencode = args.options.opencode !== undefined && args.options.opencode !== '';
  if (!hasPortable && !hasOpencode) {
    process.stderr.write(
      'Usage: nexus-agents init --portable [path] [--force] [--dry-run]\n' +
        '                            [--gitignore] [--mcp-config]\n' +
        '                            [--install | --uninstall]\n' +
        '       nexus-agents init --opencode <path-to-opencode.json>\n' +
        '                            [--dry-run] [--validate]\n' +
        'Bootstraps a workspace-local nexus-agents data directory or merges\n' +
        'the nexus-agents MCP block into an existing opencode.json.\n'
    );
    return cliExit(EXIT_CODES.INVALID_ARGS);
  }
  if (hasPortable && hasOpencode) {
    process.stderr.write('Error: --portable and --opencode are mutually exclusive entry modes.\n');
    return cliExit(EXIT_CODES.INVALID_ARGS);
  }
  if (args.options.install === true && args.options.uninstall === true) {
    process.stderr.write('Error: --install and --uninstall are mutually exclusive.\n');
    return cliExit(EXIT_CODES.INVALID_ARGS);
  }
  return undefined;
}

/**
 * Handles `nexus-agents init --portable` (#2305 / #2308 / #2311) or
 * `nexus-agents init --opencode <path>` (#2504).
 *
 * Async because `--install` may spawn `npm install`. When neither
 * `--install` nor `--uninstall` is set, no subprocess is spawned.
 */
export async function handleInitCommand(args: ParsedCliArgs): Promise<CliExitResult> {
  const flagError = validateInitFlags(args);
  if (flagError !== undefined) {
    return flagError;
  }
  if (args.options.opencode !== undefined && args.options.opencode !== '') {
    return runInitOpencodeFlow(args);
  }
  return runInitPortableFlow(args);
}

/** Runs the `init --portable` path and renders its outcome (#2305/#2308/#2311). */
async function runInitPortableFlow(args: ParsedCliArgs): Promise<CliExitResult> {
  const targetPath = args.positionals[1]; // [0] is "init"
  const result = await initPortable({
    ...(targetPath !== undefined && targetPath !== '' ? { path: targetPath } : {}),
    force: args.options.force,
    dryRun: args.options.dryRun,
    gitignore: args.options.gitignore ?? false,
    mcpConfig: args.options.mcpConfig ?? false,
    install: args.options.install ?? false,
    uninstall: args.options.uninstall ?? false,
  });
  process.stdout.write(formatInitPortableMessage(result, args.options.dryRun));
  return cliExit(result.success ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
}

async function runInitOpencodeFlow(args: ParsedCliArgs): Promise<CliExitResult> {
  const { runInitOpencode } = await import('./cli/init-opencode.js');
  const opencodePath = args.options.opencode;
  if (opencodePath === undefined || opencodePath === '') {
    process.stderr.write('Error: --opencode requires a path argument.\n');
    return cliExit(EXIT_CODES.INVALID_ARGS);
  }
  // The CLI binary path the MCP block will spawn — defaults to the running
  // binary so the resulting opencode.json points at this install. Operators
  // can override post-init by hand-editing the file.
  const cliPath = process.argv[1] ?? 'nexus-agents';
  const sandboxFlavor = process.env['NEXUS_SANDBOX'];
  const result = runInitOpencode({
    path: opencodePath,
    cliPath,
    ...(sandboxFlavor !== undefined && sandboxFlavor !== '' && { sandboxFlavor }),
    dryRun: args.options.dryRun,
  });
  process.stdout.write(`init --opencode ${result.action} ${result.path}\n`);
  if (args.options.dryRun || result.action !== 'unchanged') {
    process.stdout.write(`${result.diff}\n`);
  }

  if (args.options.validate === true) {
    return cliExit(await renderOpencodeValidate(opencodePath));
  }
  return cliExit(EXIT_CODES.SUCCESS);
}

/**
 * Run --validate via the helper in cli/init-opencode and render the
 * outcome to stdout/stderr. Returns the exit code (0 success, 1 fail).
 */
async function renderOpencodeValidate(opencodePath: string): Promise<number> {
  const { runOpencodeValidate } = await import('./cli/init-opencode.js');
  const result = await runOpencodeValidate(opencodePath);
  if (!result.ok) {
    process.stderr.write(`init --opencode --validate: ${result.reason ?? 'failed'}\n`);
    return 1;
  }
  process.stdout.write(
    `init --opencode --validate: ${String(result.models?.length ?? 0)} model(s) discovered at ${result.baseURL ?? '(unknown)'}:\n`
  );
  for (const id of result.models ?? []) {
    process.stdout.write(`  - ${id}\n`);
  }
  return 0;
}

/**
 * Handles setup command for Claude CLI integration (sync version).
 * (Source: Issue #363 - Auto-configure Claude CLI integration)
 * (Source: Issue #416 - Setup command hook configuration)
 */
export function handleSetupCommand(args: ParsedCliArgs): CliExitResult {
  const exitCode = setupCommand({
    nonInteractive: args.options.nonInteractive,
    force: args.options.force,
    skipMcp: args.options.skipMcp,
    skipRules: args.options.skipRules,
    skipHooks: args.options.skipHooks,
    skipConfig: args.options.skipConfig,
    skipOpencode: args.options.skipOpencode,
    skipGemini: args.options.skipGemini,
    skipCodex: args.options.skipCodex,
    dryRun: args.options.dryRun,
    verbose: args.options.verbose,
    scope: args.options.scope === 'project' ? 'project' : 'user',
  });
  return cliExitFromStatus(exitCode);
}

/**
 * Handles setup command with interactive wizard support (async version).
 * (Source: Issue #425 - Interactive setup wizard)
 *
 * #2124: when `--custom-api <url>` is set, short-circuits the normal flow
 * and just configures the custom gateway (URL validation + probe + shell
 * fragment). Rationale: normal setup configures Claude/OpenCode/Codex
 * MCP hookup; custom-api is orthogonal — the user has a gateway they
 * want to plug in, not a harness they want to wire up.
 */
export async function handleSetupCommandAsync(args: ParsedCliArgs): Promise<CliExitResult> {
  if (args.options.customApi !== undefined && args.options.customApi !== '') {
    return cliExit(await runCustomApiSetup(args));
  }
  const exitCode = await setupCommandAsync({
    interactive: args.options.interactive,
    nonInteractive: args.options.nonInteractive,
    force: args.options.force,
    skipMcp: args.options.skipMcp,
    skipRules: args.options.skipRules,
    skipHooks: args.options.skipHooks,
    skipConfig: args.options.skipConfig,
    skipOpencode: args.options.skipOpencode,
    skipGemini: args.options.skipGemini,
    skipCodex: args.options.skipCodex,
    dryRun: args.options.dryRun,
    verbose: args.options.verbose,
    scope: args.options.scope === 'project' ? 'project' : 'user',
  });
  return cliExitFromStatus(exitCode);
}

/** Wrapper for `setup --custom-api` (#2124). */
async function runCustomApiSetup(args: ParsedCliArgs): Promise<number> {
  const { configureCustomApi } = await import('./cli/setup-custom-api.js');
  const baseUrl = args.options.customApi;
  if (baseUrl === undefined) return EXIT_CODES.SERVER_START_FAILED;
  const input: Parameters<typeof configureCustomApi>[0] = {
    baseUrl,
    nonInteractive: args.options.nonInteractive,
    ...(args.options.customApiKey !== undefined ? { apiKey: args.options.customApiKey } : {}),
    ...(args.options.customModel !== undefined ? { model: args.options.customModel } : {}),
  };
  const result = await configureCustomApi(input);
  if (!result.ok) {
    process.stderr.write(`✗ ${result.error.message}\n`);
    return EXIT_CODES.SERVER_START_FAILED;
  }
  const { baseUrl: canonical, model, probeSucceeded, shellFragment } = result.value;
  process.stdout.write(`✓ Gateway validated: ${canonical}\n`);
  process.stdout.write(`✓ Model: ${model}\n`);
  if (probeSucceeded) process.stdout.write(`✓ Probe succeeded (GET /models → 2xx)\n`);
  process.stdout.write('\nAdd the following to your shell rc (~/.bashrc, ~/.zshrc, etc.):\n\n');
  process.stdout.write(shellFragment);
  return EXIT_CODES.SUCCESS;
}
