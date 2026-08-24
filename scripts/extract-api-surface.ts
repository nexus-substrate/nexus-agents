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
import { Project, Node, SyntaxKind, type SourceFile } from 'ts-morph';
import { join } from 'node:path';

const PKG = join(process.cwd(), 'packages', 'nexus-agents');

/** Printed form of one exported declaration. */
interface SurfaceEntry {
  readonly name: string;
  readonly kind: string;
  readonly lines: readonly string[];
}

function propertyLines(node: Node): string[] {
  if (!Node.isInterfaceDeclaration(node) && !Node.isClassDeclaration(node)) return [];
  const lines = node.getProperties().map((prop) => {
    const optional = prop.hasQuestionToken() ? '?' : '';
    const readonly = prop.isReadonly() ? 'readonly ' : '';
    return `  ${readonly}${prop.getName()}${optional}: ${prop.getType().getText(prop)}`;
  });
  return [...lines, ...node.getMethods().map((m) => `  ${m.getName()}${m.getType().getText(m)}`)];
}

function aliasLines(node: Node): string[] {
  if (Node.isTypeAliasDeclaration(node)) {
    return [`  = ${node.getTypeNode()?.getText() ?? node.getType().getText(node)}`];
  }
  if (Node.isEnumDeclaration(node)) {
    return node.getMembers().map((m) => `  ${m.getName()} = ${String(m.getValue())}`);
  }
  return [];
}

function signatureLines(node: Node): string[] {
  if (Node.isFunctionDeclaration(node) || Node.isVariableDeclaration(node)) {
    return [`  : ${node.getType().getText(node)}`];
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
    if (seen.has(decl)) continue;
    seen.add(decl);

    record(entries, name, decl);
    enqueueReferences(queue, seen, decl);
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
