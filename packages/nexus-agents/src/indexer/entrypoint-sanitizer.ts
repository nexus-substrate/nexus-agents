/**
 * nexus-agents/indexer - Entrypoint Sanitization
 *
 * Value sanitization for entrypoint extraction to redact sensitive data.
 *
 * (Source: Epic #261 - Automated Documentation System)
 */

import type {
  CliCommandSpec,
  McpToolSpec,
  RestEndpointSpec,
  ParameterSpec,
  OptionSpec,
} from './entrypoint-types.js';

// ============================================================================
// Sanitization Patterns
// ============================================================================

/**
 * Tier 1: Value-only patterns - redact sensitive values.
 * These patterns match actual secrets/credentials that should never be exposed.
 */
const VALUE_PATTERNS: readonly RegExp[] = [
  /sk-[a-zA-Z0-9]{32,}/, // OpenAI API key (32+ chars)
  /sk-ant-[a-zA-Z0-9-]{95}/, // Anthropic API key
  /ghp_[a-zA-Z0-9]{36}/, // GitHub PAT
  /glpat-[a-zA-Z0-9-]{20}/, // GitLab PAT
  /Bearer [a-zA-Z0-9-_.]+/, // Bearer tokens
  /[a-f0-9]{32,}/, // Hex strings (potential secrets)
  /localhost:\d+/, // Local URLs
  /192\.168\.\d+\.\d+/, // Private IPs
  /10\.\d+\.\d+\.\d+/, // Private IPs
  /172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+/, // Private IPs
];

/**
 * Sanitizes a string value by redacting sensitive patterns.
 *
 * @param value - String to sanitize
 * @returns Sanitized string with sensitive values redacted
 */
export function sanitizeValue(value: string): string {
  let result = value;
  for (const pattern of VALUE_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}

/**
 * Sanitizes a parameter spec.
 */
export function sanitizeParameter(param: ParameterSpec): ParameterSpec {
  const sanitizedParam: ParameterSpec = {
    name: param.name,
    type: param.type,
  };
  if (param.description !== undefined && param.description !== '') {
    (sanitizedParam as { description: string }).description = sanitizeValue(param.description);
  }
  if (param.default !== undefined && param.default !== '') {
    (sanitizedParam as { default: string }).default = sanitizeValue(param.default);
  }
  if (param.required !== undefined) {
    (sanitizedParam as { required: boolean }).required = param.required;
  }
  return sanitizedParam;
}

/**
 * Sanitizes an option spec.
 */
export function sanitizeOption(opt: OptionSpec): OptionSpec {
  const sanitizedOpt: OptionSpec = {
    name: opt.name,
    type: opt.type,
  };
  if (opt.description !== undefined && opt.description !== '') {
    (sanitizedOpt as { description: string }).description = sanitizeValue(opt.description);
  }
  if (opt.default !== undefined && opt.default !== '') {
    (sanitizedOpt as { default: string }).default = sanitizeValue(opt.default);
  }
  if (opt.required !== undefined) {
    (sanitizedOpt as { required: boolean }).required = opt.required;
  }
  if (opt.short !== undefined && opt.short !== '') {
    (sanitizedOpt as { short: string }).short = opt.short;
  }
  return sanitizedOpt;
}

/**
 * Sanitizes a CLI command spec.
 */
export function sanitizeCommand(cmd: CliCommandSpec): CliCommandSpec {
  const result: CliCommandSpec = {
    name: cmd.name,
    description: sanitizeValue(cmd.description),
    source_file: cmd.source_file,
    source_line: cmd.source_line,
  };

  if (cmd.subcommands !== undefined) {
    (result as { subcommands: readonly string[] }).subcommands = cmd.subcommands;
  }

  if (cmd.options !== undefined) {
    const sanitizedOptions = cmd.options.map(sanitizeOption);
    (result as { options: readonly OptionSpec[] }).options = sanitizedOptions;
  }

  return result;
}

/**
 * Sanitizes an MCP tool spec.
 */
export function sanitizeTool(tool: McpToolSpec): McpToolSpec {
  const sanitizedParams = tool.parameters.map(sanitizeParameter);

  return {
    name: tool.name,
    description: sanitizeValue(tool.description),
    parameters: sanitizedParams,
    source_file: tool.source_file,
    source_line: tool.source_line,
  };
}

/**
 * Sanitizes a REST endpoint spec.
 */
export function sanitizeEndpoint(endpoint: RestEndpointSpec): RestEndpointSpec {
  const result: RestEndpointSpec = {
    method: endpoint.method,
    path: endpoint.path,
    description: sanitizeValue(endpoint.description),
    source_file: endpoint.source_file,
    source_line: endpoint.source_line,
  };

  if (endpoint.body_params !== undefined) {
    (result as { body_params: readonly ParameterSpec[] }).body_params =
      endpoint.body_params.map(sanitizeParameter);
  }

  if (endpoint.query_params !== undefined) {
    (result as { query_params: readonly ParameterSpec[] }).query_params =
      endpoint.query_params.map(sanitizeParameter);
  }

  return result;
}
