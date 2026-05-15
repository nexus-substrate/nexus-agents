---
title: Rule-Loading Precedence Across Harnesses
description: Exactly which rule files Claude Code / Codex / Gemini CLI / OpenCode load, from where, in what order
tier: 2
keywords: [rules, precedence, claude, codex, gemini, opencode, agents.md, autoload]
related_files: [AGENTS.md, CLAUDE.md, docs/guides/HARNESS_COMPATIBILITY.md]
---

# Rule-Loading Precedence Across Harnesses

The four harnesses that nexus-agents adapts (Claude Code, Codex CLI, Gemini CLI, OpenCode) resolve rule files **differently**. Operators using a non-Claude harness can silently miss rules they assume are auto-loaded. This guide is the per-adapter precise reference.

For the broader "how do I wire nexus-agents into my harness" story, see [HARNESS_COMPATIBILITY.md](./HARNESS_COMPATIBILITY.md). This doc is narrower: only rule loading.

---

## At a glance

| Adapter         | Project rules file(s)                                            | Trigger                                                       | Filename configurable?                      |
| --------------- | ---------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------- |
| **Claude Code** | `CLAUDE.md` + `.rules/*.md`                                      | `CLAUDE.md` always; `.rules/*.md` autoloaded by keyword match | No                                          |
| **Codex CLI**   | `AGENTS.md` + `AGENTS.override.md` along the directory chain     | All files in the chain merged; later overrides earlier        | Yes — `project_doc_fallback_filenames`      |
| **Gemini CLI**  | `GEMINI.md` (or any name listed in `context.fileName`)           | All files in `context.fileName` order                         | Yes — `context.fileName` in `settings.json` |
| **OpenCode**    | `AGENTS.md` (falls back to `CLAUDE.md` for Claude Code migrants) | Project root only                                             | No                                          |

The columns mean different things per adapter, which is exactly the problem this doc exists to clarify.

---

## Claude Code

**Files searched.** `CLAUDE.md` at the project root; `~/.claude/CLAUDE.md` at the user level. `.rules/*.md` is a **nexus-agents convention**, not a Claude Code primitive — files there are loaded by keyword match.

**Order.**

1. `~/.claude/CLAUDE.md` (user-level) — loaded first if present.
2. `CLAUDE.md` (project root) — loaded after user-level; can extend or override.
3. `.rules/<topic>.md` — auto-injected into the context when the user message (or system prompt) keyword-matches the rule's topic. The match is heuristic, not declarative: Claude Code's runtime decides which rule files to include based on what the user is asking about.

**Implications.**

- A rule that isn't keyword-matched **won't load** even if a relevant code change is being made. The fix in this codebase is to surface keyword cues prominently in the rule's first paragraph.
- Issue [#2656](https://github.com/williamzujkowski/nexus-agents/issues/2656) added `paths:` + `description:` frontmatter to every `.rules/*.md`, and [#2657](https://github.com/williamzujkowski/nexus-agents/issues/2657) made that frontmatter the single source of truth for the [AGENTS.md](../../AGENTS.md) "Rules index" table — the universal cross-adapter bridge (see [below](#what-rules-autoload-looks-like-across-adapters)). No harness reads `paths:` globs natively; the frontmatter is consumed by `scripts/inject-governance.ts`, which regenerates the AGENTS.md table (and a CI gate fails on drift).

**Canonical reference.** Claude Code docs · `code.claude.com/docs/en/best-practices`.

---

## Codex CLI

**Files searched.** Codex walks the directory chain from `~/.codex/AGENTS.md` (global) down to the current working directory. At each level it looks for:

1. `AGENTS.override.md` — highest precedence (replaces, not merges).
2. `AGENTS.md` — base.
3. Any filename listed in `project_doc_fallback_filenames` (configurable).

**Order.** Strict precedence per directory level, then directories are merged from outermost (`~`) to innermost (CWD). Later directories can override earlier ones — but `AGENTS.override.md` at any level is the strictest signal in scope.

**Filename configurability.** `project_doc_fallback_filenames` in `~/.codex/config.toml` lets you add fallback filenames (e.g., `CLAUDE.md` for migrating projects). `project_doc_max_bytes` caps the total ingested size.

**Implications.**

- nexus-agents' `.rules/*.md` files **won't load** through Codex unless they're explicitly referenced from `AGENTS.md`. The current `AGENTS.md` "Rules index" table is that bridge — but it works because Codex follows references inside `AGENTS.md`, not because Codex scans `.rules/` directly.
- Codex's precedence is _strict_ (last write wins per directory chain); Claude Code's is _additive_ (everything along the path applies). This affects how to design overrides.

**Canonical reference.** Codex documentation · `developers.openai.com/codex/guides/agents-md` and `developers.openai.com/codex/config-reference`.

---

## Gemini CLI

**Files searched.** `GEMINI.md` by default, at the project root. The filename is **configurable** via `context.fileName` in `~/.gemini/settings.json` — that field accepts an **ordered list** (e.g., `["GEMINI.md", "AGENTS.md", "AGENT.md"]`), and Gemini reads them in that order.

**Order.** Files in `context.fileName` order. The first match in a given directory wins; directories are walked from project root outward.

**Filename configurability.** Yes — that's the primary mechanism. To make a Gemini-CLI session read this repo's `AGENTS.md`, set:

```jsonc
// ~/.gemini/settings.json
{
  "context": {
    "fileName": ["GEMINI.md", "AGENTS.md"],
  },
}
```

**Implications.**

- Out-of-the-box Gemini CLI reads `GEMINI.md`, not `AGENTS.md`. Operators who want nexus-agents rules to load must add `AGENTS.md` to `context.fileName`.
- Like Codex, Gemini does **not** scan `.rules/` directly. The bridge is `AGENTS.md` referencing rule files by path.

**Canonical reference.** Gemini CLI docs · `geminicli.com/docs/cli/gemini-md/`.

---

## OpenCode

**Files searched.** `AGENTS.md` at the project root. If absent, OpenCode falls back to `CLAUDE.md` (this is a deliberate migration affordance for Claude Code projects). User-level: `~/.config/opencode/AGENTS.md`.

**Order.** User-level first, then project root.

**Filename configurability.** No declarative configuration; the fallback chain is hard-coded as `AGENTS.md` → `CLAUDE.md`.

**Implications.**

- nexus-agents ships both `AGENTS.md` and `CLAUDE.md` (the latter being Claude-Code-specific). OpenCode reads `AGENTS.md` first, so the fallback never triggers in this repo.
- `.rules/*.md` again only loads if referenced from `AGENTS.md`.

**Canonical reference.** OpenCode docs · `opencode.ai/docs/rules/`.

---

## Side-by-side: what loads when you edit `src/foo.ts`?

| Adapter     | `CLAUDE.md`                                               | `AGENTS.md`                                                         | `.rules/typescript.md`                 | `.rules/security.md`                  |
| ----------- | --------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------- | ------------------------------------- |
| Claude Code | ✅ always                                                 | ❌ (file exists but not auto-loaded)                                | ✅ if "TypeScript" keyword cue matches | ✅ if "security" keyword cue matches  |
| Codex CLI   | ❌ unless `CLAUDE.md` in `project_doc_fallback_filenames` | ✅ always                                                           | ❌ unless referenced from `AGENTS.md`  | ❌ unless referenced from `AGENTS.md` |
| Gemini CLI  | ❌ unless in `context.fileName`                           | ❌ unless in `context.fileName` (default order is `GEMINI.md` only) | ❌ never (no `.rules/` scan)           | ❌ never                              |
| OpenCode    | ❌ fallback only triggers when `AGENTS.md` absent         | ✅ always                                                           | ❌ unless referenced from `AGENTS.md`  | ❌ unless referenced from `AGENTS.md` |

This is why `AGENTS.md` in this repo lists every `.rules/*.md` file with a "When to read" hint — it's the bridge that makes the rules visible to the three non-Claude harnesses.

---

## What `.rules/` autoload looks like across adapters

| Behavior                                     | Claude Code    | Codex | Gemini                                     | OpenCode |
| -------------------------------------------- | -------------- | ----- | ------------------------------------------ | -------- |
| Auto-load on keyword match                   | ✅ (heuristic) | ❌    | ❌                                         | ❌       |
| Auto-load on file-path match (glob)          | ❌             | ❌    | ❌                                         | ❌       |
| Load via explicit reference from `AGENTS.md` | ✅             | ✅    | ✅ if `AGENTS.md` is in `context.fileName` | ✅       |

The third row is the universal path: nexus-agents' `AGENTS.md` "Rules index" table references every `.rules/*.md` file, so all four harnesses see all rules. The first row is Claude-only and best-effort. **The second row is empty by design** — no harness reads `paths:` glob frontmatter natively, and nexus-agents cannot add glob auto-loading without forking the harnesses. Instead, [#2657](https://github.com/williamzujkowski/nexus-agents/issues/2657) makes the third row drift-proof: `scripts/inject-governance.ts` regenerates the AGENTS.md table from `.rules/*.md` `paths:` + `description:` frontmatter, and a CI gate (`checkRulesIndex`) fails the build if the table drifts from the frontmatter. The `paths:` globs surface in the table's "Applies to" column so an operator on any harness can see which files each rule governs.

---

## When this matters

You'll feel this difference in three situations:

1. **A teammate using a different harness gets unexpected behavior.** The rule you assumed was loaded didn't load on their side. Action: check whether the rule is referenced from `AGENTS.md` (the cross-adapter bridge) or only relies on Claude Code's keyword autoload.
2. **A CI gate enforces a rule** but the operator's local harness skipped loading it. Action: same as above — bridge through `AGENTS.md`.
3. **You're migrating a project from one harness to another.** Codex migrants need to land `AGENTS.md`; OpenCode and Cursor migrants can keep `CLAUDE.md` as a fallback but should still author `AGENTS.md` for canonical visibility.

For operator setup wiring (where to register MCP servers per harness, where to put config), see [HARNESS_COMPATIBILITY.md](./HARNESS_COMPATIBILITY.md).

---

## Related

- [AGENTS.md](../../AGENTS.md) — the canonical agent-instructions file. The "Rules index" section makes `.rules/*.md` visible to non-Claude harnesses.
- [HARNESS_COMPATIBILITY.md](./HARNESS_COMPATIBILITY.md) — MCP-server wiring per harness.
- [#2656](https://github.com/williamzujkowski/nexus-agents/issues/2656) — `paths:` + `description:` frontmatter on every `.rules/*.md`, plus the `checkRuleFrontmatter` CI gate.
- [#2657](https://github.com/williamzujkowski/nexus-agents/issues/2657) — Epic C. This doc + #2656, plus the generator that builds the AGENTS.md "Rules index" from the frontmatter and the `checkRulesIndex` drift gate.
