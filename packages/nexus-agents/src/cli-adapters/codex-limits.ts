/**
 * Codex CLI subagent limits (#2659, Epic D).
 *
 * Codex's `~/.codex/config.toml` `[agents]` section defaults to
 * `max_depth = 1` and `max_threads = 6` (verified against
 * developers.openai.com/codex config reference — the originating issue's
 * `max_thread_depth` key name was wrong).
 *
 * nexus-agents does NOT write the operator's global `~/.codex/config.toml`
 * (that would clobber operator-owned state) and does NOT silently
 * auto-flatten routing topology. Instead — Option C from the #2659 design
 * vote — it WARNS at fan-out time when a planned concurrency would exceed
 * Codex's defaults, so the operator can raise their own `[agents]` limits
 * or spread the panel across more CLIs. The two existing parallel-dispatch
 * sites are already conservative: `worker-dispatcher.ts` caps a wave at 3
 * concurrent workers, and `collectRealVotes` round-robins voter roles
 * across available CLIs. The warned case is the narrow one — a single-CLI
 * fallback where every voter role lands on Codex.
 *
 * @module cli-adapters/codex-limits
 * @see Issue #2659
 */

/** Codex `[agents] max_depth` default — nested subagent depth. */
export const CODEX_DEFAULT_MAX_DEPTH = 1;

/** Codex `[agents] max_threads` default — concurrent subagent threads. */
export const CODEX_DEFAULT_MAX_THREADS = 6;

/**
 * A structured warning when `codexBoundConcurrency` parallel calls are
 * about to be dispatched to Codex, exceeding its default `max_threads`.
 * Returns `null` when within limits. Does not block — the operator stays
 * in control (Option C).
 */
export function checkCodexConcurrency(codexBoundConcurrency: number): string | null {
  if (codexBoundConcurrency <= CODEX_DEFAULT_MAX_THREADS) return null;
  return (
    `${String(codexBoundConcurrency)} parallel calls are bound for Codex, exceeding its ` +
    `default max_threads=${String(CODEX_DEFAULT_MAX_THREADS)}. Codex may queue or drop the ` +
    `excess. Raise [agents] max_threads in ~/.codex/config.toml, or spread the panel across ` +
    `more CLIs (claude/gemini) so fewer roles land on Codex.`
  );
}

/**
 * A structured warning when a planned subagent nesting `depth` exceeds
 * Codex's default `max_depth`. Returns `null` when within limits.
 */
export function checkCodexDepth(depth: number): string | null {
  if (depth <= CODEX_DEFAULT_MAX_DEPTH) return null;
  return (
    `planned subagent nesting depth ${String(depth)} exceeds Codex's default ` +
    `max_depth=${String(CODEX_DEFAULT_MAX_DEPTH)}. Codex will reject the nested spawn. ` +
    `Raise [agents] max_depth in ~/.codex/config.toml, or flatten the expert chain.`
  );
}
