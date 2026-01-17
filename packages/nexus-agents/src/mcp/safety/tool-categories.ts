/**
 * nexus-agents/mcp/safety - Tool Categories
 *
 * Tool category classification for MCP tools.
 */

// =============================================================================
// Tool Category Enum
// =============================================================================

/**
 * Categories of MCP tools based on their primary function.
 */
export enum ToolCategory {
  FILE_READ = 'file_read',
  FILE_WRITE = 'file_write',
  FILE_DELETE = 'file_delete',
  SHELL_EXECUTE = 'shell_execute',
  NETWORK_REQUEST = 'network_request',
  DATABASE_QUERY = 'database_query',
  DATABASE_MODIFY = 'database_modify',
  AUTHENTICATION = 'authentication',
  ORCHESTRATION = 'orchestration',
  MEMORY = 'memory',
  UNKNOWN = 'unknown',
}

// =============================================================================
// Classification Patterns
// =============================================================================

/**
 * Patterns used to classify tools by name.
 */
const TOOL_CLASSIFICATION_PATTERNS: ReadonlyArray<{
  category: ToolCategory;
  patterns: readonly RegExp[];
}> = [
  {
    category: ToolCategory.FILE_READ,
    patterns: [/^read_?file/i, /^get_?file/i, /^load_?file/i, /^cat$/i, /^head$/i, /^tail$/i],
  },
  {
    category: ToolCategory.FILE_WRITE,
    patterns: [/^write_?file/i, /^save_?file/i, /^create_?file/i, /^edit_?file/i, /^append/i],
  },
  {
    category: ToolCategory.FILE_DELETE,
    patterns: [/^delete_?file/i, /^remove_?file/i, /^rm$/i, /^unlink/i],
  },
  {
    category: ToolCategory.SHELL_EXECUTE,
    patterns: [/^bash$/i, /^shell$/i, /^exec/i, /^run_?command/i, /^execute/i, /^spawn/i],
  },
  {
    category: ToolCategory.NETWORK_REQUEST,
    patterns: [/^fetch/i, /^http/i, /^curl$/i, /^wget$/i, /^request/i, /^api_?call/i],
  },
  {
    category: ToolCategory.DATABASE_QUERY,
    patterns: [/^query/i, /^select/i, /^find/i, /^search/i, /^read_?db/i],
  },
  {
    category: ToolCategory.DATABASE_MODIFY,
    patterns: [/^insert/i, /^update/i, /^delete_?db/i, /^drop/i, /^alter/i, /^create_?table/i],
  },
  {
    category: ToolCategory.AUTHENTICATION,
    patterns: [/^auth/i, /^login/i, /^logout/i, /^token/i, /^credential/i, /^password/i],
  },
  {
    category: ToolCategory.ORCHESTRATION,
    patterns: [/^orchestrate/i, /^delegate/i, /^create_?expert/i, /^run_?workflow/i, /^agent/i],
  },
  {
    category: ToolCategory.MEMORY,
    patterns: [/^memory/i, /^store/i, /^retrieve/i, /^cache/i, /^session/i],
  },
];

// =============================================================================
// Classification Functions
// =============================================================================

/**
 * Classifies a tool into a category based on its name.
 */
export function classifyTool(toolName: string): ToolCategory {
  const lowerName = toolName.toLowerCase();

  for (const { category, patterns } of TOOL_CLASSIFICATION_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(lowerName)) {
        return category;
      }
    }
  }

  return ToolCategory.UNKNOWN;
}

/**
 * Returns all categories that apply to a tool (some tools span categories).
 */
export function classifyToolMultiple(toolName: string): readonly ToolCategory[] {
  const categories: ToolCategory[] = [];
  const lowerName = toolName.toLowerCase();

  for (const { category, patterns } of TOOL_CLASSIFICATION_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(lowerName)) {
        categories.push(category);
        break;
      }
    }
  }

  return categories.length > 0 ? categories : [ToolCategory.UNKNOWN];
}
