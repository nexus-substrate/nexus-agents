/**
 * nexus-agents setup interactive wizard
 *
 * Guided setup experience for configuring nexus-agents with Claude CLI.
 * Uses Node.js readline for terminal prompts without external dependencies.
 *
 * @module cli/setup-wizard
 * (Source: Issue #425 - Interactive setup wizard)
 */

import { createInterface, type Interface } from 'node:readline';
import { formatHeader, formatStatus, isInteractive } from './setup-formatting.js';
import type { SetupOptions } from './setup-types.js';

// ============================================================================
// Types
// ============================================================================

/** Usage mode selection. */
export type UsageMode = 'claude-desktop' | 'claude-cli' | 'standalone' | 'all';

/** Wizard answers collected from user. */
export interface WizardAnswers {
  usageMode: UsageMode;
  hasApiKeys: boolean;
  configDirectory: string;
  confirmProceed: boolean;
}

/** Wizard state during execution. */
interface WizardState {
  currentStep: number;
  totalSteps: number;
  answers: Partial<WizardAnswers>;
}

// ============================================================================
// Readline Helpers
// ============================================================================

/**
 * Creates a readline interface for prompting.
 */
function createReadline(): Interface {
  return createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Prompts for input and returns the answer.
 */
async function promptInput(rl: Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Prompts for a yes/no confirmation.
 */
async function promptConfirm(
  rl: Interface,
  question: string,
  defaultValue = true
): Promise<boolean> {
  const defaultHint = defaultValue ? '[Y/n]' : '[y/N]';
  const answer = await promptInput(rl, `${question} ${defaultHint}: `);

  if (answer === '') return defaultValue;
  return answer.toLowerCase().startsWith('y');
}

/**
 * Prints options for selection prompt.
 */
function printOptions(
  options: readonly { value: string; label: string }[],
  defaultIndex: number
): void {
  for (let i = 0; i < options.length; i++) {
    const option = options[i];
    const marker = i === defaultIndex ? '>' : ' ';
    const label = option?.label ?? '';
    writeLine(`  ${marker} ${String(i + 1)}. ${label}`);
  }
}

/**
 * Gets value from options at index with fallback.
 */
function getOptionValue(
  options: readonly { value: string; label: string }[],
  index: number,
  fallbackIndex: number
): string {
  const option = options[index];
  if (option !== undefined) {
    return option.value;
  }
  const fallback = options[fallbackIndex];
  return fallback?.value ?? '';
}

/**
 * Prompts for a selection from a list of options.
 */
async function promptSelect(
  rl: Interface,
  question: string,
  options: readonly { value: string; label: string }[],
  defaultIndex = 0
): Promise<string> {
  writeLine('\n' + question);
  printOptions(options, defaultIndex);

  const answer = await promptInput(rl, `\nChoice [1-${String(options.length)}]: `);

  if (answer === '') {
    return getOptionValue(options, defaultIndex, 0);
  }

  const index = parseInt(answer, 10) - 1;
  if (index >= 0 && index < options.length) {
    return getOptionValue(options, index, 0);
  }

  return getOptionValue(options, defaultIndex, 0);
}

// ============================================================================
// Output Helpers
// ============================================================================

/** Writes a line to stdout. */
function writeLine(text: string): void {
  process.stdout.write(text + '\n');
}

/** Writes an empty line. */
function writeEmptyLine(): void {
  process.stdout.write('\n');
}

/** Prints the wizard header. */
function printWizardHeader(): void {
  writeEmptyLine();
  writeLine(formatHeader('Nexus Agents Setup Wizard'));
  writeLine('='.repeat(40));
  writeLine('This wizard will help you configure nexus-agents.');
  writeEmptyLine();
}

/** Prints step progress. */
function printStepProgress(state: WizardState, stepName: string): void {
  writeLine(
    `\n${formatHeader(`Step ${String(state.currentStep)}/${String(state.totalSteps)}: ${stepName}`)}`
  );
  writeLine('-'.repeat(40));
}

/** Prints completion message. */
function printCompletion(): void {
  writeEmptyLine();
  writeLine(formatStatus('success') + ' Wizard completed! Running setup...');
  writeEmptyLine();
}

// ============================================================================
// Wizard Steps
// ============================================================================

/** Usage mode options. */
const USAGE_MODE_OPTIONS: readonly { value: UsageMode; label: string }[] = [
  { value: 'claude-cli', label: 'Claude CLI (terminal-based development)' },
  { value: 'claude-desktop', label: 'Claude Desktop (GUI application)' },
  { value: 'standalone', label: 'Standalone CLI (without Claude integration)' },
  { value: 'all', label: 'All of the above' },
];

/**
 * Step 1: Ask how the user plans to use nexus-agents.
 */
async function askUsageMode(rl: Interface, state: WizardState): Promise<UsageMode> {
  printStepProgress(state, 'Usage Mode');
  writeLine('How will you use nexus-agents?');

  const answer = await promptSelect(rl, '', USAGE_MODE_OPTIONS, 0);

  return answer as UsageMode;
}

/**
 * Step 2: Ask about API key configuration.
 */
async function askApiKeys(rl: Interface, state: WizardState): Promise<boolean> {
  printStepProgress(state, 'API Keys');
  writeLine('nexus-agents works best with API keys configured.');
  writeLine('Supported providers: Anthropic (Claude), OpenAI, Google (Gemini)');
  writeEmptyLine();

  const hasKeys = await promptConfirm(rl, 'Do you have at least one API key configured?', false);

  if (!hasKeys) {
    writeEmptyLine();
    writeLine('No worries! You can configure API keys later:');
    writeLine('  - ANTHROPIC_API_KEY for Claude');
    writeLine('  - OPENAI_API_KEY for OpenAI/Codex');
    writeLine('  - GOOGLE_AI_API_KEY for Gemini');
    writeLine('\nRun `nexus-agents doctor` to check your configuration.');
  }

  return hasKeys;
}

/**
 * Step 3: Ask about configuration directory.
 */
async function askConfigDirectory(rl: Interface, state: WizardState): Promise<string> {
  printStepProgress(state, 'Configuration');
  writeLine('Where should nexus-agents store its configuration?');
  writeEmptyLine();

  const defaultDir = process.cwd();
  const answer = await promptInput(rl, `Directory [${defaultDir}]: `);

  return answer || defaultDir;
}

/**
 * Step 4: Confirm and proceed.
 */
async function askConfirmation(
  rl: Interface,
  state: WizardState,
  answers: Partial<WizardAnswers>
): Promise<boolean> {
  printStepProgress(state, 'Confirmation');
  writeLine('Setup will configure the following:');
  writeEmptyLine();

  const modeLabel =
    USAGE_MODE_OPTIONS.find((o) => o.value === answers.usageMode)?.label ?? 'Unknown';
  const apiKeyStatus = answers.hasApiKeys === true ? 'Configured' : 'Not yet configured';
  const configDir = answers.configDirectory ?? process.cwd();
  writeLine(`  Usage mode: ${modeLabel}`);
  writeLine(`  API keys: ${apiKeyStatus}`);
  writeLine(`  Config directory: ${configDir}`);
  writeEmptyLine();

  const skipMcp = answers.usageMode === 'standalone';
  if (!skipMcp) {
    writeLine('Will configure:');
    writeLine('  - MCP server for Claude integration');
    writeLine('  - Rules file (.rules/nexus-agents.md)');
    writeLine('  - Hooks for session tracking');
  } else {
    writeLine('Will configure:');
    writeLine('  - Rules file (.rules/nexus-agents.md)');
    writeLine('  - (Skipping MCP/hooks - not needed for standalone mode)');
  }

  writeEmptyLine();
  return promptConfirm(rl, 'Proceed with setup?', true);
}

// ============================================================================
// Wizard Runner
// ============================================================================

/**
 * Runs the interactive setup wizard.
 *
 * @returns Setup options based on wizard answers, or undefined if cancelled
 */
export async function runWizard(): Promise<Partial<SetupOptions> | undefined> {
  // Check if interactive mode is available
  if (!isInteractive()) {
    writeLine('Interactive mode not available (TTY required).');
    writeLine('Use --non-interactive flag for automated setup.');
    return undefined;
  }

  const rl = createReadline();

  try {
    printWizardHeader();

    const state: WizardState = {
      currentStep: 1,
      totalSteps: 4,
      answers: {},
    };

    // Step 1: Usage mode
    state.answers.usageMode = await askUsageMode(rl, state);
    state.currentStep++;

    // Step 2: API keys
    state.answers.hasApiKeys = await askApiKeys(rl, state);
    state.currentStep++;

    // Step 3: Config directory
    state.answers.configDirectory = await askConfigDirectory(rl, state);
    state.currentStep++;

    // Step 4: Confirmation
    state.answers.confirmProceed = await askConfirmation(rl, state, state.answers);
    state.currentStep++;

    if (!state.answers.confirmProceed) {
      writeEmptyLine();
      writeLine('Setup cancelled.');
      return undefined;
    }

    printCompletion();

    // Convert wizard answers to setup options
    return convertAnswersToOptions(state.answers as WizardAnswers);
  } finally {
    rl.close();
  }
}

/**
 * Converts wizard answers to setup options.
 */
function convertAnswersToOptions(answers: WizardAnswers): Partial<SetupOptions> {
  const isStandalone = answers.usageMode === 'standalone';

  return {
    // Skip MCP and hooks for standalone mode
    skipMcp: isStandalone,
    skipHooks: isStandalone,
    // Always create rules file
    skipRules: false,
    // Use user scope for Claude CLI/Desktop, project for standalone
    scope: isStandalone ? 'project' : 'user',
    // Non-interactive since we collected all info
    nonInteractive: true,
    // Show verbose output to explain what's happening
    verbose: true,
  };
}

// ============================================================================
// Exports
// ============================================================================

export { isInteractive };
