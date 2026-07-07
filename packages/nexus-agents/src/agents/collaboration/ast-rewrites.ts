/**
 * nexus-agents/agents - AST-Grep Pattern Rewrites for the Constitutional Fixer
 *
 * Two narrow, pattern-based rewrites that replace the regex-fragile transforms
 * previously inlined in `ast-fixer.ts`'s `fixErrorHandling`/`fixNoEval`
 * (#4243, epic #4249 Child B):
 *
 *  - {@link appendCatchToUnhandledThen} — append `.catch(...)` to the OUTERMOST
 *    unhandled `.then(...)` of a promise chain. The old implementation used a
 *    trailing-`)` regex (`/\)(\s*)$/`) against the statement's source text,
 *    which silently no-op'd on any semicolon-terminated statement (#4243) —
 *    the overwhelmingly common case. ast-grep matches the `call_expression`
 *    node itself, whose text excludes the trailing `;`, so this class of bug
 *    cannot recur by construction.
 *  - {@link neutralizeEvalCalls} — neutralize `eval(...)`, `Function(...)`,
 *    and `new Function(...)` call sites. The old implementation matched any
 *    callee whose text `.endsWith('Function')`, which over-matched ordinary
 *    identifiers like `setupFunction()`. Exact-callee ast-grep patterns
 *    (`eval($$$A)`, `Function($$$A)`, `new Function($$$A)`) cannot over-match
 *    a suffix.
 *
 * Both functions are syntactic rewrites over `@ast-grep/napi` (MIT,
 * Rust + tree-sitter) — the same engine already used by `search_usages`
 * (#4265) and the repo-map ranker (#4268). Reuses the shared
 * {@link langToNapi} mapping from `indexer/usage-ast.ts` rather than
 * duplicating it.
 *
 * @module agents/collaboration/ast-rewrites
 * @see Issue #4243 - ast-fixer misses semicolon-terminated chains, over-matches *Function
 * @see Issue #4249 - epic: replace ast-fixer's broken regex transforms
 */

import { Lang, parse } from '@ast-grep/napi';
import type { Edit, SgNode } from '@ast-grep/napi';
import { langToNapi } from '../../indexer/usage-ast.js';

/** Result of an ast-grep pattern rewrite attempt. */
export interface RewriteResult {
  /** The (possibly rewritten) source code. Equal to the input when `modified` is false. */
  code: string;
  /** Whether at least one rewrite was applied. */
  modified: boolean;
}

// Both callers already parse a single in-memory TypeScript "temp.ts" source
// file (see `AstFixer` in `ast-fixer.ts`); reuse the shared lang mapping for
// consistency with the rest of the ast-grep call sites even though the fixer
// itself is TS-only today.
const FIXER_LANG: Lang = langToNapi('typescript');

/**
 * Appends `.catch((err) => { console.error(err); })` to the OUTERMOST
 * unhandled `.then(...)` call in a promise chain.
 *
 * "Outermost" mirrors the old `isThenWithoutCatch` semantics: a `.then(...)`
 * call whose immediate parent is an `expression_statement` (i.e. nothing is
 * chained after it in the same statement) is the one that needs a `.catch`.
 * A `.then(...)` call further chained into (e.g. the inner `p.then(f)` of
 * `p.then(f).then(g)`, or the `.then(...)` of `p.then(f).catch(g)`) has its
 * parent as a `member_expression` instead — that ancestor chain already
 * leads to an enclosing `.catch`/`.then`, so it is skipped.
 *
 * `.then(...)` calls that are not the entire expression of a statement (e.g.
 * inside a variable declaration, `const x = p.then(f);`) never match — same
 * as the old ts-morph implementation, which only ever mutated an
 * `ExpressionStatement` ancestor. Callers fall back to a TODO comment fix.
 *
 * @param code - Source to rewrite.
 * @param targetLine - 1-based line to restrict the rewrite to, or `null` to
 *   rewrite every qualifying `.then(...)` in the file.
 */
export function appendCatchToUnhandledThen(code: string, targetLine: number | null): RewriteResult {
  const root = parse(FIXER_LANG, code).root();
  const matches = root.findAll({ rule: { pattern: '$P.then($$$ARGS)' } });

  const edits: Edit[] = [];
  let modified = false;
  for (const node of matches) {
    const parent = node.parent();
    if (parent?.kind() !== 'expression_statement') {
      continue; // Not the outermost call of its chain, or not a bare expression statement.
    }

    const line = node.range().start.line + 1;
    if (targetLine !== null && line !== targetLine) {
      continue;
    }

    edits.push(node.replace(`${node.text()}.catch((err) => { console.error(err); })`));
    modified = true;

    if (targetLine !== null) {
      break;
    }
  }

  if (!modified) {
    return { code, modified: false };
  }
  return { code: root.commitEdits(edits), modified: true };
}

/** ast-grep patterns matching an unsafe dynamic-code-execution call, exact callee only. */
const EVAL_PATTERNS: readonly string[] = ['eval($$$A)', 'Function($$$A)', 'new Function($$$A)'];

/** Walks `node`'s ancestor chain (inclusive) to find the enclosing `expression_statement`. */
function findEnclosingExpressionStatement(node: SgNode): SgNode | null {
  let current: SgNode | null = node;
  while (current !== null) {
    if (current.kind() === 'expression_statement') {
      return current;
    }
    current = current.parent();
  }
  return null;
}

/**
 * Neutralizes `eval(...)`, `Function(...)`, and `new Function(...)` call
 * sites by replacing their enclosing expression statement with a security
 * comment plus a thrown error — verbatim the same output the old
 * ts-morph implementation produced, so downstream consumers/assertions of
 * that exact string don't churn.
 *
 * Uses exact-callee ast-grep patterns rather than a `.endsWith('Function')`
 * text check, so an ordinary call like `setupFunction()` cannot over-match
 * (the bug this replaces).
 *
 * Calls not inside a bare expression statement (e.g.
 * `const result = eval('1 + 1');`) never match — same as the old
 * implementation, which only ever mutated an `ExpressionStatement` ancestor.
 * Callers fall back to a TODO comment fix.
 *
 * @param code - Source to rewrite.
 * @param targetLine - 1-based line to restrict the rewrite to, or `null` to
 *   rewrite every qualifying call in the file.
 */
export function neutralizeEvalCalls(code: string, targetLine: number | null): RewriteResult {
  const root = parse(FIXER_LANG, code).root();

  const edits: Edit[] = [];
  const editedStatementIds = new Set<number>();
  let modified = false;

  outer: for (const pattern of EVAL_PATTERNS) {
    for (const node of root.findAll({ rule: { pattern } })) {
      const statement = findEnclosingExpressionStatement(node);
      if (statement === null) {
        continue;
      }
      if (editedStatementIds.has(statement.id())) {
        continue; // Same statement already scheduled (e.g. two unsafe calls in one expression).
      }

      const line = statement.range().start.line + 1;
      if (targetLine !== null && line !== targetLine) {
        continue;
      }

      const originalText = statement.text();
      edits.push(
        statement.replace(
          `// SECURITY: eval disabled - ${originalText}\n` +
            `throw new Error('eval() is not allowed for security reasons');`
        )
      );
      editedStatementIds.add(statement.id());
      modified = true;

      if (targetLine !== null) {
        break outer;
      }
    }
  }

  if (!modified) {
    return { code, modified: false };
  }
  return { code: root.commitEdits(edits), modified: true };
}
