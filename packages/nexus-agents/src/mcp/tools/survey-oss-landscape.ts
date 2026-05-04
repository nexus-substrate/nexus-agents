/**
 * nexus-agents/mcp - Survey OSS Landscape Tool
 *
 * Transient OSS project discovery: ranked candidate list with license,
 * last-commit, star-count, brief one-line summary. For one-off engineering
 * decisions (e.g., "should we adopt cargo-nextest?", "what catalog-aggregation
 * tools exist?").
 *
 * Differs from `research_discover` in three ways:
 *
 * 1. **Transient** — does NOT persist results to the research registry.
 *    `research_discover` is tied to the registry-add workflow; this tool is
 *    a query-and-discard primitive.
 * 2. **Engineering-decision shape** — output includes license (SPDX),
 *    pushed_at, and stars-as-number rather than the registry's tier-and-
 *    relevance abstraction.
 * 3. **SSRF-safe by construction** — the user-supplied input is a search
 *    query string, not a URL. Outbound URL is constructed from a fixed base
 *    (`https://api.github.com`) so an attacker cannot make us fetch
 *    arbitrary endpoints.
 *
 * v1 is GitHub-only. Codeberg + GitLab can be added as additional source
 * providers when there's demand (#2295 considerations).
 *
 * @module mcp/tools/survey-oss-landscape
 * (Source: Issue #2295, child of #2293)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger } from '../../core/index.js';
import { createLogger, formatZodError, type Result } from '../../core/index.js';
import { withToolError } from '../middleware/tool-error-handler.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import { fetchSource, type DiscoverError } from '../../cli/research-helpers-sources.js';
import { resolveToken } from '../../scm/token-resolver.js';
import {
  toolError,
  toolSuccessStructured,
  type ToolResult,
  type BaseMcpToolDeps,
} from './tool-result.js';

// =============================================================================
// Schemas
// =============================================================================

export const SurveyOssLandscapeInputSchema = z.object({
  query: z
    .string()
    .min(1)
    .max(200)
    .describe('Free-text search query, e.g. "cargo nextest replacement" or "OSS SBOM tools"'),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(10)
    .describe('Maximum candidates to return (1-50; default 10)'),
  minStars: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe('Minimum star count to include (default 0; useful for filtering noise)'),
  language: z
    .string()
    .max(50)
    .optional()
    .describe('GitHub language filter, e.g. "rust" or "typescript"'),
});

export type SurveyOssLandscapeInput = z.infer<typeof SurveyOssLandscapeInputSchema>;

/** Single candidate in the ranked output. */
export interface OssCandidate {
  /** Repository name without owner (e.g., "nextest"). */
  readonly name: string;
  /** Repository owner (e.g., "nextest-rs"). */
  readonly owner: string;
  /** Public URL for human review. */
  readonly url: string;
  /** Star count at time of search (sort key). */
  readonly stars: number;
  /** ISO 8601 timestamp of last push, or null if API didn't include it. */
  readonly lastCommitAt: string | null;
  /** SPDX license expression, or null if no recognized license. */
  readonly license: string | null;
  /** Primary language, or null if not specified. */
  readonly language: string | null;
  /** One-line description from the registry, or null if missing. */
  readonly description: string | null;
  /** Source provider that produced this candidate. */
  readonly source: 'github';
}

export interface SurveyOssLandscapeResponse {
  readonly query: string;
  readonly totalFound: number;
  readonly candidates: readonly OssCandidate[];
  readonly sourcesQueried: readonly string[];
  readonly sourcesFailed: readonly string[];
}

export type SurveyOssLandscapeDeps = BaseMcpToolDeps;

// =============================================================================
// GitHub provider
// =============================================================================

/** Subset of the GitHub repo search payload we map into OssCandidate. */
const GitHubRepoSchema = z.object({
  full_name: z.string().optional(),
  html_url: z.string().optional(),
  description: z.string().nullable().optional(),
  stargazers_count: z.number().optional(),
  pushed_at: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  license: z
    .object({
      spdx_id: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});

const GitHubSearchResponseSchema = z.object({
  total_count: z.number().optional(),
  items: z.array(GitHubRepoSchema).optional(),
});

/** Fixed base — never user-controlled. SSRF guard by construction. */
const GITHUB_SEARCH_BASE = 'https://api.github.com/search/repositories';

function buildGithubQuery(input: SurveyOssLandscapeInput): string {
  const parts: string[] = [input.query];
  if (input.language !== undefined && input.language.length > 0) {
    parts.push(`language:${input.language}`);
  }
  if (input.minStars > 0) {
    parts.push(`stars:>=${String(input.minStars)}`);
  }
  return parts.join(' ');
}

function splitFullName(fullName: string | undefined): { owner: string; name: string } {
  if (fullName === undefined) return { owner: '', name: '' };
  const idx = fullName.indexOf('/');
  if (idx === -1) return { owner: '', name: fullName };
  return { owner: fullName.slice(0, idx), name: fullName.slice(idx + 1) };
}

function parseCandidates(data: z.infer<typeof GitHubSearchResponseSchema>): {
  totalFound: number;
  candidates: OssCandidate[];
} {
  const items = data.items ?? [];
  const candidates: OssCandidate[] = items.map((repo) => {
    const { owner, name } = splitFullName(repo.full_name);
    return {
      name,
      owner,
      url: repo.html_url ?? '',
      stars: repo.stargazers_count ?? 0,
      lastCommitAt: repo.pushed_at ?? null,
      license: repo.license?.spdx_id ?? null,
      language: repo.language ?? null,
      description: repo.description ?? null,
      source: 'github' as const,
    };
  });
  return { totalFound: data.total_count ?? candidates.length, candidates };
}

async function fetchGithubCandidates(
  input: SurveyOssLandscapeInput,
  logger: ILogger
): Promise<Result<{ totalFound: number; candidates: OssCandidate[] }, DiscoverError>> {
  const query = encodeURIComponent(buildGithubQuery(input));
  const perPage = String(input.maxResults);
  const url = `${GITHUB_SEARCH_BASE}?q=${query}&sort=stars&order=desc&per_page=${perPage}`;

  // Authenticated: 5000 req/hr; unauthenticated: 60 req/hr.
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'nexus-agents',
  };
  const tokenResult = await resolveToken({ platform: 'github' });
  if (tokenResult.ok) {
    headers['Authorization'] = `Bearer ${tokenResult.value.value}`;
  } else {
    logger.debug('No GitHub token; using unauthenticated rate limit (60/hr)');
  }

  const fetchResult = await fetchSource({ url, source: 'github', headers });
  if (!fetchResult.ok) return fetchResult;

  let raw: unknown;
  try {
    raw = await fetchResult.value.json();
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'PARSE_ERROR',
        message: 'GitHub response is not valid JSON',
        source: 'github',
        cause: err,
      },
    };
  }
  const parsed = GitHubSearchResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'PARSE_ERROR',
        message: 'GitHub API response did not match the expected schema',
        source: 'github',
      },
    };
  }
  return { ok: true, value: parseCandidates(parsed.data) };
}

// =============================================================================
// Handler
// =============================================================================

async function executeSurvey(
  input: SurveyOssLandscapeInput,
  logger: ILogger
): Promise<SurveyOssLandscapeResponse> {
  const sourcesQueried = ['github'];
  const sourcesFailed: string[] = [];

  const githubResult = await fetchGithubCandidates(input, logger);
  if (!githubResult.ok) {
    logger.warn('GitHub source failed', {
      code: githubResult.error.code,
      message: githubResult.error.message,
    });
    sourcesFailed.push('github');
    return {
      query: input.query,
      totalFound: 0,
      candidates: [],
      sourcesQueried,
      sourcesFailed,
    };
  }
  return {
    query: input.query,
    totalFound: githubResult.value.totalFound,
    candidates: githubResult.value.candidates,
    sourcesQueried,
    sourcesFailed,
  };
}

function createSurveyHandler(deps: SurveyOssLandscapeDeps) {
  return async (args: unknown, ctx: HandlerContext): Promise<ToolResult> => {
    const validation = SurveyOssLandscapeInputSchema.safeParse(args);
    if (!validation.success) {
      return toolError(`Validation error: ${formatZodError(validation.error)}`);
    }
    const logger = deps.logger ?? createLogger({ tool: 'survey_oss_landscape' });
    ctx.logger.debug('Surveying OSS landscape', {
      query: validation.data.query,
      maxResults: validation.data.maxResults,
    });
    return withToolError('Survey failed', logger, async () => {
      const result = await executeSurvey(validation.data, logger);
      return toolSuccessStructured(result as unknown as Record<string, unknown>);
    });
  };
}

// =============================================================================
// Registration
// =============================================================================

const SURVEY_OUTPUT_SCHEMA = {
  query: z.string(),
  totalFound: z.number(),
  candidates: z.array(z.unknown()),
  sourcesQueried: z.array(z.string()),
  sourcesFailed: z.array(z.string()),
};

const SURVEY_DESCRIPTION =
  'Transient OSS project search. Returns a ranked list of GitHub repositories ' +
  'with license, last-commit, star-count, and one-line description. Does NOT ' +
  'persist to the research registry — use `research_add_source` for that. Best ' +
  'for one-off engineering decisions like "what tools exist in this space?".';

/**
 * Registers the survey_oss_landscape tool with the MCP server.
 *
 * @category MCP
 * @param server - MCP server instance
 * @param deps - Tool dependencies
 */
export function registerSurveyOssLandscapeTool(
  server: McpServer,
  deps: SurveyOssLandscapeDeps
): void {
  const logger = deps.logger ?? createLogger({ tool: 'survey_oss_landscape' });
  const secureHandler = createSecureHandler(createSurveyHandler(deps), {
    toolName: 'survey_oss_landscape',
    rateLimiter: deps.rateLimiter,
    logger,
  });
  const timeoutMs = getToolTimeout('survey_oss_landscape', deps.security);
  const wrappedHandler = wrapToolWithTimeout('survey_oss_landscape', secureHandler, {
    timeoutMs,
    logger,
  });
  server.registerTool(
    'survey_oss_landscape',
    {
      description: SURVEY_DESCRIPTION,
      inputSchema: SurveyOssLandscapeInputSchema.shape,
      outputSchema: SURVEY_OUTPUT_SCHEMA,
    },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered survey_oss_landscape tool');
}

// Test-only exports — explicit @internal so the public API surface stays small.
/** @internal */
export const _internal = {
  buildGithubQuery,
  splitFullName,
  parseCandidates,
  GITHUB_SEARCH_BASE,
};
