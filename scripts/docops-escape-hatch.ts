/**
 * docops-escape-hatch.ts — tell an INVOCATION of the DocOps escape hatch apart
 * from a MENTION of it (#6026).
 *
 * `check-docops-skill.ts` used to recognise the hatch with a bare
 * `commitMessage.includes('[skip-docops]')` over the whole PR commit range, so
 * any commit that merely NAMED the token disabled the gate and reported
 * "Check bypassed (escape hatch)" with exit 0.
 *
 * That is not a hypothetical. Twelve occurrences of the token exist across
 * eight commits on main. Eight of them are prose. All four commits carrying
 * only prose occurrences changed a declared pipeline file and updated no skill,
 * so all four bypassed silently — and every one of those four is a change TO
 * THIS GATE: the commit that introduced it, the #2411/#2413 fix, the
 * #5028/#5029 fix for the commit-RANGE half of this same bug, and the
 * dependabot exemption. Because you cannot modify an escape hatch without
 * writing its name, every change to this gate had bypassed this gate.
 *
 * The recogniser is positional, which the panel accepted as a bounded repair
 * rather than a complete disambiguation: a token that BEGINS a line or ENDS one
 * is an invocation, a token with words on both sides is prose. Measured against
 * all twelve historical occurrences it classifies every one correctly, and it
 * keeps the documented spelling so docops-spec.md, the skill and the script's
 * help text stay true. The residual risk is a prose sentence that happens to
 * end with the bare token; that is narrow, and unlike the mid-sentence case it
 * reads as a deliberate marker anyway.
 *
 * Deliberately NOT extracted into a cross-gate helper. `check-npx-tsx.sh` and
 * the #5028 commit-range fix are the same defect FAMILY (a gate matching its
 * own vocabulary) but three different matching domains — a token in a commit
 * message, an invocation in a file, a set of commits in a range. The contrarian
 * seat's objection on that point was upheld: one shared matcher across them
 * would be an abstraction over a coincidence.
 */

/** The documented escape-hatch token. Unchanged by #6026 — only its recognition moved. */
export const DOCOPS_SKIP_TOKEN = '[skip-docops]';

/** Any occurrence, invocation or prose. */
const TOKEN_ANYWHERE = /\[skip-docops\]/;

/**
 * An invocation: the token opens a line (optionally indented — squash-merge
 * bodies are), or closes one (optionally followed by whitespace).
 */
const TOKEN_INVOCATION = /^[ \t]*\[skip-docops\]|\[skip-docops\][ \t]*$/;

/**
 * The result of reading a commit message for the escape hatch.
 *
 * `invocationLines` and `mentionLines` are kept apart on purpose. "The token is
 * absent" and "the token is present but was never invoked" are different facts,
 * and the gate reports them differently: the second is very likely an author
 * who meant to bypass and wrote the token mid-sentence, and telling them so
 * beats silently treating it as prose.
 */
export interface EscapeHatchScan {
  /** True only when at least one line INVOKES the hatch. */
  readonly invoked: boolean;
  /** Trimmed lines that invoke it. */
  readonly invocationLines: readonly string[];
  /** Trimmed lines that name it without invoking it. */
  readonly mentionLines: readonly string[];
}

/**
 * Classify every occurrence of the token in `commitMessages`.
 *
 * Empty input yields `invoked: false` with both lists empty — absence, stated,
 * rather than a default standing in for a measurement.
 */
export function scanEscapeHatch(commitMessages: string): EscapeHatchScan {
  const invocationLines: string[] = [];
  const mentionLines: string[] = [];

  for (const line of commitMessages.split('\n')) {
    if (!TOKEN_ANYWHERE.test(line)) continue;
    if (TOKEN_INVOCATION.test(line)) {
      invocationLines.push(line.trim());
    } else {
      mentionLines.push(line.trim());
    }
  }

  return { invoked: invocationLines.length > 0, invocationLines, mentionLines };
}
