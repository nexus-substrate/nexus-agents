/**
 * nexus-agents CLI command catalog (Issue #2135).
 *
 * Single source of truth for every top-level command: name, one-line
 * description, and the *audience* that cares about it. `renderHelp`
 * consumes this to produce tiered output:
 *
 * - Default `nexus-agents --help`: essential + advanced, grouped
 * - `nexus-agents --help --all`: everything, grouped
 *
 * Maintainer-audience commands (benchmarks, release tooling, deep
 * observability) are still fully functional — they just don't clutter
 * the default --help. `nexus-agents <cmd> --help` still works for all
 * of them.
 *
 * @module cli-command-catalog
 */

/** Who the command is aimed at. Drives the default --help filter. */
export type CommandAudience = 'essential' | 'advanced' | 'maintainer' | 'internal';

/** One entry per top-level command. */
export interface CommandCatalogEntry {
  readonly command: string;
  readonly description: string;
  readonly audience: CommandAudience;
}

/**
 * Hard cap on the `essential` audience band. Enforced by the `keeps the
 * essential tier small (<=12) so new users are not overwhelmed` test in
 * `cli-command-catalog.test.ts`.
 *
 * Rationale: the default `nexus-agents --help` lists every `essential` entry
 * up front. Past 12 it stops feeling curated — new users start scanning,
 * skipping, and missing the actually-onboarding-critical commands. If you
 * need a 13th, demote something else to `advanced` first.
 *
 * History (#2492): the cap has been tripped silently twice — first by `auth`
 * (deliberate, deserved promotion), second by `usage` (#2469, not reviewed
 * against the cap). The CI test catches it; this comment is the contract.
 */
export const ESSENTIAL_AUDIENCE_CAP = 12;

/**
 * All top-level commands, in display order within their audience band.
 *
 * Audience rationale:
 * - **essential**: what a new user needs to install, configure, verify, and
 *   run their first task. Capped at 12 entries (`ESSENTIAL_AUDIENCE_CAP`) —
 *   see the cap's docstring for the policy. When proposing a 13th, demote
 *   an existing entry to `advanced` first.
 * - **advanced**: useful day-to-day but not first-touch (session mgmt,
 *   capability inspection, workflow scaffolding, auth token rotation).
 *   Telemetry/operator-facing dashboards (e.g. `usage`,
 *   `improvement-review`) belong here — operators reach for them after
 *   they've been running tasks, not on first install.
 * - **maintainer**: benchmarks, release tooling, self-audits, deep
 *   observability dashboards, dogfooding helpers.
 * - **internal**: dev/eval loops that aren't part of the product surface
 *   (e2e-eval, routing-ab, memory-benchmark). Hidden from both default
 *   `--help` AND `--help --all`. Still present for entrypoint extraction
 *   (repo-index / entrypoints.yaml) because they're real CLI commands.
 */
export const COMMAND_CATALOG: readonly CommandCatalogEntry[] = [
  // ── Essential ────────────────────────────────────────────────────────────
  {
    command: '(default)',
    description: 'Start MCP server with stdio transport',
    audience: 'essential',
  },
  {
    command: 'hello',
    description: 'Show welcome message and quick start (no API keys needed)',
    audience: 'essential',
  },
  {
    command: 'setup',
    description: 'Configure CLI integration (MCP + .rules + data dirs)',
    audience: 'essential',
  },
  {
    command: 'verify',
    description: 'Check install health (sqlite, adapters, config)',
    audience: 'essential',
  },
  {
    command: 'doctor',
    description: 'Detailed system/adapter health check',
    audience: 'essential',
  },
  {
    command: 'config',
    description: 'Manage configuration (init, get, set, list, export, import)',
    audience: 'essential',
  },
  {
    command: 'orchestrate',
    description: 'Execute a task via CLI tools (standalone mode)',
    audience: 'essential',
  },
  {
    command: 'vote',
    description: 'Run consensus vote on a proposal (5-6 agents)',
    audience: 'essential',
  },
  {
    command: 'workflow',
    description: 'Manage and run workflow templates (list, run)',
    audience: 'essential',
  },
  {
    command: 'expert',
    description: 'Manage expert agents (list, create, execute)',
    audience: 'essential',
  },
  {
    command: 'research',
    description: 'Manage research registry (status, add, stats, refresh)',
    audience: 'essential',
  },

  // ── Advanced ─────────────────────────────────────────────────────────────
  {
    command: 'session',
    description: 'Manage session persistence (list, show, export, delete)',
    audience: 'advanced',
  },
  {
    command: 'auth',
    description:
      'Manage authentication: init/show/rotate MCP tokens; status shows per-CLI auth state',
    audience: 'essential',
  },
  {
    command: 'login',
    description: '[deprecated alias] Soft alias of "auth status"; renamed in #2449',
    audience: 'maintainer',
  },
  {
    command: 'usage',
    description:
      'Cost / usage / quality dashboard from per-call telemetry (#2469). --format=json for scripting.',
    audience: 'advanced',
  },
  {
    command: 'status',
    description: 'At-a-glance project health dashboard',
    audience: 'advanced',
  },
  {
    command: 'capabilities',
    description: 'Show model capabilities matrix',
    audience: 'advanced',
  },
  {
    command: 'registry',
    description: 'Inspect + refresh the dynamic model registry (doctor / refresh)',
    audience: 'advanced',
  },
  {
    command: 'review',
    description: 'Review a GitHub PR (dogfooding helper)',
    audience: 'advanced',
  },
  {
    command: 'scaffold',
    description: 'Generate project files from templates',
    audience: 'advanced',
  },
  {
    command: 'validate',
    description: 'Run unified validation (doctor + fitness + config)',
    audience: 'advanced',
  },
  {
    command: 'index',
    description: 'Generate and manage codebase index',
    audience: 'advanced',
  },
  {
    command: 'improvement-review',
    description:
      'Observability-driven improvement loop (#2402). Surfaces threshold breaches; --file-issues opt-in.',
    audience: 'advanced',
  },

  // ── Maintainer (hidden by default) ───────────────────────────────────────
  {
    command: 'demo',
    description: 'API-free exploration mode (marketing/demo flow)',
    audience: 'maintainer',
  },
  {
    command: 'hooks',
    description: 'Claude CLI hook integration commands',
    audience: 'maintainer',
  },
  {
    command: 'routing-audit',
    description: 'Debug model routing decisions',
    audience: 'maintainer',
  },
  {
    command: 'fitness-audit',
    description: 'Run CLI orchestration fitness score audit',
    audience: 'maintainer',
  },
  {
    command: 'system-review',
    description: 'Automated system review (5-phase checklist)',
    audience: 'maintainer',
  },
  {
    command: 'sprint',
    description: 'Automated sprint planning from open issues',
    audience: 'maintainer',
  },
  {
    command: 'evaluate',
    description: 'Self-evaluation of codebase components',
    audience: 'maintainer',
  },
  {
    command: 'issue',
    description: 'Issue template validation and management',
    audience: 'maintainer',
  },
  {
    command: 'validation',
    description: 'Learning validation dashboard',
    audience: 'maintainer',
  },
  {
    command: 'learning-metrics',
    description: 'Aggregated learning metrics dashboard',
    audience: 'maintainer',
  },
  {
    command: 'swe-bench',
    description: 'Run SWE-bench evaluation benchmark',
    audience: 'maintainer',
  },
  {
    command: 'atbench',
    description: 'Run ATBench trajectory-safety evaluation',
    audience: 'maintainer',
  },
  {
    command: 'visualize',
    description: 'Generate Mermaid diagrams and ASCII dashboards',
    audience: 'maintainer',
  },
  {
    command: 'health',
    description: 'Swarm health metrics dashboard',
    audience: 'maintainer',
  },
  {
    command: 'release-notes',
    description: 'Generate release notes from git commits',
    audience: 'maintainer',
  },
  {
    command: 'release-validate',
    description: 'Run expert swarm validation for releases',
    audience: 'maintainer',
  },
  {
    command: 'release-announce',
    description: 'Generate release announcements (blog, social)',
    audience: 'maintainer',
  },

  // ── Internal (hidden everywhere; here for extractor/index completeness) ──
  {
    command: 'server',
    // Synonym for the no-arg invocation — `nexus-agents` and
    // `nexus-agents server` both run `handleServerCommand`. Listed here for
    // extractor completeness; humans see `(default)` in --help.
    description: 'Start MCP server with stdio transport (explicit form)',
    audience: 'internal',
  },
  {
    command: 'e2e-eval',
    description: 'E2E evaluation scenario runner (dev loop)',
    audience: 'internal',
  },
  {
    command: 'memory-benchmark',
    description: 'Memory-system benchmark runner (dev loop)',
    audience: 'internal',
  },
  {
    command: 'memory-eval',
    description: 'Comparative memory evaluation benchmark (dev loop)',
    audience: 'internal',
  },
  {
    command: 'routing-ab',
    description: 'A/B comparison of routing strategies (dev loop)',
    audience: 'internal',
  },
  {
    command: 'scenario',
    description: 'Execute a named scenario from the testing framework',
    audience: 'internal',
  },
  {
    command: 'warm-up',
    description: 'Warm the model/adapter caches before a run',
    audience: 'internal',
  },
];

/**
 * Returns the catalog filtered for `--help` output.
 *
 * - `showAll: false` → essential + advanced (the default `--help` surface)
 * - `showAll: true` → essential + advanced + maintainer (`--help --all`)
 *
 * `internal` audience entries are **always excluded** from human-facing
 * output. They're still reachable via `COMMAND_CATALOG` for extractors that
 * need a complete inventory (repo-index, entrypoints.yaml).
 */
export function filterCatalog(showAll: boolean): readonly CommandCatalogEntry[] {
  const visible = COMMAND_CATALOG.filter((e) => e.audience !== 'internal');
  if (showAll) return visible;
  return visible.filter((e) => e.audience !== 'maintainer');
}

/**
 * Returns every real top-level command, including internal ones, but
 * excluding the `(default)` placeholder (no actual handler). Used by
 * entrypoint extractors and the repo-index generator — #2156.
 */
export function catalogForExtractors(): readonly CommandCatalogEntry[] {
  return COMMAND_CATALOG.filter((e) => e.command !== '(default)');
}

/** Groups entries by audience, preserving catalog order within each group. */
export function groupByAudience(
  entries: readonly CommandCatalogEntry[]
): ReadonlyMap<CommandAudience, readonly CommandCatalogEntry[]> {
  const groups = new Map<CommandAudience, CommandCatalogEntry[]>();
  for (const entry of entries) {
    const existing = groups.get(entry.audience) ?? [];
    existing.push(entry);
    groups.set(entry.audience, existing);
  }
  return groups;
}

const AUDIENCE_HEADINGS: Record<CommandAudience, string> = {
  essential: 'Essential — install, configure, run',
  advanced: 'Advanced — day-to-day extras',
  maintainer: 'Maintainer — benchmarks, releases, deep diagnostics',
  // Never rendered (filterCatalog strips internal before renderCommandsSection
  // iterates), but required by the Record<CommandAudience, string> contract.
  internal: 'Internal — dev/eval loops (hidden from --help)',
};

/**
 * Renders the COMMANDS section of `--help`, grouped and tiered.
 *
 * Output shape (indent-sensitive — consumed verbatim inside `COMMANDS:` block):
 *
 * ```
 *   Essential — install, configure, run
 *     hello           Show welcome message...
 *     setup           Configure CLI integration...
 *
 *   Advanced — day-to-day extras
 *     ...
 * ```
 *
 * Trailing hint line ("Run with --all…") is appended only when `showAll=false`.
 */
export function renderCommandsSection(showAll: boolean): string {
  const filtered = filterCatalog(showAll);
  const groups = groupByAudience(filtered);
  const lines: string[] = [];
  const order: CommandAudience[] = showAll
    ? ['essential', 'advanced', 'maintainer']
    : ['essential', 'advanced'];
  for (const audience of order) {
    const entries = groups.get(audience);
    if (entries === undefined || entries.length === 0) continue;
    lines.push(`  ${AUDIENCE_HEADINGS[audience]}`);
    for (const entry of entries) {
      lines.push(`    ${entry.command.padEnd(16)} ${entry.description}`);
    }
    lines.push('');
  }
  if (!showAll) {
    lines.push('  Run with --all to show maintainer commands (benchmarks, release tooling).');
  }
  return lines.join('\n').replace(/\n+$/, '');
}
