/**
 * nexus-agents/indexer - REST Endpoint Extractor
 *
 * Extracts REST endpoints from source code using TypeScript AST parsing.
 *
 * (Source: Epic #261 - Automated Documentation System)
 */

import { SyntaxKind, type Project, type Node } from 'ts-morph';
import * as path from 'node:path';
import type { RestEndpointSpec, ParameterSpec } from './entrypoint-types.js';

// ============================================================================
// JSON Schema Parameter Extraction
// ============================================================================

/**
 * Extracts parameters from a JSON Schema object literal.
 */
function extractJsonSchemaParams(schemaObj: Node): ParameterSpec[] {
  const params: ParameterSpec[] = [];

  const objLiteral = schemaObj.asKind(SyntaxKind.ObjectLiteralExpression);
  if (objLiteral === undefined) return params;

  // Look for properties definition
  const propertiesProp = objLiteral.getProperty('properties');
  if (propertiesProp === undefined) return params;

  const propsObj = propertiesProp
    .asKind(SyntaxKind.PropertyAssignment)
    ?.getInitializer()
    ?.asKind(SyntaxKind.ObjectLiteralExpression);
  if (propsObj === undefined) return params;

  // Get required fields
  const requiredFields = extractRequiredFields(objLiteral);

  // Extract each property
  for (const prop of propsObj.getProperties()) {
    const param = extractParameterFromProperty(prop, requiredFields);
    if (param !== undefined) {
      params.push(param);
    }
  }

  return params;
}

/**
 * Extracts required field names from a JSON Schema object.
 */
function extractRequiredFields(objLiteral: Node): Set<string> {
  const requiredFields = new Set<string>();

  const obj = objLiteral.asKind(SyntaxKind.ObjectLiteralExpression);
  if (obj === undefined) return requiredFields;

  const requiredProp = obj.getProperty('required');
  if (requiredProp === undefined) return requiredFields;

  const requiredArr = requiredProp
    .asKind(SyntaxKind.PropertyAssignment)
    ?.getInitializer()
    ?.asKind(SyntaxKind.ArrayLiteralExpression);

  if (requiredArr !== undefined) {
    for (const elem of requiredArr.getElements()) {
      requiredFields.add(elem.getText().replace(/['"]/g, ''));
    }
  }

  return requiredFields;
}

/**
 * Extracts a parameter spec from a property assignment.
 */
// eslint-disable-next-line complexity -- AST traversal requires nested conditions
function extractParameterFromProperty(
  prop: Node,
  requiredFields: Set<string>
): ParameterSpec | undefined {
  const propAssign = prop.asKind(SyntaxKind.PropertyAssignment);
  if (propAssign === undefined) return undefined;

  const paramName = propAssign.getName().replace(/['"]/g, '');
  const propValue = propAssign.getInitializer()?.asKind(SyntaxKind.ObjectLiteralExpression);
  if (propValue === undefined) return undefined;

  const spec: ParameterSpec = {
    name: paramName,
    type: 'string',
    required: requiredFields.has(paramName),
  };

  // Extract type
  const typeProp = propValue.getProperty('type');
  if (typeProp !== undefined) {
    const typeValue = typeProp
      .asKind(SyntaxKind.PropertyAssignment)
      ?.getInitializer()
      ?.getText()
      .replace(/['"]/g, '');
    if (typeValue !== undefined && typeValue !== '') {
      (spec as { type: string }).type = typeValue;
    }
  }

  // Extract description
  const descProp = propValue.getProperty('description');
  if (descProp !== undefined) {
    const descValue = descProp
      .asKind(SyntaxKind.PropertyAssignment)
      ?.getInitializer()
      ?.getText()
      .replace(/^['"]|['"]$/g, '');
    if (descValue !== undefined && descValue !== '') {
      (spec as { description: string }).description = descValue;
    }
  }

  return spec;
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Extracts REST endpoints from route files.
 */
export function extractRestEndpoints(
  project: Project,
  packageRoot: string,
  restRoutesPath: string
): RestEndpointSpec[] {
  const endpoints: RestEndpointSpec[] = [];
  const routesDir = path.join(packageRoot, restRoutesPath);

  // Get all TypeScript files in the routes directory
  const routeFiles = project.getSourceFiles(`${routesDir}/*.ts`);

  for (const sourceFile of routeFiles) {
    const filePath = sourceFile.getFilePath();
    const fileName = path.basename(filePath);

    // Skip test files and index
    if (fileName.endsWith('.test.ts') || fileName === 'index.ts') continue;

    const relativePath = path.relative(process.cwd(), filePath);
    const extractedEndpoints = extractEndpointsFromFile(sourceFile, relativePath);
    endpoints.push(...extractedEndpoints);
  }

  return endpoints;
}

/**
 * Extracts endpoints from a single source file.
 */
function extractEndpointsFromFile(
  sourceFile: ReturnType<Project['getSourceFile']>,
  relativePath: string
): RestEndpointSpec[] {
  const endpoints: RestEndpointSpec[] = [];
  if (sourceFile === undefined) return endpoints;

  // Look for fastify.get(), fastify.post(), etc.
  const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

  for (const callExpr of callExpressions) {
    const callText = callExpr.getExpression().getText();

    // Match fastify HTTP method calls
    const methodMatch = callText.match(/\.(get|post|put|delete|patch)$/i);
    if (methodMatch === null) continue;

    const method = methodMatch[1]?.toUpperCase();
    if (method === undefined) continue;

    const endpoint = extractEndpointFromCall(callExpr, method, relativePath);
    if (endpoint !== undefined) {
      endpoints.push(endpoint);
    }
  }

  return endpoints;
}

/**
 * Extracts an endpoint spec from a call expression.
 */
function extractEndpointFromCall(
  callExpr: Node,
  method: string,
  relativePath: string
): RestEndpointSpec | undefined {
  const typedCall = callExpr as unknown as {
    getArguments(): Node[];
    getStartLineNumber(): number;
  };
  const args = typedCall.getArguments();
  if (args.length < 2) return undefined;

  // Extract path (first argument)
  const pathArgNode = args[0];
  if (pathArgNode === undefined) return undefined;
  const pathArg = pathArgNode.getText().replace(/['"]/g, '');

  // Extract description and body params from schema
  const { description, bodyParams } = extractEndpointMeta(args, method, pathArg);

  const endpointSpec: RestEndpointSpec = {
    method,
    path: pathArg,
    description,
    source_file: relativePath,
    source_line: typedCall.getStartLineNumber(),
  };

  if (bodyParams.length > 0) {
    (endpointSpec as { body_params: readonly ParameterSpec[] }).body_params = bodyParams;
  }

  return endpointSpec;
}

/**
 * Extracts endpoint metadata (description and body params) from arguments.
 */
// eslint-disable-next-line complexity, max-lines-per-function -- AST traversal requires nested conditions
function extractEndpointMeta(
  args: Node[],
  method: string,
  pathArg: string
): { description: string; bodyParams: ParameterSpec[] } {
  let description = `${method} ${pathArg}`;
  let bodyParams: ParameterSpec[] = [];

  const schemaArg = args[1];
  if (schemaArg === undefined) {
    return { description, bodyParams };
  }

  if (schemaArg.getKind() !== SyntaxKind.ObjectLiteralExpression) {
    return { description, bodyParams };
  }

  const schemaObj = schemaArg.asKind(SyntaxKind.ObjectLiteralExpression);
  if (schemaObj === undefined) {
    return { description, bodyParams };
  }

  // Get schema property
  const schemaProp = schemaObj.getProperty('schema');
  if (schemaProp === undefined) {
    return { description, bodyParams };
  }

  const schemaValue = schemaProp
    .asKind(SyntaxKind.PropertyAssignment)
    ?.getInitializer()
    ?.asKind(SyntaxKind.ObjectLiteralExpression);

  if (schemaValue === undefined) {
    return { description, bodyParams };
  }

  // Extract description
  const descProp = schemaValue.getProperty('description');
  if (descProp !== undefined) {
    const descValue = descProp
      .asKind(SyntaxKind.PropertyAssignment)
      ?.getInitializer()
      ?.getText()
      .replace(/^['"]|['"]$/g, '');
    if (descValue !== undefined && descValue !== '') {
      description = descValue;
    }
  }

  // Extract body parameters for POST/PUT/PATCH
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    const bodyProp = schemaValue.getProperty('body');
    if (bodyProp !== undefined) {
      const bodyObj = bodyProp
        .asKind(SyntaxKind.PropertyAssignment)
        ?.getInitializer()
        ?.asKind(SyntaxKind.ObjectLiteralExpression);
      if (bodyObj !== undefined) {
        bodyParams = extractJsonSchemaParams(bodyObj);
      }
    }
  }

  return { description, bodyParams };
}
