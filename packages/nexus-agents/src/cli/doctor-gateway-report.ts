/**
 * The `doctor --gateway` section (#6609): what the gateway measurement in
 * `doctor-gateway.ts` found, line by line. Rendering only; the verdict lives
 * in `gatewayVerdict`. Prints no key, header value or proxy credential — the
 * measurement never holds them.
 *
 * @module cli/doctor-gateway-report
 */

import {
  OPENAI_COMPAT_KEY_ENV,
  OPENAI_COMPAT_MODELS_ENV,
  OPENAI_COMPAT_URL_ENV,
} from '../adapters/sdk/types.js';
import type { CliCheckResult } from './doctor.js';
import {
  gatewaySlotWarnings,
  gatewayVerdict,
  unservedSlotLines,
  type GatewayCompletionProbe,
  type GatewayHealth,
  type GatewayProxyStatus,
} from './doctor-gateway.js';
import { gatewayFailureReason } from './doctor-voter-transport.js';
import { colors, symbols } from './ansi-output.js';

const CHECK = `${colors.green}${symbols.check}${colors.reset}`;
const CROSS = `${colors.red}${symbols.cross}${colors.reset}`;
const WARN = `${colors.yellow}${symbols.warn}${colors.reset}`;

/** Says what the probe costs whether or not it ran, so the flag is never a surprise. */
const PROBE_COST_NOTE = 'one tiny completion per family; this spends gateway tokens';

/** The `doctor --gateway` section as lines. */
export function formatGatewayReport(health: GatewayHealth): string[] {
  const lines = [`${colors.cyan}Checking gateway (doctor --gateway)...${colors.reset}`, ''];
  if (health.state === 'not_configured') {
    lines.push(
      `${WARN} Gateway: not configured — set ${OPENAI_COMPAT_URL_ENV} and ${OPENAI_COMPAT_KEY_ENV}`
    );
    return lines;
  }
  if (health.state !== 'healthy') {
    lines.push(`${CROSS} Gateway ${health.host}: FAILED — ${gatewayFailureReason(health)}`);
    if (health.state === 'refused_private_host') lines.push(`  ${health.remedy}`);
    lines.push(`  Proxy: ${formatProxy(health.proxy)}`);
    return lines;
  }
  const filter = health.allowlistActive
    ? `after the chat filter and ${OPENAI_COMPAT_MODELS_ENV}`
    : 'after the chat filter';
  const { census, slots } = health;
  lines.push(
    `${CHECK} Gateway ${health.host}: /models answered`,
    `  Private-address guard: allowed`,
    `  Proxy: ${formatProxy(health.proxy)}`,
    `  Models: ${String(health.listedCount)} listed, ${String(health.chatCount)} chat models ${filter}`,
    `  Families: anthropic ${String(census.anthropic)}, openai ${String(census.openai)}, ` +
      `google ${String(census.google)}, unknown ${String(census.unknown)}`,
    `  Slots (used when the CLI is not available): claude → ${slots.claude}, ` +
      `codex → ${slots.codex}, gemini → ${slots.gemini}`,
    ...formatProbes(health.probes),
    ...formatUnservedSlots(health)
  );
  return lines;
}

/**
 * The missing CLIs a passing gateway cannot stand in for, one warning line
 * each (#6658). Printed with every `doctor` run, `--gateway` or not: they are
 * not failures — other slots work — but they are never silently excused.
 */
export function formatGatewaySlotWarnings(
  health: GatewayHealth,
  clis: readonly CliCheckResult[]
): string[] {
  return gatewaySlotWarnings(health, clis).map((warning) => `${WARN} ${warning}`);
}

/**
 * Each family slot the gateway does not serve (#6658): a warning while some
 * slot works, a failure when none does — the same line `gatewayVerdict` fails on.
 */
function formatUnservedSlots(health: GatewayHealth): string[] {
  const glyph = gatewayVerdict(health) === 'fail' ? CROSS : WARN;
  return unservedSlotLines(health).map((line) => `  ${glyph} ${line}`);
}

function formatProxy(proxy: GatewayProxyStatus): string {
  switch (proxy.kind) {
    case 'direct':
      return 'direct (no proxy variable applies)';
    case 'proxy':
      return `via ${proxy.proxyHost}`;
    case 'exempt':
      return 'direct (NO_PROXY exempts the gateway host)';
    case 'ignored':
      return 'direct (the proxy variable is not a usable http(s) URL; see the startup warning)';
  }
}

function formatProbes(probes: readonly GatewayCompletionProbe[] | 'skipped'): string[] {
  if (probes === 'skipped') {
    return [`  Completion probe: skipped — pass --probe to send ${PROBE_COST_NOTE}`];
  }
  return [`  Completion probe (${PROBE_COST_NOTE}):`, ...probes.map(formatProbe)];
}

function formatProbe(probe: GatewayCompletionProbe): string {
  if (probe.outcome === 'no_model') {
    return `    ${WARN} ${probe.family}: no gateway model of this family, not probed`;
  }
  const ms = `${String(probe.latencyMs)} ms`;
  if (probe.outcome === 'ok')
    return `    ${CHECK} ${probe.family}: ${probe.model} answered (${ms})`;
  return `    ${CROSS} ${probe.family}: ${probe.model} FAILED (${ms}) — ${probe.error ?? 'no error message'}`;
}
