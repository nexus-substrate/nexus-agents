/**
 * nexus-agents/cli - REPL Formatters
 *
 * Output formatting and printing for the interactive REPL.
 *
 * @module cli/repl-formatters
 * (Source: Issue #64, extracted from repl.ts for #272)
 */

import { VERSION } from '../version.js';
import { getTimeProvider } from '../core/index.js';
import { colors, type ReplSession } from './repl-types.js';

/**
 * Prints the REPL welcome banner.
 */
export function printBanner(): void {
  const banner = `
${colors.cyan}╔════════════════════════════════════════════════════════════╗
║                    ${colors.bold}Nexus Agents v${VERSION}${colors.reset}${colors.cyan}                     ║
║           Multi-agent orchestration interactive mode           ║
╚════════════════════════════════════════════════════════════╝${colors.reset}

${colors.dim}Type 'help' for available commands or enter a task to orchestrate.${colors.reset}
${colors.dim}Type 'exit' or press Ctrl+C to quit.${colors.reset}
`;
  process.stdout.write(banner + '\n');
}

/**
 * Prints REPL help text.
 */
export function printReplHelp(): void {
  const help = `
${colors.bold}Available Commands:${colors.reset}

  ${colors.cyan}help${colors.reset}              Show this help message
  ${colors.cyan}exit${colors.reset}, ${colors.cyan}quit${colors.reset}        Exit the REPL
  ${colors.cyan}clear${colors.reset}             Clear the screen
  ${colors.cyan}history${colors.reset}           Show command history
  ${colors.cyan}status${colors.reset}            Show session status

${colors.bold}Expert Commands:${colors.reset}

  ${colors.cyan}experts${colors.reset}           List available experts
  ${colors.cyan}create <role>${colors.reset}     Create a custom expert

${colors.bold}Workflow Commands:${colors.reset}

  ${colors.cyan}workflows${colors.reset}         List available workflow templates
  ${colors.cyan}run <name>${colors.reset}        Run a workflow (dry-run mode)

${colors.bold}Task Orchestration:${colors.reset}

  Any other input is treated as a task for the Orchestrator agent.
  Example: "Review the authentication module for security issues"

${colors.dim}Tip: Tasks are analyzed and delegated to appropriate experts.${colors.reset}
`;
  process.stdout.write(help + '\n');
}

/**
 * Prints session status.
 */
export function printStatus(session: ReplSession): void {
  const uptime = getTimeProvider().now() - session.startTime.getTime();
  const uptimeSeconds = Math.floor(uptime / 1000);
  const uptimeMinutes = Math.floor(uptimeSeconds / 60);
  const seconds = uptimeSeconds % 60;

  const status = `
${colors.bold}Session Status:${colors.reset}
  Session ID:    ${colors.cyan}${session.sessionId}${colors.reset}
  Started:       ${session.startTime.toLocaleString()}
  Uptime:        ${String(uptimeMinutes)}m ${String(seconds)}s
  Commands run:  ${String(session.history.length)}
  Verbose:       ${session.verbose ? 'enabled' : 'disabled'}
`;
  process.stdout.write(status + '\n');
}

/**
 * Prints command history.
 */
export function printHistory(session: ReplSession): void {
  if (session.history.length === 0) {
    process.stdout.write(`${colors.dim}No commands in history.${colors.reset}\n`);
    return;
  }

  process.stdout.write(`${colors.bold}Command History:${colors.reset}\n`);
  for (const [index, cmd] of session.history.entries()) {
    const num = String(index + 1).padStart(3, ' ');
    process.stdout.write(`  ${colors.dim}${num}${colors.reset}  ${cmd}\n`);
  }
  process.stdout.write('\n');
}

/**
 * Clears the terminal screen.
 */
export function clearScreen(): void {
  process.stdout.write('\x1b[2J\x1b[0f');
}
