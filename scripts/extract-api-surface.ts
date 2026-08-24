#!/usr/bin/env npx tsx
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
import { Project, Node, Scope, SyntaxKind, type SourceFile } from 'ts-morph';
import { join } from 'node:path';

const PKG = join(process.cwd(), 'packages', 'nexus-agents');

/** Printed form of one exported declaration. */
interface SurfaceEntry {
  readonly name: string;
  readonly kind: string;
  readonly lines: readonly string[];
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
function normalizeTypeText(text: string): string {
  return (
    text
      .replace(/import\("[^"]*\/packages\/nexus-agents\/src\/([^"]*)"\)/g, 'import("src/$1")')
      // Collapse to ONE line. ts-morph wraps long signatures, and the snapshot
      // format uses "starts at column 0" to mean "new symbol" — a wrapped type
      // put 7 continuation lines at column 0, which the checker read as phantom
      // symbols. Two were a bare `}`, so they collided and silently swallowed
      // the members that followed.
      .replace(/\s*\n\s*/g, ' ')
      .trim()
  );
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
    ? node.getIndexSignatures().map((i) => `  ${normalizeTypeText(i.getText())}`)
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

function signatureLines(node: Node): string[] {
  if (Node.isFunctionDeclaration(node) || Node.isVariableDeclaration(node)) {
    return [`  : ${normalizeTypeText(node.getType().getText(node))}`];
  }
  return [];
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

/** Multiple declarations under one name (overloads, merged decls) accumulate. */
function record(entries: Map<string, SurfaceEntry>, name: string, decl: Node): void {
  const kind = decl.getKindName();
  const existing = entries.get(name);
  const kinds =
    existing === undefined || existing.kind.includes(kind)
      ? (existing?.kind ?? kind)
      : `${existing.kind}|${kind}`;
  entries.set(name, {
    name,
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

    record(entries, name, resolved);
    enqueueReferences(queue, seen, resolved);
  }

  return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function renderSurface(entries: readonly SurfaceEntry[]): string {
  const out: string[] = [
    '# Public API surface — generated by scripts/extract-api-surface.ts (#4749)',
    '# Do not edit by hand. Regenerate with: pnpm api:surface',
    `# Exported symbols: ${String(entries.length)}`,
    '',
  ];
  for (const e of entries) {
    out.push(`${e.kind} ${e.name}`);
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
