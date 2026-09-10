/**
 * Public API surface extractor (#4749).
 *
 * Three times in one day I claimed a type change was internal after grepping
 * for the symbol's NAME in `src/exports/*.ts` and finding nothing:
 *
 * - #4736 `healthScore` widened to `number | null`, shipped as a patch.
 * - #4740 `VoteDecisionStatus` enum widening proposed as semver-minor.
 * - #4744 `ResultMetadata` called "not public" — but `TaskResult` is exported
 *   and carries `metadata: ResultMetadata`, so it is reachable structurally.
 *
 * A name grep answers "is this symbol re-exported?". The question that decides
 * semver is "is this type reachable from the entry point?", and those differ
 * whenever one exported type references another — the common case. The failure
 * is also one-directional: it always reads as "not public", i.e. as permission
 * to proceed.
 *
 * So this walks the real thing. Starting at `src/index.ts`, it records every
 * exported declaration and follows type references transitively, emitting a
 * sorted snapshot. `check-api-surface.ts` diffs that snapshot against the
 * committed one.
 *
 * WHAT IT CATCHES: a member's type changing (`number` -> `number | null`),
 * required becoming optional or vice versa, a union gaining or losing members,
 * a symbol disappearing, and any of the above on a type that is public only
 * through another type's signature.
 *
 * WHAT IT DOES NOT: judge severity. The snapshot diff tells you the surface
 * moved; a human still decides major vs minor. It also does not resolve
 * conditional or deeply generic types beyond their printed text, and it prints
 * types as written rather than fully expanded.
 *
 * @module scripts/extract-api-surface
 */
import { Project, Node, Scope, SyntaxKind, type Signature, type SourceFile } from 'ts-morph';
import { join } from 'node:path';

const PKG = join(process.cwd(), 'packages', 'nexus-agents');

/**
 * Printed form of one exported declaration.
 *
 * `origin` is the package-relative module the declaration lives in, and it is
 * part of the identity (#5224). Keying on the name alone merged two unrelated
 * declarations that happened to share a name into one entry whose members came
 * from both — `IEventBus` carried `emit(DomainEvent)` AND `emit(PipelineEvent)`,
 * `ModelTier` was simultaneously an interface and a three-member string union.
 * The semver gate then diffed changes against a declaration no source file
 * contains.
 */
interface SurfaceEntry {
  readonly name: string;
  readonly origin: string;
  readonly kind: string;
  readonly lines: readonly string[];
}

/**
 * Removes comments written INSIDE a printed type.
 *
 * A comment before a declaration is leading trivia and never reaches the
 * printed text; one written BETWEEN a union's members does, so editing it
 * registered as an API-surface change (#5972). PR #5970 was comment-only — it
 * corrected a note inside `VoteResult` — and the gate reported a REMOVED and
 * an ADDED declaration whose unions were identical and whose prose differed.
 *
 * This is the third instance of the failure this file already documents twice
 * (absolute paths, member order): a checker crying wolf on untouched code
 * teaches people to regenerate the snapshot without reading it, and the
 * correct response to a spurious diff is the same action as for a real break.
 *
 * Runs BEFORE the newline collapse in {@link normalizeTypeText}, because `//`
 * runs to end of line — stripping after the collapse would eat every union
 * member that followed a comment. There is a test for exactly that.
 *
 * Declaration-level JSDoc was never in the snapshot — it is leading trivia, so
 * `@deprecated` had zero occurrences even after #5966 added one to a published
 * field. MEMBER-level JSDoc inside a type literal WAS captured, and goes too;
 * that is deliberate. A doc comment on a member describes it, it does not
 * change its shape, and a reviewer reading this snapshot is checking shapes.
 *
 * Removing them also repairs the member sort, which comments were quietly
 * defeating: a member written as `/** why *\/ readonly reason: …` sorted under
 * `/` rather than under `reason`, so its position moved whenever the comment
 * did. Two normalisations that were fighting each other.
 */
function stripInlineComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, '');
}

/**
 * Strips machine-specific absolute paths out of printed type text.
 *
 * ts-morph prints an imported type as `import("/abs/path/to/module").Thing`.
 * The snapshot would then only match on the machine that generated it — CI
 * uses /home/runner, so the gate failed on its own first PR and would have
 * failed on every PR forever. A gate that always fails gets switched off,
 * which is no better than one that never fires.
 */
export function normalizeTypeText(text: string): string {
  // Object members are sorted BEFORE unions are: the union sort key must be
  // the canonical member text, or `{ a; b } | { c }` and `{ b; a } | { c }`
  // — the same declared set — sort by the checker's property order, which is
  // the source declaration order. The first cut ran the two the other way
  // round and 18 lines of the regenerated snapshot were not fixed points of
  // this function. `sortTypeMembers` recurses into every `{}` group, so by
  // the time a union member is compared its objects are already canonical.
  return canonicalSegment(
    sortTypeMembers(
      stripInlineComments(text)
        .replace(/import\("[^"]*\/packages\/nexus-agents\/src\/([^"]*)"\)/g, 'import("src/$1")')
        // A dependency's type can be printed as an `import("<abs path>")` into
        // node_modules. The greedy prefix consumes up to the LAST `/node_modules/`,
        // which strips both the machine path and pnpm's versioned store segment
        // (`.pnpm/zod@4.5.4/node_modules/`), leaving `zod/v4/core/schemas`.
        //
        // This file's own tests already warned about the class: "printed types must
        // not carry machine-specific absolute paths (the gate failed on its own
        // first CI run because /home/runner is not the author's home directory — a
        // gate that always fails gets switched off)". The pre-existing rewrite
        // above covered only in-package paths; rendering real call signatures
        // (#6061) started printing dependency types too, which reintroduced it.
        .replace(/import\("[^"]*\/node_modules\/([^"]*)"\)/g, 'import("$1")')
        // Collapse to ONE line. ts-morph wraps long signatures, and the snapshot
        // format uses "starts at column 0" to mean "new symbol" — a wrapped type
        // put 7 continuation lines at column 0, which the checker read as phantom
        // symbols. Two were a bare `}`, so they collided and silently swallowed
        // the members that followed.
        .replace(/\s*\n\s*/g, ' ')
        // Collapse runs of spaces left behind by a removed block comment
        // (#5972): `} /* why */ |` became `}  |`, a whitespace-only diff that
        // would defeat the whole point of stripping. Safe because a printed
        // type's internal spacing carries no meaning — the only thing that could
        // is a string-literal type containing consecutive spaces, and the
        // snapshot has zero of those.
        .replace(/ {2,}/g, ' ')
        .trim()
    )
  );
}

// ---------------------------------------------------------------------------
// Union member order (#6065)
// ---------------------------------------------------------------------------

/**
 * Sorts the members of every union in a printed type, at every nesting level.
 *
 * TypeScript prints a union's members in the order the checker interned them,
 * which is a function of what got resolved FIRST during extraction — not of
 * the source. Rendering real call signatures (#6061) resolved more types, and
 * four snapshot lines reordered with no change to their declared type:
 *
 *   -  readonly type: "review" | "plan" | "vote" | "code" | "test" | "report" | ...
 *   +  readonly type: "review" | "plan" | "vote" | "code" | "analysis" | "test" | ...
 *
 * Fourth instance of the class this file documents three times already
 * (absolute paths, object-member order, inline comments): a spurious diff on
 * untouched code trains people to regenerate the snapshot without reading it.
 *
 * WHY TEXT AND NOT `Type.getUnionTypes()`: the structural route cannot keep
 * the rest of the rendering byte-identical. The checker prints a union
 * THROUGH its alias when it has one (`Status | undefined`), while
 * `getUnionTypes()` hands back the flattened members (`"a" | "b" |
 * undefined`) with the alias gone — TypeScript tracks the alias origin in a
 * field ts-morph does not expose. It also splits `boolean` into `true | false`
 * and an enum into its members. Each of those rewrites lines whose member set
 * has not changed, which is the defect being fixed. A type-alias line is not
 * even a `Type`: `aliasLines` records `getTypeNode().getText()`, the
 * syntactic text, so a source reorder reached the snapshot through a path
 * that never had a `Type` in hand.
 *
 * So this is a small parser over the printed text. `|` is a union separator
 * only at bracket depth 0 of a TYPE context, and the scanner knows where it
 * is not one:
 *
 * - inside a `{}` `()` `<>` `[]` group — each group is split into its own
 *   segments (`;` members, `,` items) and every segment is its own context;
 * - inside a string or template literal (`"a|b"`);
 * - left of a depth-0 `:`, ` in `, ` extends `, ` is `, ` = ` or `=>` — that
 *   side is a member name, a constraint subject, a parameter list; only the
 *   right side is a type. `=>` splits at its LAST occurrence, the others at
 *   their first;
 * - anywhere in a conditional type (`X ? A | B : C`): a depth-0 `|` there
 *   belongs to one branch, so that level is left as printed and only its
 *   groups are descended into. Four snapshot lines, all zod signatures.
 *
 * `=>` is opaque to the bracket count, or the `>` of every arrow would close
 * a generic that was never opened. The existing `splitTopLevel` above has
 * exactly that bug (#6080) and is left alone here so that this change's
 * snapshot churn stays one kind of line.
 */
const OPENERS = '{(<[';
const CLOSERS = '})>]';

/** Index just past a string literal or `=>` starting at `i`; -1 if neither. */
function pastOpaque(text: string, i: number): number {
  const ch = text.charAt(i);
  if (ch === '=' && text.charAt(i + 1) === '>') return i + 2;
  if (ch !== '"' && ch !== "'" && ch !== '`') return -1;
  for (let j = i + 1; j < text.length; j++) {
    if (text.charAt(j) === '\\') j++;
    else if (text.charAt(j) === ch) return j + 1;
  }
  return text.length;
}

/** Splits on `sep` wherever it occurs at bracket depth 0, outside literals. */
function splitAtDepthZero(text: string, sep: string): string[] {
  const out: string[] = [];
  let start = 0;
  let depth = 0;
  let i = 0;
  while (i < text.length) {
    if (depth === 0 && text.startsWith(sep, i)) {
      out.push(text.slice(start, i));
      i += sep.length;
      start = i;
      continue;
    }
    const past = pastOpaque(text, i);
    if (past !== -1) {
      i = past;
      continue;
    }
    const ch = text.charAt(i);
    if (OPENERS.includes(ch)) depth++;
    else if (CLOSERS.includes(ch)) depth--;
    i++;
  }
  out.push(text.slice(start));
  return out;
}

/** Index of the closer matching the opener at `open`; -1 if unbalanced. */
function closerOf(text: string, open: number): number {
  let depth = 0;
  let i = open;
  while (i < text.length) {
    const past = pastOpaque(text, i);
    if (past !== -1) {
      i = past;
      continue;
    }
    const ch = text.charAt(i);
    if (OPENERS.includes(ch)) depth++;
    else if (CLOSERS.includes(ch) && --depth === 0) return i;
    i++;
  }
  return -1;
}

/** Copies `text` byte for byte, canonicalising the inside of every group. */
function descendIntoGroups(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const past = pastOpaque(text, i);
    if (past !== -1) {
      out += text.slice(i, past);
      i = past;
      continue;
    }
    const ch = text.charAt(i);
    const close = OPENERS.includes(ch) ? closerOf(text, i) : -1;
    if (close === -1) {
      out += ch;
      i++;
      continue;
    }
    out += `${ch}${canonicalGroup(text.slice(i + 1, close))}${text.charAt(close)}`;
    i = close + 1;
  }
  return out;
}

/** A group's inside: `;`-separated members, `,`-separated items, each a segment. */
function canonicalGroup(inner: string): string {
  return splitAtDepthZero(inner, ';')
    .map((member) => splitAtDepthZero(member, ',').map(canonicalSegment).join(','))
    .join(';');
}

/** `X ? A : B` — a depth-0 `|` here belongs to one branch, not the whole. */
function isConditional(text: string): boolean {
  return splitAtDepthZero(text, '? ').length > 1;
}

/** `name: type` (member, parameter, named tuple) or `K in type`; else a bare type. */
function canonicalSegment(text: string): string {
  if (isConditional(text)) return descendIntoGroups(text);
  for (const sep of [':', ' in ']) {
    const parts = splitAtDepthZero(text, sep);
    if (parts.length < 2) continue;
    return `${descendIntoGroups(parts[0] ?? '')}${sep}${canonicalType(parts.slice(1).join(sep))}`;
  }
  return canonicalType(text);
}

/**
 * Operators whose left side is not (or not only) the type being sorted. A
 * type-parameter default has a type on BOTH sides; the rest have a subject or
 * a parameter list on the left. `=>` splits at its last occurrence: the return
 * type of a curried function is the text after the final arrow.
 */
const TYPE_PREFIXES: ReadonlyArray<{ sep: string; last: boolean; headIsType: boolean }> = [
  { sep: ' = ', last: false, headIsType: true },
  { sep: '=>', last: true, headIsType: false },
  { sep: ' extends ', last: false, headIsType: false },
  { sep: ' is ', last: false, headIsType: false },
];

function canonicalType(text: string): string {
  if (isConditional(text)) return descendIntoGroups(text);
  for (const { sep, last, headIsType } of TYPE_PREFIXES) {
    const parts = splitAtDepthZero(text, sep);
    if (parts.length < 2) continue;
    const at = last ? parts.length - 1 : 1;
    const head = parts.slice(0, at).join(sep);
    const tail = parts.slice(at).join(sep);
    return `${headIsType ? canonicalType(head) : descendIntoGroups(head)}${sep}${canonicalType(tail)}`;
  }
  return sortUnionMembers(text);
}

/** Splits a type at its depth-0 `|`, sorts the members by text, rejoins with ` | `. */
function sortUnionMembers(text: string): string {
  const parts = splitAtDepthZero(text, '|');
  const members = parts.map((m) => m.trim()).filter((m) => m !== '');
  // Not a union — one member and no leading bar: copy the bytes as printed.
  if (parts.length < 2 && members.length < 2) return descendIntoGroups(text);
  const lead = text.slice(0, text.length - text.trimStart().length);
  const trail = text.slice(text.trimEnd().length);
  return `${lead}${members.map(descendIntoGroups).sort().join(' | ')}${trail}`;
}

/**
 * Sorts the members inside every `{ ... }` group of a printed type.
 *
 * TypeScript's type printer does not guarantee member ORDER for inferred
 * object/enum types, and the order shifts with unrelated edits: adding two
 * fields to `DevPipelineResult` reordered
 * `z.ZodEnum<{ error; partial; empty }>` to `{ error; empty; partial }` in a
 * completely different module. Same members, different text, spurious diff.
 *
 * That is the "gate that always fails" direction — a checker crying wolf on
 * untouched code teaches people to regenerate the snapshot without reading it,
 * which is worse than having no gate. Sorting makes the rendering canonical so
 * only real membership changes show.
 */
/** Index of the brace matching the one at `open`, or -1. */
function matchingBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return i;
  }
  return -1;
}

/** Splits on `;` that are not inside a nested group. */
function splitTopLevel(inner: string): string[] {
  const OPENERS = '{(<[';
  const CLOSERS = '})>]';
  const out: string[] = [];
  let buf = '';
  let nest = 0;
  for (const ch of inner) {
    if (OPENERS.includes(ch)) nest++;
    else if (CLOSERS.includes(ch)) nest--;
    if (ch === ';' && nest === 0) {
      out.push(buf.trim());
      buf = '';
    } else {
      buf += ch;
    }
  }
  out.push(buf.trim());
  return out.filter((m) => m !== '');
}

function sortTypeMembers(text: string): string {
  const open = text.indexOf('{');
  if (open === -1) return text;
  const close = matchingBrace(text, open);
  if (close === -1) return text;

  const sorted = splitTopLevel(text.slice(open + 1, close))
    .map(sortTypeMembers)
    .sort((a, b) => a.localeCompare(b));

  const body = sorted.length > 0 ? ` ${sorted.join('; ')}; ` : ' ';
  return `${text.slice(0, open + 1)}${body}${sortTypeMembers(text.slice(close))}`;
}

function propertyLines(node: Node): string[] {
  if (!Node.isInterfaceDeclaration(node) && !Node.isClassDeclaration(node)) return [];

  // Private/protected members are not API. Recording them made the gate fire on
  // renaming a private helper — an always-fails direction that trains people to
  // regenerate the snapshot without reading it. Interface members carry no
  // scope, so they are public by definition.
  const isPublic = (member: Node): boolean =>
    !Node.isScoped(member) || member.getScope() === Scope.Public;

  const props = node
    .getProperties()
    .filter((p) => isPublic(p))
    .map((prop) => {
      const optional = prop.hasQuestionToken() ? '?' : '';
      const readonly = prop.isReadonly() ? 'readonly ' : '';
      return `  ${readonly}${prop.getName()}${optional}: ${normalizeTypeText(prop.getType().getText(prop))}`;
    });

  const methods = node
    .getMethods()
    .filter((m) => isPublic(m))
    .map((m) => `  ${m.getName()}${normalizeTypeText(m.getType().getText(m))}`);

  // An interface whose only member is `[key: string]: unknown` recorded NOTHING,
  // so its shape could change with no diff. Same for accessors.
  const indexes = Node.isInterfaceDeclaration(node)
    ? // The declaration text ends in `;`, which is not part of the type; left
      // in, it became the last union member's text and moved mid-line when
      // that member did not sort last (`'a'; | unknown`).
      node
        .getIndexSignatures()
        .map((i) => `  ${normalizeTypeText(i.getText().replace(/;\s*$/, ''))}`)
    : [];
  const accessors = [
    ...node
      .getGetAccessors()
      .filter((a) => isPublic(a))
      .map((a) => `  get ${a.getName()}(): ${normalizeTypeText(a.getType().getText(a))}`),
    ...node
      .getSetAccessors()
      .filter((a) => isPublic(a))
      .map((a) => `  set ${a.getName()}`),
  ];

  return [...props, ...methods, ...indexes, ...accessors];
}

function aliasLines(node: Node): string[] {
  if (Node.isTypeAliasDeclaration(node)) {
    return [
      `  = ${normalizeTypeText(node.getTypeNode()?.getText() ?? node.getType().getText(node))}`,
    ];
  }
  if (Node.isEnumDeclaration(node)) {
    return node.getMembers().map((m) => `  ${m.getName()} = ${String(m.getValue())}`);
  }
  return [];
}

/**
 * Render ONE call signature as `(param: Type, …) => Return`.
 *
 * Parameters come from the DECLARATION (which knows `?` and `...`), the return
 * type from the SIGNATURE (which knows the inferred type when there is no
 * annotation). Neither source alone is sufficient.
 */
function callSignatureText(sig: Signature, node: Node): string {
  const params = sig.getParameters().map((p) => {
    const decl = p.getDeclarations()[0];
    const isParam = decl !== undefined && Node.isParameterDeclaration(decl);
    const rest = isParam && decl.isRestParameter() ? '...' : '';
    // A parameter with a default is optional to a CALLER even though it carries
    // no question token, so both forms are recorded as optional.
    const optional = isParam && (decl.isOptional() || decl.hasInitializer()) ? '?' : '';
    const type = normalizeTypeText(p.getTypeAtLocation(node).getText(node));
    return `${rest}${p.getName()}${optional}: ${type}`;
  });
  const ret = normalizeTypeText(sig.getReturnType().getText(node));
  return `(${params.join(', ')}) => ${ret}`;
}

/**
 * The recorded shape of an exported function or const.
 *
 * A FunctionDeclaration's own type resolves to `typeof <its own name>` — the
 * shortest valid rendering when the name is in scope — so the previous
 * `node.getType().getText(node)` recorded a string that was CONSTANT with
 * respect to the signature. Parameters, arity and return type were invisible for
 * all 461 exported functions, and the gate could not report any signature
 * change on any of them (#6061). Interface METHODS never had this problem: a
 * method's type has no name to collapse to, which is why the gate has caught
 * real changes elsewhere and this stayed hidden.
 *
 * Overloads are ALL recorded, in declaration order. Recording only the first
 * would trade one blind spot for a narrower one.
 */
function signatureLines(node: Node): string[] {
  if (!Node.isFunctionDeclaration(node) && !Node.isVariableDeclaration(node)) return [];
  const sigs = node.getType().getCallSignatures();
  // Not callable — an exported const whose type text is already meaningful.
  if (sigs.length === 0) return [`  : ${normalizeTypeText(node.getType().getText(node))}`];
  return sigs.map((sig) => `  : ${callSignatureText(sig, node)}`);
}

function memberLines(node: Node): string[] {
  return [...propertyLines(node), ...aliasLines(node), ...signatureLines(node)];
}

/**
 * Types named in an exported declaration, resolved to their own declarations.
 *
 * This is the whole point of the tool. `TaskResult.metadata: ResultMetadata`
 * prints as the bare name, so recording only the entry point's export list
 * would miss every change INSIDE `ResultMetadata` — which is exactly the #4744
 * miss this script exists to prevent. Reachability has to be followed, not
 * assumed from the export list.
 */
function referencedDeclarations(node: Node): Node[] {
  const found: Node[] = [];
  for (const ref of node.getDescendantsOfKind(SyntaxKind.TypeReference)) {
    const symbol = ref.getTypeName().getSymbol();
    if (symbol === undefined) continue;
    for (const decl of symbol.getDeclarations()) {
      // Only follow into this package's own source; node_modules and lib types
      // are not ours to version.
      if (decl.getSourceFile().getFilePath().includes('/packages/nexus-agents/src/')) {
        found.push(decl);
      }
    }
  }
  return found;
}

/**
 * Resolves an import specifier to what it actually names.
 *
 * `getExportedDeclarations` yields the re-export site as well as the real
 * declaration, so without this a symbol is recorded twice and its kind reads
 * `ImportSpecifier|InterfaceDeclaration`. Harmless noise on its own — an
 * ImportSpecifier contributes no members — but it puts a second entry under the
 * same name, which is how a genuine name collision would hide.
 */
function resolveAlias(decl: Node): Node {
  if (!Node.isImportSpecifier(decl) && !Node.isExportSpecifier(decl)) return decl;
  const aliased = decl.getSymbol()?.getAliasedSymbol()?.getDeclarations()[0];
  return aliased ?? decl;
}

/**
 * The package-relative module a declaration lives in, without extension.
 *
 * Declarations outside this package (a `@types` interface pulled in by a
 * reference) collapse to `external`, so a machine-specific path never reaches
 * the snapshot — the same hazard `normalizeTypeText` exists for.
 */
function originOf(decl: Node): string {
  const path = decl.getSourceFile().getFilePath();
  const marker = '/packages/nexus-agents/src/';
  const at = path.indexOf(marker);
  if (at === -1) return 'external';
  return path.slice(at + marker.length).replace(/\.tsx?$/, '');
}

/**
 * Declarations under one name IN ONE MODULE accumulate.
 *
 * Same-module accumulation is genuine TypeScript declaration merging — the
 * `const X = [...] as const` + `type X = (typeof X)[number]` idiom this repo
 * uses everywhere, plus interface/namespace merging and overloads. Those must
 * stay merged; they really are one symbol.
 *
 * Two declarations of one name in DIFFERENT modules are not that, and were
 * being merged all the same (#5224). Including the origin in the key separates
 * the two cases without special-casing either.
 */
function record(entries: Map<string, SurfaceEntry>, name: string, decl: Node): void {
  const kind = decl.getKindName();
  const origin = originOf(decl);
  const key = `${name}\u0000${origin}`;
  const existing = entries.get(key);
  const kinds =
    existing === undefined || existing.kind.includes(kind)
      ? (existing?.kind ?? kind)
      : `${existing.kind}|${kind}`;
  entries.set(key, {
    name,
    origin,
    kind: kinds,
    lines: [...(existing?.lines ?? []), ...memberLines(decl)],
  });
}

function enqueueReferences(
  queue: Array<{ name: string; decl: Node }>,
  seen: ReadonlySet<Node>,
  decl: Node
): void {
  for (const ref of referencedDeclarations(decl)) {
    if (seen.has(ref)) continue;
    const refName = Node.hasName(ref) ? ref.getName() : '';
    if (refName !== '') queue.push({ name: refName, decl: ref });
  }
}

/** Collects every symbol reachable from the entry point, transitively. */
export function extractSurface(entry: SourceFile): SurfaceEntry[] {
  const entries = new Map<string, SurfaceEntry>();
  const queue: Array<{ name: string; decl: Node }> = [];
  const seen = new Set<Node>();

  for (const [name, declarations] of entry.getExportedDeclarations()) {
    for (const decl of declarations) queue.push({ name, decl });
  }

  while (queue.length > 0) {
    const item = queue.pop();
    if (item === undefined) break;
    const { name, decl } = item;
    const resolved = resolveAlias(decl);
    if (seen.has(resolved)) continue;
    seen.add(resolved);

    // A generic type PARAMETER is not an exported symbol. It cannot be
    // imported, implemented or referenced by a consumer, so it can never be a
    // breaking change — yet `T`, `E`, `R` and friends were being recorded as
    // surface entries with no members, purely because the reference walk
    // reaches them.
    //
    // Harmless while every `T` in the tree fused into one bodiless line. Once
    // entries are keyed by origin (#5224) the same noise expands to one line
    // per module that happens to name a generic `T` — 13 entries became 42,
    // and 8 of the reported "colliding names" were type parameters rather
    // than ambiguous public types. Excluded here so the count means what it
    // says. Their references are still followed, so a constraint type that is
    // public only through `T extends Foo` still reaches the surface.
    if (!Node.isTypeParameterDeclaration(resolved)) record(entries, name, resolved);
    enqueueReferences(queue, seen, resolved);
  }

  return [...entries.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.origin.localeCompare(b.origin)
  );
}

/** Header line carrying the cross-module collision count. Read by the gate. */
export const COLLISION_HEADER = '# Cross-module name collisions: ';

/**
 * Names carried by declarations in more than one module.
 *
 * These are the entries the snapshot used to fuse. Exported so the gate can
 * ratchet the count and so the extractor can report them by name.
 */
export function collidingNames(entries: readonly SurfaceEntry[]): string[] {
  const origins = new Map<string, Set<string>>();
  for (const e of entries) {
    const set = origins.get(e.name) ?? new Set<string>();
    set.add(e.origin);
    origins.set(e.name, set);
  }
  return [...origins.entries()]
    .filter(([, o]) => o.size > 1)
    .map(([name]) => name)
    .sort((a, b) => a.localeCompare(b));
}

export function renderSurface(entries: readonly SurfaceEntry[]): string {
  // Only a COLLIDING name takes an origin suffix. Suffixing every entry would
  // rewrite all ~2400 lines and make a file move read as a symbol removal
  // everywhere; bounding it to the handful that actually collide keeps the
  // churn to those entries and leaves the rest byte-identical.
  const collisions = collidingNames(entries);
  const collided = new Set(collisions);
  const out: string[] = [
    '# Public API surface — generated by scripts/extract-api-surface.ts (#4749)',
    '# Do not edit by hand. Regenerate with: pnpm api:surface',
    `# Exported symbols: ${String(entries.length)}`,
    // A name declared in two modules is reported, not hidden (#5224). The
    // count may only go down: `check-api-surface.ts` fails when a change adds
    // one. It reaches zero when the underlying duplication (#5125, #5129) is
    // resolved, and the gate becomes a hard refusal at that point — but the
    // ratchet fires today, on the next collision introduced, not only then.
    `${COLLISION_HEADER}${String(collisions.length)}`,
    ...(collisions.length > 0 ? [`# Colliding names: ${collisions.join(', ')}`] : []),
    '',
  ];
  for (const e of entries) {
    out.push(collided.has(e.name) ? `${e.kind} ${e.name} @${e.origin}` : `${e.kind} ${e.name}`);
    // Members are sorted so a reordering in source is not a spurious diff.
    out.push(...[...e.lines].sort());
  }
  return out.join('\n') + '\n';
}

function main(): void {
  const project = new Project({ tsConfigFilePath: join(PKG, 'tsconfig.json') });
  const entry = project.getSourceFile(join(PKG, 'src', 'index.ts'));
  if (entry === undefined) {
    console.error('Cannot find packages/nexus-agents/src/index.ts');
    process.exit(1);
  }
  process.stdout.write(renderSurface(extractSurface(entry)));
}

if (process.argv[1]?.endsWith('extract-api-surface.ts') === true) main();
