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
 */
export function extractMcpTools(
  project: Project,
  packageRoot: string,
  mcpToolsPath: string
): McpToolSpec[] {
  const tools: McpToolSpec[] = [];
  const toolsDir = path.join(packageRoot, mcpToolsPath);

  // Get all TypeScript files in the tools directory
  const toolFiles = project.getSourceFiles(`${toolsDir}/*.ts`);

  for (const sourceFile of toolFiles) {
    const filePath = sourceFile.getFilePath();
    const fileName = path.basename(filePath);

    // Skip test files and index
    if (fileName.endsWith('.test.ts') || fileName === 'index.ts') continue;

    const relativePath = path.relative(process.cwd(), filePath);
    const extractedTools = extractToolsFromFile(sourceFile, relativePath);
    tools.push(...extractedTools);
  }

  return tools;
}

/**
 * Extracts tools from a single source file.
 */
function extractToolsFromFile(
  sourceFile: ReturnType<Project['getSourceFile']>,
  relativePath: string
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

    // Extract tool name (first string argument)
    const nameArg = args[0];
    if (nameArg === undefined) continue;
    const toolName = nameArg.getText().replace(/['"]/g, '');

    // Extract description and schema based on call type
    const { description, schemaArg } = extractToolMeta(callText, args, sourceFile);

    // Extract parameters from schema
    let parameters: ParameterSpec[] = [];
    if (schemaArg !== undefined) {
      parameters = extractParametersFromSchema(schemaArg, sourceFile);
    }

    tools.push({
      name: toolName,
      description: description.replace(/\\n/g, ' ').trim(),
      parameters,
      source_file: relativePath,
      source_line: callExpr.getStartLineNumber(),
    });
  }

  return tools;
}

/**
 * Extracts tool metadata (description and schema) from arguments.
 */
// eslint-disable-next-line complexity -- AST traversal requires nested conditions
function extractToolMeta(
  callText: string,
  args: Node[],
  _sourceFile: ReturnType<Project['getSourceFile']>
): { description: string; schemaArg: Node | undefined } {
  let description = '';
  let schemaArg: Node | undefined;

  if (callText.endsWith('.registerTool')) {
    // registerTool(name, { description, inputSchema }, handler)
    const configArg = args[1];
    if (configArg !== undefined) {
      const configObj = configArg.asKind(SyntaxKind.ObjectLiteralExpression);
      if (configObj !== undefined) {
        const descProp = configObj.getProperty('description');
        if (descProp !== undefined) {
          const propAssign = descProp.asKind(SyntaxKind.PropertyAssignment);
          const init = propAssign?.getInitializer();
          description = init?.getText().replace(/^['"]|['"]$/g, '') ?? '';
        }
        const schemaProp = configObj.getProperty('inputSchema');
        if (schemaProp !== undefined) {
          const propAssign = schemaProp.asKind(SyntaxKind.PropertyAssignment);
          schemaArg = propAssign?.getInitializer();
        }
      }
    }
  } else {
    // server.tool(name, description, schema, handler)
    const descArg = args[1];
    if (descArg !== undefined) {
      description = descArg.getText().replace(/^['"]|['"]$/g, '');
    }
    schemaArg = args[2];
  }

  return { description, schemaArg };
}

/**
 * Extracts parameters from a schema argument.
 */
function extractParametersFromSchema(
  schemaArg: Node,
  sourceFile: ReturnType<Project['getSourceFile']>
): ParameterSpec[] {
  // Handle both inline objects and variable references
  if (schemaArg.getKind() === SyntaxKind.ObjectLiteralExpression) {
    return extractZodParameters(schemaArg);
  }

  if (schemaArg.getKind() === SyntaxKind.Identifier && sourceFile !== undefined) {
    // Look up the variable
    const varName = schemaArg.getText();
    const varDecl = sourceFile.getVariableDeclaration(varName);
    if (varDecl !== undefined) {
      const init = varDecl.getInitializer();
      if (init !== undefined) {
        return extractZodParameters(init);
      }
    }
  }

  return [];
}
