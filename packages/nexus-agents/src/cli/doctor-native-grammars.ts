/**
 * nexus-agents/cli - Native tree-sitter grammar availability probe (#5427)
 *
 * The second — and, since #5388 removed `better-sqlite3`, the last — native
 * surface in the published runtime dependency graph. `@ast-grep/lang-python`
 * and `@ast-grep/lang-go` ship prebuilt tree-sitter `.so` grammars and declare
 * a `postinstall` that verifies them, so where install scripts are blocked the
 * failure takes #5388's exact shape: `npm install` exits 0 and the polyglot
 * security scanner dies at first use.
 *
 * **Importing is not evidence.** Both packages are plain CJS modules whose
 * default export is a registration object with a *lazy* `libraryPath` getter.
 * The import succeeds whether or not the `.so` behind that path exists — only
 * `registerDynamicLanguage` and `parse` reach the file. So this probe parses.
 *
 * **Parsing alone is not evidence either.** tree-sitter is error-tolerant: the
 * Go grammar parses Python source without throwing, it just yields no Go
 * nodes. Each probe therefore asserts a language-SPECIFIC node kind, which is
 * what makes a wrong or stale grammar reportable instead of silently passing.
 *
 * @module cli/doctor-native-grammars
 * (Source: Issue #5427 — the "zero install scripts" contract from #5388)
 */

import { getErrorMessage } from '../core/index.js';
import { AST_RULE_LANGUAGES } from '../security/ast-rule-runner.js';
import type { AstRuleLanguage } from '../security/ast-rule-runner.js';

/**
 * Result of probing the dynamically-registered tree-sitter grammars.
 *
 * `languages` lists the grammars that actually PARSED their probe snippet, not
 * the ones that imported. A partially-working set reports `available: false`
 * with the working subset still named, so the record can say which half broke
 * rather than collapsing to a bare boolean.
 */
export interface NativeGrammarCheck {
  readonly available: boolean;
  readonly error: string | null;
  readonly languages: readonly AstRuleLanguage[];
}

/** The ast-grep `parse()` surface this probe needs, narrowed to what it calls. */
export type GrammarParse = (
  lang: string,
  src: string
) => { root(): { findAll(config: { rule: { kind: string } }): readonly unknown[] } };

/**
 * One probe per supported language: a snippet, plus a node kind that ONLY that
 * language's grammar produces for it.
 *
 * `kind` is the discriminating half. Verified against
 * `@ast-grep/lang-{python,go}@0.0.6`: `parse('python', 'x = 1')` yields one
 * `assignment`, `parse('go', ...)` yields one `function_declaration`, and
 * parsing the Python snippet with the Go grammar yields zero — so a grammar
 * swapped underneath us fails the probe instead of passing it.
 */
export interface GrammarProbe {
  readonly lang: AstRuleLanguage;
  readonly src: string;
  readonly kind: string;
}

export const GRAMMAR_PROBES: readonly GrammarProbe[] = Object.freeze([
  { lang: 'python', src: 'x = 1\n', kind: 'assignment' },
  { lang: 'go', src: 'package m\nfunc f() {}\n', kind: 'function_declaration' },
]);

/**
 * Probe every grammar in {@link GRAMMAR_PROBES} through injected `register`
 * and `parse`, so both the registration failure and the parse-yields-nothing
 * failure are reachable in a test without a broken `.so` on disk.
 *
 * The empty case is named rather than defaulted: with no probes there is
 * nothing to conclude, so this reports `available: false` and says so. Letting
 * `languages.length === GRAMMAR_PROBES.length` answer it would render `0 === 0`
 * as health — the shape this repo treats as a defect, not a nit.
 */
export function probeGrammars(
  register: () => void,
  parse: GrammarParse,
  probes: readonly GrammarProbe[] = GRAMMAR_PROBES
): NativeGrammarCheck {
  if (probes.length === 0) {
    return { available: false, error: 'no grammar probes are defined', languages: [] };
  }

  try {
    register();
  } catch (error: unknown) {
    return {
      available: false,
      error: `grammar registration failed: ${getErrorMessage(error)}`,
      languages: [],
    };
  }

  const working: AstRuleLanguage[] = [];
  const broken: string[] = [];
  for (const probe of probes) {
    try {
      const matches = parse(probe.lang, probe.src)
        .root()
        .findAll({ rule: { kind: probe.kind } });
      if (matches.length > 0) {
        working.push(probe.lang);
      } else {
        broken.push(`${probe.lang} (parsed, but produced no ${probe.kind} node)`);
      }
    } catch (error: unknown) {
      broken.push(`${probe.lang} (${getErrorMessage(error)})`);
    }
  }

  if (broken.length > 0) {
    return {
      available: false,
      error: `grammars unusable: ${broken.join('; ')}`,
      languages: working,
    };
  }
  return { available: true, error: null, languages: working };
}

/** What {@link checkNativeGrammars} needs from the ast-grep modules. */
export interface GrammarModules {
  readonly register: () => void;
  readonly parse: GrammarParse;
}

/**
 * Load the real ast-grep surface.
 *
 * Reuses `ensurePolyglotLangs` rather than calling `registerDynamicLanguage`
 * directly: napi throws if that runs twice in a process, so a second
 * registration here would break the scanner for the rest of the run.
 */
async function loadGrammarModules(): Promise<GrammarModules> {
  const [{ ensurePolyglotLangs }, napi] = await Promise.all([
    import('../security/ast-rule-runner.js'),
    import('@ast-grep/napi'),
  ]);
  return { register: ensurePolyglotLangs, parse: napi.parse as unknown as GrammarParse };
}

/**
 * Probe the real grammars as the polyglot scanner would.
 *
 * `load` is a parameter for the same reason `register` and `parse` are: on a
 * healthy machine the import cannot fail, so the catch below is unreachable
 * from a test that uses the real modules — and an unreachable branch is where a
 * failure quietly gets reported as health. Mutating this catch to return
 * `available: true` survived the whole suite until the seam was opened.
 *
 * Exported so `verify` (#2136) and `doctor` share one probe.
 */
export async function checkNativeGrammars(
  load: () => Promise<GrammarModules> = loadGrammarModules
): Promise<NativeGrammarCheck> {
  let modules: GrammarModules;
  try {
    modules = await load();
  } catch (error: unknown) {
    return {
      available: false,
      error: `ast-grep native grammars failed to load: ${getErrorMessage(error)}`,
      languages: [],
    };
  }
  return probeGrammars(modules.register, modules.parse);
}

/** Every language the polyglot scanner claims to support, for the probe-coverage test. */
export const SUPPORTED_GRAMMAR_LANGUAGES: readonly AstRuleLanguage[] = AST_RULE_LANGUAGES;
