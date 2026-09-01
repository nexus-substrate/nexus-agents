# Packaged vs repo-only assets

**What ships to npm, what stays in the repo, and how a runtime read of an
unshipped path is caught.**

Written because nothing declared it (#5143). Answering "are the governance
documents packaged?" previously meant reading `package.json#files`, listing an
installed package, grepping for runtime reads, and checking two mirrors — a
research task for a question with a fixed answer.

## What ships

The authoritative list is `packages/nexus-agents/package.json#files` — read it
there, and do not expect to find it restated here. A prose copy of a list that
changes is a second source of truth that no gate compares, so this document
records the **invariant** over that list instead:

> The package ships `dist` plus a small number of explicitly-enumerated runtime
> asset directories. Governance and development documents are not among them,
> and nothing reads them at runtime.

That invariant is what the rest of this document depends on, and it is the part
that would be a bug if it changed. Which specific asset directories are
enumerated is a build detail; `scripts/check-dist-assets.ts` enforces that list
against `dist/`, so it is checked rather than described.

To see what an installed copy actually contains, `npm pack --dry-run` in
`packages/nexus-agents` prints the file list without publishing.

## What does not ship, deliberately

Governance and development artifacts stay in the repo: the rules, skills, agent
and governance directories, the harness instruction files, `CODEOWNERS`, `docs/`
and `api-surface.txt`.

**Nothing reads them at runtime.** They are source-of-truth documents for
development and governance; where the runtime needs their content, it reads a
typed mirror instead. That is the claim worth stating, because it is not
derivable from `files` — an absent path and an unread path look identical from
the manifest.

## The mirror pattern

A repo-only document is mirrored into a typed constant, and a gate keeps the two
in step. The gate is the load-bearing part — without it the mirror drifts and the
drift is visible only to someone reading both.

| repo artifact                | runtime mirror                                          | gate                                                                                       |
| ---------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `agents/<name>-expert.md`    | `BUILT_IN_EXPERTS` (`agents/experts/expert-config.ts`)  | `scripts/generate-agents-index.ts --check` — fails when an expert exists in one place only |
| `governance/loop-tiers.yaml` | typed constant in `orchestration/loop-tier-registry.ts` | its registry test; the registry fails closed at import                                     |
| `skills/<name>/SKILL.md`     | none — consumed by the harness, not the server          | n/a                                                                                        |

Each mirrored constant names its source document and its gate in a doc comment,
so the relationship does not have to be re-derived.

## Runtime data that must ship

Assets a loader reads at runtime resolve **inside the installed package**, so
they have to be copied into `dist/` and listed:

| asset                           | loader                                 |
| ------------------------------- | -------------------------------------- |
| `models-dev-snapshot.json`      | `config/models-dev-snapshot-loader.ts` |
| `model-registry.generated.json` | `config/models-generated-loader.ts`    |
| `workflows/templates`           | `workflows/template-loader.ts`         |
| `security/ast-rules`            | `security/ast-rule-runner.ts`          |

Copying happens in `tsup.config.ts` `onSuccess`; `scripts/check-dist-assets.ts`
runs as part of `build` and fails if any is missing or truncated. `REQUIRED_DIST_ASSETS`
in that script is the authoritative list — the table above is a reading aid for
the asset-to-loader relationship, which the script does not record.

**Why a floor exists rather than `existsSync`:** `cp` of a half-written file
leaves a path `existsSync` accepts, and an empty JSON array parses fine and
enumerates to nothing. That is one step further along the same failure.

Each asset is tagged by kind, because the floor that means something differs
(#5297). A `file` asset carries `minBytes`. A `dir` asset carries `minEntries`,
since a byte size is meaningless for a directory — and an empty one is exactly
what `cp -r src/workflows/templates/. dist/workflows/templates/` produces when
the source is empty, which `cp` reports as success. The check previously did
`if (stat.isDirectory()) continue`, so a declared directory passed on existence
alone and both directory assets' floors were dead data.

## The failure this guards against

Issue #5084: `models-dev-snapshot.json` was read at runtime and was never in the copy
list. Because `files` ships only `dist`, **no installed copy had ever contained
it** — every `claude` / `codex` / `gemini` model enumeration returned `[]`, while
development, running from `src/config/` via tsx, returned 13 / 47 / 82. The two
transports that do not use the snapshot kept working and masked it. Every loader
catches and falls back to `[]`, so nothing was ever red.

It shipped, and it was found by running the tool, not by CI.

Two checks now stand between that and a repeat:

1. **`check-dist-assets.ts`** — every listed asset is present in `dist/`, is of
   the declared kind, and clears its floor: `minBytes` for a file, `minEntries`
   for a directory.
2. **The completeness check in the same script** (#5143) — every runtime file
   resolving a path from `import.meta.url` or `__dirname` must be _declared_,
   either naming the shipped asset it needs or explicitly `null` with a reason.
   Without it the list only guards the assets somebody remembered to add.

## If you are adding a runtime file read

Ask which of these it is:

- **Reads a repo-only document** — don't. Mirror it into a typed constant and add
  a gate, following the table above.
- **Reads an asset that must ship** — add the copy to `tsup.config.ts`, the entry
  to `REQUIRED_DIST_ASSETS`, and the declaration to
  `MODULE_RELATIVE_RESOLVERS`. The completeness check will fail until you do.
- **Reads the user's data directory** — use `nexusDataPath()`; that is runtime
  state, not a packaged asset, and none of the above applies.

## Consuming repos

`nexus-agents setup` scaffolds `.rules/nexus-agents.md`, the MCP config and
hooks — one integration rules file, not this repo's own governance rules. A
consuming repo gets what it needs to _use_ the substrate, not the substrate's
internal governance.

## Two CLI paths that legitimately need repo files

Both detect absence rather than assuming:

- `cli/system-review.ts` — `detectWrongProjectRoot` checks for `CLAUDE.md` and
  errors with a message naming the cause: the installed package ships only
  `dist/`.
- `cli/doctor-harness-alignment.ts` — tracks `agentsMdExists` and a
  `missingCount` instead of assuming the files are there.

## Not covered here

Whether a fresh `npm i -g` plus `nexus-agents setup` produces a working MCP
server with no repo present. That exercises `postinstall.js`, the setup wizard's
file writes and first-run data-dir creation, none of which this document was
derived from. It needs its own clean-environment test.
