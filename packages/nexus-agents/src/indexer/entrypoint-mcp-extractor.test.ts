/**
 * Tests for entrypoint-mcp-extractor.
 *
 * Focused on the string-literal check for tool names (#2148) — prior to the
 * fix, Proxy/wrapper modules that forwarded `registerTool(name, ...)` calls
 * produced spurious tools named "name" in the extracted manifest.
 *
 * @module indexer/entrypoint-mcp-extractor.test
 */

import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { extractMcpTools } from './entrypoint-mcp-extractor.js';

/**
 * Builds an in-memory ts-morph project with a single virtual source file
 * under a synthetic tools directory. Returns the project and the tools dir
 * path so `extractMcpTools` can be called directly.
 */
function makeProject(fileName: string, source: string): { project: Project; toolsDir: string } {
  const toolsDir = '/virtual/mcp-tools';
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(`${toolsDir}/${fileName}`, source);
  return { project, toolsDir };
}

describe('extractMcpTools', () => {
  describe('string-literal tool-name check (#2148)', () => {
    it('skips registerTool calls where the name arg is a parameter identifier (proxy/wrapper pattern)', () => {
      // Matches the real annotation-proxy.ts / tool-observability-proxy.ts
      // shape: Proxy forwards the call, so the first arg is a parameter
      // `name` not a string literal. Must NOT produce a "name" tool.
      const source = `
        import type { ToolCallback, ToolConfig } from '@modelcontextprotocol/sdk';
        type Target = { registerTool(name: string, config: ToolConfig, cb: ToolCallback): unknown };
        export function makeProxy(target: Target): Target {
          return new Proxy(target, {
            get(t, prop, receiver) {
              if (prop === 'registerTool') {
                return (name: string, config: ToolConfig, cb: ToolCallback): unknown => {
                  return target.registerTool(name, config, cb);
                };
              }
              return Reflect.get(t, prop, receiver);
            },
          });
        }
      `;
      const { project, toolsDir } = makeProject('proxy.ts', source);
      const tools = extractMcpTools(project, '/', toolsDir);
      expect(tools.find((t) => t.name === 'name')).toBeUndefined();
    });

    it('still extracts real tools with string-literal names', () => {
      const source = `
        server.registerTool('real_tool', {
          description: 'A real tool',
          inputSchema: { query: z.string() },
        }, async () => ({ content: [] }));
      `;
      const { project, toolsDir } = makeProject('real-tool.ts', source);
      const tools = extractMcpTools(project, '/', toolsDir);
      expect(tools.find((t) => t.name === 'real_tool')).toBeDefined();
    });

    it('accepts both single-quoted and double-quoted string-literal names', () => {
      const source = `
        server.tool("double_quoted", 'description', { x: z.string() }, async () => {});
        server.tool('single_quoted', 'description', { y: z.string() }, async () => {});
      `;
      const { project, toolsDir } = makeProject('quotes.ts', source);
      const tools = extractMcpTools(project, '/', toolsDir);
      const names = tools.map((t) => t.name);
      expect(names).toContain('double_quoted');
      expect(names).toContain('single_quoted');
    });

    it('skips tool names passed via template literal interpolation (dynamic)', () => {
      // Template with substitution (TemplateExpression) isn't a literal, so
      // skip. Only NoSubstitutionTemplateLiteral (backtick with no ${})
      // is literal-equivalent and accepted.
      const source = `
        const prefix = 'foo';
        server.registerTool(\`\${prefix}_tool\`, { description: 'x', inputSchema: {} }, async () => {});
      `;
      const { project, toolsDir } = makeProject('dynamic.ts', source);
      const tools = extractMcpTools(project, '/', toolsDir);
      expect(tools).toHaveLength(0);
    });
  });

  describe('empty-glob warning channel (#2153)', () => {
    it('pushes a warning when the tools directory glob matches zero files', () => {
      // Create a project with NO files in the tools dir — repro for the
      // 3-month silent regression class (#2147) at this layer.
      const project = new Project({ useInMemoryFileSystem: true });
      const warnings: string[] = [];
      const tools = extractMcpTools(project, '/', '/nonexistent/tools', warnings);
      expect(tools).toHaveLength(0);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatch(/matched zero files/);
      expect(warnings[0]).toContain('/nonexistent/tools');
    });

    it('omits the warning when warnings array is not provided (backwards compat)', () => {
      const project = new Project({ useInMemoryFileSystem: true });
      // Call without the warnings parameter — must not throw.
      expect(() => extractMcpTools(project, '/', '/nonexistent/tools')).not.toThrow();
    });

    it('does not push a warning when the glob matches files (happy path)', () => {
      const source = `server.tool('real', 'desc', {}, async () => {});`;
      const { project, toolsDir } = makeProject('real.ts', source);
      const warnings: string[] = [];
      extractMcpTools(project, '/', toolsDir, warnings);
      expect(warnings).toHaveLength(0);
    });
  });
});
