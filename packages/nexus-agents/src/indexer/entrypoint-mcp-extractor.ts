/**
 * nexus-agents/indexer - MCP Tool Extractor
 *
 * Extracts MCP tools from source code using TypeScript AST parsing.
 *
 * (Source: Epic #261 - Automated Documentation System)
 */

import { SyntaxKind, type Project, type Node } from 'ts-morph';
import * as path from 'node:path';
import type { McpToolSpec, ParameterSpec } from './entrypoint-types.js';

// ============================================================================
// Zod Parameter Extraction
// ============================================================================

/**
 * Infers the type from a Zod schema expression.
 */
function inferZodType(zodExpr: string): string {
  if (zodExpr.includes('z.string()')) return 'string';
  if (zodExpr.includes('z.number()')) return 'number';
  if (zodExpr.includes('z.boolean()')) return 'boolean';
  if (zodExpr.includes('z.array(')) return 'array';
  if (zodExpr.includes('z.record(')) return 'object';
  if (zodExpr.includes('z.object(')) return 'object';
  if (zodExpr.includes('z.enum(')) return 'enum';
  return 'unknown';
}

/**
 * Extracts parameters from a Zod schema object literal.
 */
// eslint-disable-next-line complexity -- AST traversal requires nested conditions
function extractZodParameters(schemaObj: Node): ParameterSpec[] {
  const params: ParameterSpec[] = [];

  const objLiteral = schemaObj.asKind(SyntaxKind.ObjectLiteralExpression);
  if (objLiteral === undefined) return params;

  for (const prop of objLiteral.getProperties()) {
    const propAssign = prop.asKind(SyntaxKind.PropertyAssignment);
    if (propAssign === undefined) continue;

    const paramName = propAssign.getName().replace(/['"]/g, '');
    const paramValue = propAssign.getInitializer();
    if (paramValue === undefined) continue;

    const paramText = paramValue.getText();
    const spec: ParameterSpec = {
      name: paramName,
      type: inferZodType(paramText),
    };

    // Extract description from .describe()
    const describeMatch = paramText.match(/\.describe\(['"]([^'"]+)['"]\)/);
    const descVal = describeMatch?.[1];
    if (descVal !== undefined && descVal !== '') {
      (spec as { description: string }).description = descVal;
    }

    // Check if optional
    (spec as { required: boolean }).required = !paramText.includes('.optional()');

    // Extract default
    const defaultMatch = paramText.match(/\.default\(([^)]+)\)/);
    const defaultVal = defaultMatch?.[1];
    if (defaultVal !== undefined && defaultVal !== '') {
      (spec as { default: string }).default = defaultVal;
    }

    params.push(spec);
  }

  return params;
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Extracts MCP tools from the tools directory.
 *
 * @param project - ts-morph Project providing the parsed source files
 * @param packageRoot - Absolute path to the package root
 * @param mcpToolsPath - Path to the MCP tools directory to scan
 * @param warnings - Optional sink for non-fatal diagnostics (e.g. the tools
 *   directory glob matched zero files — a repeat-offender silent-failure
 *   class that shipped the `cli_commands: []` regression for 3 months before
 *   #2147 caught it). When supplied, the extractor pushes actionable
 *   messages here rather than silently returning an empty result (#2153).
 */
export function extractMcpTools(
  project: Project,
  packageRoot: string,
  mcpToolsPath: string,
  warnings?: string[]
): McpToolSpec[] {
  const tools: McpToolSpec[] = [];
  const toolsDir = path.join(packageRoot, mcpToolsPath);

  // Get all TypeScript files in the tools directory
  const toolFiles = project.getSourceFiles(`${toolsDir}/*.ts`);

  if (toolFiles.length === 0 && warnings !== undefined) {
    warnings.push(
      `MCP tool extraction: glob "${toolsDir}/*.ts" matched zero files. ` +
        `Check that the path exists and is included in the ts-morph project.`
    );
  }

  for (const sourceFile of toolFiles) {
    const filePath = sourceFile.getFilePath();
    const fileName = path.basename(filePath);

    // Skip test files and index
    if (fileName.endsWith('.test.ts') || fileName === 'index.ts') continue;

    const relativePath = path.relative(process.cwd(), filePath);
    const extractedTools = extractToolsFromFile(sourceFile, relativePath, warnings);
    tools.push(...extractedTools);
  }

  return tools;
}

/**
 * Extracts tools from a single source file.
 */
function extractToolsFromFile(
  sourceFile: ReturnType<Project['getSourceFile']>,
  relativePath: string,
  warnings?: string[]
): McpToolSpec[] {
  const tools: McpToolSpec[] = [];
  if (sourceFile === undefined) return tools;

  // Look for server.tool() or server.registerTool() calls
  const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

  for (const callExpr of callExpressions) {
    const callText = callExpr.getExpression().getText();

    // Match server.tool() or server.registerTool()
    if (!callText.endsWith('.tool') && !callText.endsWith('.registerTool')) continue;

    const args = callExpr.getArguments();
    if (args.length < 2) continue;

    // Extract tool name (first string argument).
    //
    // Reject non-literal first arguments — Proxy/wrapper modules forward
    // calls like `target.registerTool(name, ...)` where `name` is a
    // parameter, not a tool identifier. Accepting those produces spurious
    // tools named "name". See #2148.
    const nameArg = args[0];
    if (nameArg === undefined) continue;
    const nameKind = nameArg.getKind();
    if (
      nameKind !== SyntaxKind.StringLiteral &&
      nameKind !== SyntaxKind.NoSubstitutionTemplateLiteral
    ) {
      continue;
    }
    const toolName = nameArg.getText().replace(/['"`]/g, '');

    // Extract description and schema based on call type
    const { description, schemaArg } = extractToolMeta(callText, args);

    // Extract parameters from schema
    let parameters: ParameterSpec[] = [];
    if (schemaArg !== undefined) {
      parameters = extractParametersFromSchema(schemaArg);
    }

    const tool: McpToolSpec = {
      name: toolName,
      description: description.replace(/\\n/g, ' ').trim(),
      parameters,
      source_file: relativePath,
      source_line: callExpr.getStartLineNumber(),
    };
    maybeWarnEmptyTool(tool, warnings);
    tools.push(tool);
  }

  return tools;
}

/**
 * Pushes a warning when a tool resolved to BOTH an empty description and zero
 * parameters. This is the silent-empty class (#2153): the extractor produced a
 * tool entry, but every metadata field failed to resolve — almost always an
 * identifier reference (`{ description }` / `inputSchema: toolSchema`) declared
 * outside this file, or a schema shape the extractor cannot read statically.
 */
function maybeWarnEmptyTool(tool: McpToolSpec, warnings?: string[]): void {
  if (warnings === undefined) return;
  if (tool.description !== '' || tool.parameters.length > 0) return;
  warnings.push(
    `MCP tool "${tool.name}" (${tool.source_file}:${String(tool.source_line)}) ` +
      `resolved to an empty description AND empty parameters. Its description/` +
      `inputSchema likely reference an identifier the extractor could not ` +
      `resolve statically (#2153).`
  );
}

/**
 * Resolves an identifier's binding to the initializer of its variable
 * declaration, searching ALL enclosing scopes (function bodies, blocks) via the
 * type-checker symbol — not just top-level declarations.
 *
 * The dominant tool pattern declares `const description = ...` /
 * `const toolSchema = ...` INSIDE the `registerXTool(...)` function, so the
 * prior `sourceFile.getVariableDeclaration(name)` (top-level only) never
 * resolved them and shipped empty metadata (#2153).
 */
function resolveIdentifierInitializer(symbol: ReturnType<Node['getSymbol']>): Node | undefined {
  for (const decl of symbol?.getDeclarations() ?? []) {
    const varDecl = decl.asKind(SyntaxKind.VariableDeclaration);
    const init = varDecl?.getInitializer();
    if (init !== undefined) return init;
  }
  return undefined;
}

/**
 * Resolves a property's initializer value, handling both PropertyAssignment
 * (`inputSchema: toolSchema`, `description: 'literal'`) and
 * ShorthandPropertyAssignment (`{ description }`). Bare identifier references
 * are resolved to their declaration's initializer from the enclosing scope.
 */
function resolvePropertyValue(prop: Node): Node | undefined {
  const propAssign = prop.asKind(SyntaxKind.PropertyAssignment);
  if (propAssign !== undefined) {
    const init = propAssign.getInitializer();
    if (init?.getKind() === SyntaxKind.Identifier) {
      return resolveIdentifierInitializer(init.getSymbol());
    }
    return init;
  }

  const shorthand = prop.asKind(SyntaxKind.ShorthandPropertyAssignment);
  if (shorthand !== undefined) {
    return resolveIdentifierInitializer(shorthand.getValueSymbol());
  }
  return undefined;
}

/**
 * Reads a statically-resolvable string value from a node: string/template
 * literals and `'a' + 'b'` concatenations (the common multi-line description
 * shape). Returns '' for anything the extractor cannot resolve statically.
 */
function extractStringValue(node: Node | undefined): string {
  if (node === undefined) return '';
  const kind = node.getKind();
  if (kind === SyntaxKind.StringLiteral || kind === SyntaxKind.NoSubstitutionTemplateLiteral) {
    return node.asKind(kind)?.getLiteralText() ?? '';
  }
  if (kind === SyntaxKind.BinaryExpression) {
    const bin = node.asKind(SyntaxKind.BinaryExpression);
    if (bin?.getOperatorToken().getKind() === SyntaxKind.PlusToken) {
      return extractStringValue(bin.getLeft()) + extractStringValue(bin.getRight());
    }
  }
  return '';
}

/**
 * Extracts tool metadata (description and schema) from arguments.
 */

function extractToolMeta(
  callText: string,
  args: Node[]
): { description: string; schemaArg: Node | undefined } {
  if (callText.endsWith('.registerTool')) {
    // registerTool(name, { description, inputSchema }, handler)
    return extractRegisterToolMeta(args[1]);
  }

  // server.tool(name, description, schema, handler)
  return {
    description: extractStringValue(args[1]),
    schemaArg: args[2],
  };
}

/**
 * Extracts description + schema from a `registerTool` config object literal.
 */
function extractRegisterToolMeta(configArg: Node | undefined): {
  description: string;
  schemaArg: Node | undefined;
} {
  const configObj = configArg?.asKind(SyntaxKind.ObjectLiteralExpression);
  if (configObj === undefined) return { description: '', schemaArg: undefined };

  const descProp = configObj.getProperty('description');
  const description =
    descProp === undefined ? '' : extractStringValue(resolvePropertyValue(descProp));

  const schemaProp = configObj.getProperty('inputSchema');
  const schemaArg = schemaProp === undefined ? undefined : resolvePropertyValue(schemaProp);

  return { description, schemaArg };
}

/**
 * Extracts parameters from a schema argument.
 */
function extractParametersFromSchema(schemaArg: Node): ParameterSpec[] {
  // Handle both inline objects and variable references
  if (schemaArg.getKind() === SyntaxKind.ObjectLiteralExpression) {
    return extractZodParameters(schemaArg);
  }

  if (schemaArg.getKind() === SyntaxKind.Identifier) {
    // Resolve the identifier from its enclosing scope (not just top-level).
    const init = resolveIdentifierInitializer(schemaArg.getSymbol());
    if (init !== undefined) {
      return extractZodParameters(init);
    }
  }

  return [];
}
