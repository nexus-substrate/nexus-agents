/**
 * Tests for entrypoint-rest-extractor.
 *
 * Covers: extractRestEndpoints (exported), and exercises internal helpers
 * via mock ts-morph objects.
 *
 * @module indexer/entrypoint-rest-extractor.test
 */
import { describe, it, expect } from 'vitest';
import { SyntaxKind } from 'ts-morph';
import { extractRestEndpoints } from './entrypoint-rest-extractor.js';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function asKindNode(kind: SyntaxKind, value: unknown) {
  return { getKind: () => kind, asKind: (k: unknown) => (k === kind ? value : undefined) };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function propAssign(name: string, initializer: unknown) {
  const pa = { getName: () => name, getInitializer: () => initializer };
  return {
    getKind: () => SyntaxKind.PropertyAssignment,
    asKind: (k: unknown) => (k === SyntaxKind.PropertyAssignment ? pa : undefined),
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function objLit(namedProps: Record<string, unknown>, allProps: unknown[] = []) {
  const self: Record<string, unknown> = {
    getKind: () => SyntaxKind.ObjectLiteralExpression,
    getProperty: (n: string) => namedProps[n],
    getProperties: () => allProps,
  };
  self['asKind'] = (k: unknown) => (k === SyntaxKind.ObjectLiteralExpression ? self : undefined);
  return self;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeBody(
  params: Array<{ name: string; type?: string; description?: string }>,
  required: string[] = []
) {
  const paramEntries = params.map((p) => {
    const innerNamed: Record<string, unknown> = {};
    const pType = p.type;
    if (pType !== undefined) {
      innerNamed['type'] = propAssign('type', { getText: () => `'${pType}'` });
    }
    const pDesc = p.description;
    if (pDesc !== undefined) {
      innerNamed['description'] = propAssign('description', {
        getText: () => `'${pDesc}'`,
      });
    }
    return propAssign(p.name, asKindNode(SyntaxKind.ObjectLiteralExpression, objLit(innerNamed)));
  });
  const named: Record<string, unknown> = {
    properties: propAssign(
      'properties',
      asKindNode(SyntaxKind.ObjectLiteralExpression, objLit({}, paramEntries))
    ),
  };
  if (required.length > 0) {
    const elements = required.map((n) => ({ getText: () => `'${n}'` }));
    named['required'] = propAssign(
      'required',
      asKindNode(SyntaxKind.ArrayLiteralExpression, { getElements: () => elements })
    );
  }
  return objLit(named);
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeSchemaArg(description?: string, bodyObj?: unknown) {
  const innerNamed: Record<string, unknown> = {};
  if (description !== undefined) {
    innerNamed['description'] = propAssign('description', {
      getText: () => `'${description}'`,
    });
  }
  if (bodyObj !== undefined) {
    innerNamed['body'] = propAssign(
      'body',
      asKindNode(SyntaxKind.ObjectLiteralExpression, bodyObj)
    );
  }
  const outer = objLit({
    schema: propAssign(
      'schema',
      asKindNode(SyntaxKind.ObjectLiteralExpression, objLit(innerNamed))
    ),
  });
  outer['getKind'] = () => SyntaxKind.ObjectLiteralExpression;
  return outer;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function handlerArg() {
  return { getKind: () => SyntaxKind.ArrowFunction, asKind: () => undefined, getText: () => '' };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeCall(method: string, path: string, secondArg?: unknown, line = 1) {
  return {
    getExpression: () => ({ getText: () => `fastify.${method}` }),
    getArguments: () => [
      { getText: () => `'${path}'`, getKind: () => SyntaxKind.StringLiteral },
      secondArg ?? handlerArg(),
    ],
    getStartLineNumber: () => line,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeSF(calls: unknown[], filePath: string) {
  return {
    getFilePath: () => filePath,
    getDescendantsOfKind: (k: unknown) => (k === SyntaxKind.CallExpression ? calls : []),
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function run(files: unknown[], pkgRoot = '/pkg', routesPath = 'src/api/routes') {
  return extractRestEndpoints({ getSourceFiles: () => files } as never, pkgRoot, routesPath);
}

describe('extractRestEndpoints', () => {
  describe('basic endpoint extraction', () => {
    it('should extract a GET endpoint', () => {
      const result = run([
        makeSF([makeCall('get', '/api/health')], '/pkg/src/api/routes/health.ts'),
      ]);
      expect(result).toHaveLength(1);
      expect(result[0]?.method).toBe('GET');
      expect(result[0]?.path).toBe('/api/health');
    });

    it('should extract a POST endpoint', () => {
      const result = run([
        makeSF([makeCall('post', '/api/tasks')], '/pkg/src/api/routes/tasks.ts'),
      ]);
      expect(result).toHaveLength(1);
      expect(result[0]?.method).toBe('POST');
    });

    it('should extract PUT, DELETE, and PATCH endpoints', () => {
      const calls = [makeCall('put', '/x'), makeCall('delete', '/x'), makeCall('patch', '/x')];
      const result = run([makeSF(calls, '/pkg/src/api/routes/items.ts')]);
      expect(result).toHaveLength(3);
      expect(result.map((r) => r.method)).toEqual(
        expect.arrayContaining(['PUT', 'DELETE', 'PATCH'])
      );
    });

    it('should extract multiple endpoints from one file', () => {
      const calls = [makeCall('get', '/u', undefined, 10), makeCall('post', '/u', undefined, 30)];
      const result = run([makeSF(calls, '/pkg/src/api/routes/users.ts')]);
      expect(result).toHaveLength(2);
    });

    it('should extract endpoints from multiple files', () => {
      const result = run([
        makeSF([makeCall('get', '/api/a')], '/pkg/src/api/routes/a.ts'),
        makeSF([makeCall('get', '/api/b')], '/pkg/src/api/routes/b.ts'),
      ]);
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.path)).toContain('/api/a');
      expect(result.map((r) => r.path)).toContain('/api/b');
    });

    it('should record source_line from the call expression', () => {
      const result = run([
        makeSF([makeCall('get', '/x', undefined, 42)], '/pkg/src/api/routes/x.ts'),
      ]);
      expect(result[0]?.source_line).toBe(42);
    });
  });

  describe('description extraction', () => {
    it('should use default description when schema arg is not an object', () => {
      const result = run([makeSF([makeCall('get', '/api/health')], '/pkg/src/api/routes/h.ts')]);
      expect(result[0]?.description).toBe('GET /api/health');
    });

    it('should extract description from schema', () => {
      const schema = makeSchemaArg('Check system health');
      const result = run([
        makeSF([makeCall('get', '/api/health', schema)], '/pkg/src/api/routes/h.ts'),
      ]);
      expect(result[0]?.description).toBe('Check system health');
    });

    it('should fallback to default when schema has no description', () => {
      const schema = makeSchemaArg(undefined);
      const result = run([
        makeSF([makeCall('post', '/api/tasks', schema)], '/pkg/src/api/routes/t.ts'),
      ]);
      expect(result[0]?.description).toBe('POST /api/tasks');
    });
  });

  describe('body parameter extraction', () => {
    it('should extract body params for POST endpoint', () => {
      const body = makeBody([{ name: 'task', type: 'string', description: 'The task' }], ['task']);
      const result = run([
        makeSF([makeCall('post', '/t', makeSchemaArg('Run', body))], '/pkg/src/api/routes/t.ts'),
      ]);
      expect(result[0]?.body_params).toHaveLength(1);
      expect(result[0]?.body_params?.[0]?.name).toBe('task');
      expect(result[0]?.body_params?.[0]?.required).toBe(true);
    });

    it('should extract body params for PUT endpoint', () => {
      const body = makeBody([{ name: 'name', type: 'string' }]);
      const result = run([
        makeSF([makeCall('put', '/i', makeSchemaArg('U', body))], '/pkg/src/api/routes/i.ts'),
      ]);
      expect(result[0]?.body_params).toHaveLength(1);
      expect(result[0]?.body_params?.[0]?.name).toBe('name');
    });

    it('should extract body params for PATCH endpoint', () => {
      const body = makeBody([{ name: 'status', type: 'string' }]);
      const result = run([
        makeSF([makeCall('patch', '/i', makeSchemaArg('P', body))], '/pkg/src/api/routes/i.ts'),
      ]);
      expect(result[0]?.body_params).toHaveLength(1);
    });

    it('should NOT extract body params for GET endpoint', () => {
      const body = makeBody([{ name: 'filter', type: 'string' }]);
      const result = run([
        makeSF([makeCall('get', '/i', makeSchemaArg('L', body))], '/pkg/src/api/routes/i.ts'),
      ]);
      expect(result[0]?.body_params).toBeUndefined();
    });

    it('should NOT extract body params for DELETE endpoint', () => {
      const body = makeBody([{ name: 'force', type: 'boolean' }]);
      const result = run([
        makeSF([makeCall('delete', '/i', makeSchemaArg('D', body))], '/pkg/src/api/routes/i.ts'),
      ]);
      expect(result[0]?.body_params).toBeUndefined();
    });

    it('should mark required params correctly', () => {
      const body = makeBody(
        [
          { name: 'task', type: 'string' },
          { name: 'timeout', type: 'number' },
        ],
        ['task']
      );
      const result = run([
        makeSF([makeCall('post', '/r', makeSchemaArg('R', body))], '/pkg/src/api/routes/r.ts'),
      ]);
      const params = result[0]?.body_params ?? [];
      expect(params.find((p) => p.name === 'task')?.required).toBe(true);
      expect(params.find((p) => p.name === 'timeout')?.required).toBe(false);
    });

    it('should extract param type from schema', () => {
      const body = makeBody([{ name: 'count', type: 'number' }]);
      const result = run([
        makeSF([makeCall('post', '/t', makeSchemaArg('T', body))], '/pkg/src/api/routes/t.ts'),
      ]);
      expect(result[0]?.body_params?.[0]?.type).toBe('number');
    });

    it('should extract param description from schema', () => {
      const body = makeBody([{ name: 'q', type: 'string', description: 'Search query' }]);
      const result = run([
        makeSF([makeCall('post', '/s', makeSchemaArg('S', body))], '/pkg/src/api/routes/s.ts'),
      ]);
      expect(result[0]?.body_params?.[0]?.description).toBe('Search query');
    });

    it('should default param type to string when not specified', () => {
      const body = makeBody([{ name: 'data' }]);
      const result = run([
        makeSF([makeCall('post', '/t', makeSchemaArg('T', body))], '/pkg/src/api/routes/t.ts'),
      ]);
      expect(result[0]?.body_params?.[0]?.type).toBe('string');
    });

    it('should not include body_params when body has no properties', () => {
      const result = run([
        makeSF(
          [makeCall('post', '/e', makeSchemaArg('E', objLit({})))],
          '/pkg/src/api/routes/e.ts'
        ),
      ]);
      expect(result[0]?.body_params).toBeUndefined();
    });

    it('should handle multiple params with multiple required fields', () => {
      const body = makeBody(
        [
          { name: 'a', type: 'string' },
          { name: 'b', type: 'number' },
          { name: 'c', type: 'boolean' },
        ],
        ['a', 'c']
      );
      const result = run([
        makeSF([makeCall('post', '/m', makeSchemaArg('M', body))], '/pkg/src/api/routes/m.ts'),
      ]);
      const params = result[0]?.body_params ?? [];
      expect(params).toHaveLength(3);
      expect(params.find((p) => p.name === 'a')?.required).toBe(true);
      expect(params.find((p) => p.name === 'b')?.required).toBe(false);
      expect(params.find((p) => p.name === 'c')?.required).toBe(true);
    });
  });

  describe('file filtering', () => {
    it('should skip test files', () => {
      expect(run([makeSF([makeCall('get', '/t')], '/pkg/src/api/routes/h.test.ts')])).toHaveLength(
        0
      );
    });

    it('should skip index.ts', () => {
      expect(run([makeSF([makeCall('get', '/a')], '/pkg/src/api/routes/index.ts')])).toHaveLength(
        0
      );
    });
  });

  describe('non-route call expressions', () => {
    it('should skip calls that do not match HTTP methods', () => {
      const call = {
        getExpression: () => ({ getText: () => 'fastify.register' }),
        getArguments: () => [handlerArg(), handlerArg()],
        getStartLineNumber: () => 1,
      };
      expect(run([makeSF([call], '/pkg/src/api/routes/plugin.ts')])).toHaveLength(0);
    });

    it('should skip calls with less than 2 arguments', () => {
      const call = {
        getExpression: () => ({ getText: () => 'fastify.get' }),
        getArguments: () => [{ getText: () => "'/api/x'" }],
        getStartLineNumber: () => 1,
      };
      expect(run([makeSF([call], '/pkg/src/api/routes/x.ts')])).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should return empty array when no route files exist', () => {
      expect(run([])).toEqual([]);
    });

    it('should handle schema arg that is not ObjectLiteralExpression', () => {
      const nonObj = { getKind: () => SyntaxKind.Identifier, asKind: () => undefined };
      const call = {
        getExpression: () => ({ getText: () => 'fastify.get' }),
        getArguments: () => [{ getText: () => "'/api/ref'" }, nonObj],
        getStartLineNumber: () => 5,
      };
      const result = run([makeSF([call], '/pkg/src/api/routes/ref.ts')]);
      expect(result).toHaveLength(1);
      expect(result[0]?.description).toBe('GET /api/ref');
    });

    it('should handle schema without schema property', () => {
      const empty = objLit({});
      empty['getKind'] = () => SyntaxKind.ObjectLiteralExpression;
      const result = run([
        makeSF([makeCall('get', '/api/ns', empty)], '/pkg/src/api/routes/ns.ts'),
      ]);
      expect(result).toHaveLength(1);
      expect(result[0]?.description).toBe('GET /api/ns');
    });

    it('should set source_file as a string', () => {
      const result = run([makeSF([makeCall('get', '/r')], '/pkg/src/api/routes/r.ts')]);
      expect(result[0]?.source_file).toBeDefined();
      expect(typeof result[0]?.source_file).toBe('string');
    });

    it('should strip quotes from route path', () => {
      const result = run([makeSF([makeCall('get', '/api/quoted')], '/pkg/src/api/routes/q.ts')]);
      expect(result[0]?.path).toBe('/api/quoted');
    });

    it('should handle file with no matching call expressions', () => {
      expect(run([makeSF([], '/pkg/src/api/routes/empty.ts')])).toHaveLength(0);
    });

    it('should handle case-insensitive method matching', () => {
      const call = {
        getExpression: () => ({ getText: () => 'fastify.Get' }),
        getArguments: () => [{ getText: () => "'/api/ci'" }, handlerArg()],
        getStartLineNumber: () => 1,
      };
      const result = run([makeSF([call], '/pkg/src/api/routes/ci.ts')]);
      expect(result).toHaveLength(1);
      expect(result[0]?.method).toBe('GET');
    });
  });
});
