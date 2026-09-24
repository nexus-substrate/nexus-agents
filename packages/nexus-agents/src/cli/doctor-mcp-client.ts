/**
 * The doctor `MCP Client mode` line. A sibling of `doctor-formatting.ts` for
 * the file cap, in the same shape as `doctor-voter-transport.ts`.
 *
 * @module cli/doctor-mcp-client
 */

import { CODEX_MCP_SERVER_UNAVAILABLE_REASON } from '../cli-adapters/codex-mcp-server-probe.js';
import { colors, symbols } from './ansi-output.js';
import type { DoctorResult } from './doctor.js';

const MCP_CLIENT_UNAVAILABLE = `unavailable — ${CODEX_MCP_SERVER_UNAVAILABLE_REASON}; using codex exec`;

/**
 * Client mode four ways. `mcpClientReady` is measured by the
 * `codex mcp-server --help` probe (#6119), so codex installed without the
 * subcommand (codex-cli >=0.154) is a warning that names the transport in use —
 * not "Ready" off the install, and not "not installed".
 *
 * Codex disabled by `NEXUS_DISABLED_CLIS` is a choice, not a fault (#6728): it
 * takes the CLI list's neutral circle, never the failure cross, and never says
 * "not installed". `mcpClientReady` is not a verdict term, so the line only
 * reports; it counts against readiness in no state.
 */
export function formatMcpClientLine(
  result: Pick<DoctorResult, 'mcpClientReady' | 'disabledClis' | 'clis'>
): string {
  const codexInstalled = result.clis.some((cli) => cli.name === 'codex' && cli.installed);
  const [glyph, text] = result.mcpClientReady
    ? [`${colors.green}${symbols.check}`, 'Ready (Codex mcp-server)']
    : result.disabledClis.includes('codex')
      ? [`${colors.yellow}${symbols.circle}`, 'Disabled (codex disabled by NEXUS_DISABLED_CLIS)']
      : codexInstalled
        ? [`${colors.yellow}${symbols.warn}`, MCP_CLIENT_UNAVAILABLE]
        : [`${colors.red}${symbols.cross}`, 'Not ready (Codex not installed)'];
  return `${glyph}${colors.reset} MCP Client mode: ${text}`;
}
