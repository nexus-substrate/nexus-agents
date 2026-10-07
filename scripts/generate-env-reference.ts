/**
 * Generate docs/reference/environment.md from the private env schema (#7200).
 * Reads the AST rather than exporting runtime validation internals; helper
 * validators and source comments remain the single source of reference data.
 * Usage: pnpm exec tsx scripts/generate-env-reference.ts [--check]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as ts from 'typescript';
import { ROOT } from './script-paths.js';

const SOURCE_PATH = 'packages/nexus-agents/src/config/env-schema.ts';
const OUTPUT_PATH = 'docs/reference/environment.md';

export interface EnvEntry {
  readonly name: string;
  readonly acceptedValues: string;
  readonly defaultValue: string;
  readonly description: string;
}

export interface EnvFamily {
  readonly prefix: string;
  readonly suffixes: string;
}

interface ValidatorInfo {
  acceptedValues: string;
  defaultValue: string;
  description: string;
}

/** Only literal metadata can be faithfully rendered without executing code. */
function literal(node: ts.Expression | undefined): string {
  if (node !== undefined && (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node))) {
    return node.text;
  }
  if (node?.kind === ts.SyntaxKind.TrueKeyword) return 'true';
  if (node?.kind === ts.SyntaxKind.FalseKeyword) return 'false';
  throw new Error('env-reference: metadata must be a string, number or boolean literal');
}

function refinementMessage(args: readonly ts.Expression[]): string {
  const options = args[1];
  if (options !== undefined && ts.isObjectLiteralExpression(options)) {
    for (const prop of options.properties) {
      if (ts.isPropertyAssignment(prop) && prop.name.getText() === 'message') {
        return ` (${literal(prop.initializer)})`;
      }
    }
  }
  return '';
}

/** Resolve the local helper constants and the schema's supported Zod chain. */
function validatorInfo(
  node: ts.Expression,
  declarations: ReadonlyMap<string, ts.Expression>,
  seen: ReadonlySet<string> = new Set()
): ValidatorInfo {
  if (ts.isIdentifier(node)) {
    const helper = declarations.get(node.text);
    if (helper === undefined || seen.has(node.text)) {
      throw new Error(`env-reference: unresolved or cyclic validator ${node.text}`);
    }
    return validatorInfo(helper, declarations, new Set([...seen, node.text]));
  }
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) {
    throw new Error(`env-reference: unsupported validator ${node.getText()}`);
  }
  const method = node.expression.name.text;
  const receiver = node.expression.expression;
  if (ts.isIdentifier(receiver) && receiver.text === 'z') {
    return baseValidator(method, node.arguments);
  }
  const info = validatorInfo(receiver, declarations, seen);
  return applyModifier(info, method, node.arguments);
}

function baseValidator(method: string, args: readonly ts.Expression[]): ValidatorInfo {
  let acceptedValues: string;
  if (method === 'enum') {
    const values = args[0];
    if (
      values === undefined ||
      !ts.isArrayLiteralExpression(values) ||
      values.elements.length === 0
    ) {
      throw new Error('env-reference: enum must have a nonempty literal value list');
    }
    acceptedValues = values.elements.map((value) => `\`${literal(value)}\``).join(' | ');
  } else if (method === 'literal') {
    acceptedValues = literal(args[0]);
  } else if (['string', 'number', 'boolean'].includes(method)) {
    acceptedValues = method;
  } else {
    throw new Error(`env-reference: unsupported Zod type ${method}`);
  }
  return {
    acceptedValues,
    defaultValue: 'Not declared in schema',
    description: 'Not described in schema',
  };
}

function applyModifier(
  info: ValidatorInfo,
  method: string,
  args: readonly ts.Expression[]
): ValidatorInfo {
  switch (method) {
    case 'optional':
      return info;
    case 'default':
      return { ...info, defaultValue: literal(args[0]) };
    case 'describe':
      return { ...info, description: literal(args[0]) };
    case 'regex': {
      const pattern = args[0];
      if (pattern === undefined || !ts.isRegularExpressionLiteral(pattern)) {
        throw new Error('env-reference: regex must be a literal');
      }
      return { ...info, acceptedValues: `${info.acceptedValues}; pattern ${pattern.text}` };
    }
    case 'refine':
    case 'superRefine':
      return {
        ...info,
        acceptedValues: `${info.acceptedValues}; custom validation${refinementMessage(args)}`,
      };
    default:
      throw new Error(`env-reference: unsupported Zod modifier ${method}`);
  }
}

function sourceDescription(
  prop: ts.PropertyAssignment,
  source: ts.SourceFile,
  next: ts.PropertyAssignment | undefined,
  names: ReadonlySet<string>
): string {
  // A comment over multiple keys is a group note, not the first key's description.
  if (next !== undefined) {
    const between = source.text.slice(prop.end, next.getStart(source));
    if (!/\r?\n[\t ]*\r?\n|\/\/\s*---/.test(between)) return '';
  }
  const comments = ts.getLeadingCommentRanges(source.text, prop.getFullStart()) ?? [];
  const adjacent: string[] = [];
  let nextStart = prop.getStart(source);
  for (const range of [...comments].reverse()) {
    if (/\n\s*\n/.test(source.text.slice(range.end, nextStart))) break;
    const comment = source.text
      .slice(range.pos, range.end)
      .replace(/^\/\/\s?/, '')
      .replace(/^\/\*\*?\s?|\*\/$/g, '')
      .replace(/^\s*\*\s?/gm, '');
    if (/^---/.test(comment)) break;
    adjacent.unshift(comment);
    nextStart = range.pos;
  }
  const description = adjacent.join(' ').replace(/\s+/g, ' ').trim();
  // Detached removal notes describe an absent entry, not the next live field.
  const removalNames = description.matchAll(
    /\bNEXUS_[A-Z0-9_]+\b(?=[`'"]?\s+(?:(?:was|is|were)\s+)?removed\b)/gi
  );
  return [...removalNames].some(([name]) => !names.has(name)) ? '' : description;
}

function declarationsIn(source: ts.SourceFile): Map<string, ts.Expression> {
  const declarations = new Map<string, ts.Expression>();
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer !== undefined) {
        declarations.set(declaration.name.text, declaration.initializer);
      }
    }
  }
  return declarations;
}

/** Empty or unparseable schemas are failures, never an apparently healthy page. */
export function parseEnvSchema(content: string): EnvEntry[] {
  const source = ts.createSourceFile('env-schema.ts', content, ts.ScriptTarget.Latest, true);
  const declarations = declarationsIn(source);
  const properties = schemaProperties(declarations.get('NexusEnvSchema'), source);
  const names = new Set(
    properties.map((prop) => prop.name.getText(source).replace(/^['"]|['"]$/g, ''))
  );
  return properties.map((prop, index) => {
    const info = validatorInfo(prop.initializer, declarations);
    const comment = sourceDescription(prop, source, properties[index + 1], names);
    return {
      name: prop.name.getText(source).replace(/^['"]|['"]$/g, ''),
      ...info,
      description:
        info.description === 'Not described in schema' && comment !== ''
          ? comment
          : info.description,
    };
  });
}

function schemaProperties(
  schema: ts.Expression | undefined,
  source: ts.SourceFile
): readonly ts.PropertyAssignment[] {
  if (
    schema === undefined ||
    !ts.isCallExpression(schema) ||
    schema.expression.getText(source) !== 'z.object' ||
    schema.arguments[0] === undefined ||
    !ts.isObjectLiteralExpression(schema.arguments[0])
  ) {
    throw new Error('env-reference: missing or unreadable NexusEnvSchema object');
  }
  if (schema.arguments[0].properties.length === 0) throw new Error('env-reference: empty schema');
  return schema.arguments[0].properties.map((prop) => {
    if (
      !ts.isPropertyAssignment(prop) ||
      (!ts.isIdentifier(prop.name) && !ts.isStringLiteral(prop.name))
    ) {
      throw new Error('env-reference: schema entries must be named property assignments');
    }
    return prop;
  });
}

/** Render suffix rules as source expressions without executing runtime imports. */
export function parseEnvFamilies(content: string): EnvFamily[] {
  const source = ts.createSourceFile('env-schema.ts', content, ts.ScriptTarget.Latest, true);
  const families = declarationsIn(source).get('DYNAMIC_FAMILIES');
  if (families === undefined || !ts.isArrayLiteralExpression(families)) {
    throw new Error('env-reference: missing or unreadable DYNAMIC_FAMILIES array');
  }
  // An explicit empty array declares that no runtime variable families exist.
  return families.elements.map((family) => {
    if (!ts.isObjectLiteralExpression(family)) throw new Error('env-reference: unreadable family');
    const fields = new Map(
      family.properties
        .filter(ts.isPropertyAssignment)
        .map((prop) => [prop.name.getText(source), prop.initializer])
    );
    const prefix = fields.get('prefix');
    const suffixes = fields.get('suffixes');
    if (
      prefix === undefined ||
      !ts.isStringLiteralLike(prefix) ||
      prefix.text === '' ||
      suffixes === undefined
    ) {
      throw new Error('env-reference: family requires a literal prefix and suffix rule');
    }
    return {
      prefix: prefix.text,
      suffixes: ts.isStringLiteralLike(suffixes) ? suffixes.text : suffixes.getText(source),
    };
  });
}

function escapeCell(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** Preserve source code spans while displaying prose punctuation literally. */
function escapeDescription(value: string): string {
  return escapeCell(value)
    .split(/(`[^`]*`)/g)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[*_]/g, '\\$&')
    )
    .join('');
}

export function renderEnvReference(
  entries: readonly EnvEntry[],
  families: readonly EnvFamily[] = []
): string {
  if (entries.length === 0) throw new Error('env-reference: empty schema');
  const rows = [...entries]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map(
      (entry) =>
        `| \`${escapeCell(entry.name)}\` | ${escapeCell(entry.acceptedValues)} | ${escapeCell(entry.defaultValue)} | ${escapeDescription(entry.description)} |`
    );
  return [
    '---',
    "title: 'Environment Variable Reference'",
    "description: 'Registered NEXUS environment variables, accepted values, schema defaults and descriptions.'",
    'diataxis: reference',
    'audience: user',
    'tier: 2',
    'keywords: [environment, configuration, reference]',
    `related_files: [${SOURCE_PATH}]`,
    '---',
    '',
    '# Environment Variable Reference',
    '',
    `> Generated from ${SOURCE_PATH} — do not edit by hand`,
    '',
    'Regenerate with `pnpm exec tsx scripts/generate-env-reference.ts`.',
    '',
    'This table describes the registered schema entries. All are optional. Schema',
    'defaults are shown only when declared with `.default()`; runtime defaults',
    'are defined by each consuming module. Descriptions come from `.describe()`',
    'or source comments. Custom validation may impose additional restrictions.',
    '',
    '| Name | Type / accepted values | Default | Description |',
    '| ---- | ---------------------- | ------- | ----------- |',
    ...rows,
    '',
    ...renderFamilies(families),
  ].join('\n');
}

function renderFamilies(families: readonly EnvFamily[]): string[] {
  const intro = [
    '## Variable families',
    '',
    'Family names combine a registered prefix with a suffix accepted by its source rule.',
    'Suffix expressions below are shown from `DYNAMIC_FAMILIES` without evaluation.',
    '',
  ];
  if (families.length === 0) return [...intro, 'No variable families registered.', ''];
  return [
    ...intro,
    '| Prefix | Suffix rule |',
    '| ------ | ----------- |',
    ...[...families]
      .sort((a, b) => (a.prefix < b.prefix ? -1 : a.prefix > b.prefix ? 1 : 0))
      .map((family) => `| \`${escapeCell(family.prefix)}\` | \`${escapeCell(family.suffixes)}\` |`),
    '',
  ];
}

function main(): void {
  const content = readFileSync(join(ROOT, SOURCE_PATH), 'utf8');
  const output = renderEnvReference(parseEnvSchema(content), parseEnvFamilies(content));
  const target = join(ROOT, OUTPUT_PATH);
  if (process.argv.includes('--check')) {
    if (!existsSync(target) || readFileSync(target, 'utf8') !== output) {
      console.error(
        `Environment reference drift: ${OUTPUT_PATH}. Run pnpm exec tsx scripts/generate-env-reference.ts`
      );
      process.exitCode = 1;
      return;
    }
    console.log('Environment reference up to date.');
    return;
  }
  mkdirSync(join(ROOT, 'docs/reference'), { recursive: true });
  writeFileSync(target, output, 'utf8');
  console.log(`Generated ${OUTPUT_PATH}`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
