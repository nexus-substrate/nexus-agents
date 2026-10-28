/**
 * Validate captured GitHub GraphQL Dependabot alert pages for release review.
 *
 * The validator has no network or authentication behavior. Its result is
 * limited to state counts and caller-supplied provenance for the accessible
 * connection; it cannot establish GitHub-wide completeness.
 *
 * @module scripts/check-dependabot-inventory
 */

import { z } from 'zod';
import {
  DEPENDABOT_ALERT_STATES,
  parseContext,
  type DependabotAlertState,
  type DependabotEvidenceContext,
  type DependabotInventoryAssessment,
  type DependabotInventoryStatus,
} from './dependabot-inventory-context.js';

const MAX_PAGE_COUNT = 1_000;
const MAX_EDGES_PER_PAGE = 100;
export const MAX_INPUT_BYTES = 5 * 1024 * 1024;

const cursorSchema = z.string().min(1).max(2_048);
const graphQlPageSchema = z.object({
  errors: z.array(z.unknown()).optional(),
  data: z.object({
    repository: z.object({
      vulnerabilityAlerts: z.object({
        edges: z
          .array(
            z.object({
              cursor: cursorSchema,
              node: z.object({
                id: z.string().min(1).max(200),
                state: z.string().min(1).max(40),
              }),
            })
          )
          .max(MAX_EDGES_PER_PAGE),
        totalCount: z.number().int().nonnegative(),
        pageInfo: z.object({
          hasNextPage: z.boolean(),
          startCursor: cursorSchema.nullable(),
          endCursor: cursorSchema.nullable(),
        }),
      }),
    }),
  }),
});

type GraphQlPage = z.infer<typeof graphQlPageSchema>;

interface ParsedPages {
  readonly pages: readonly GraphQlPage[] | null;
  readonly pageCount: number;
  readonly findings: readonly string[];
}

interface PageAnalysis {
  readonly details: Pick<
    DependabotInventoryAssessment,
    'pageCount' | 'reportedTotal' | 'returnedAlerts' | 'uniqueAlerts' | 'openCount' | 'stateCounts'
  >;
  readonly findings: readonly string[];
  readonly hasUnknownState: boolean;
}

const emptyStateCounts = (): Record<DependabotAlertState, number> => ({
  OPEN: 0,
  FIXED: 0,
  DISMISSED: 0,
  AUTO_DISMISSED: 0,
});

function isDependabotAlertState(value: string): value is DependabotAlertState {
  return DEPENDABOT_ALERT_STATES.includes(value as DependabotAlertState);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasGraphQlErrors(value: unknown): boolean {
  return isRecord(value) && Array.isArray(value.errors) && value.errors.length > 0;
}

function parsePages(input: unknown): ParsedPages {
  if (!Array.isArray(input) || input.length === 0) {
    return { pages: null, pageCount: 0, findings: ['empty_or_missing_page_list'] };
  }
  if (input.length > MAX_PAGE_COUNT) {
    return { pages: null, pageCount: input.length, findings: ['page_limit_exceeded'] };
  }

  const pages: GraphQlPage[] = [];
  for (const inputPage of input) {
    if (hasGraphQlErrors(inputPage)) {
      return { pages: null, pageCount: input.length, findings: ['graphql_errors'] };
    }
    const parsed = graphQlPageSchema.safeParse(inputPage);
    if (!parsed.success) {
      return { pages: null, pageCount: input.length, findings: ['malformed_or_partial_page'] };
    }
    pages.push(parsed.data);
  }
  return { pages, pageCount: pages.length, findings: [] };
}

function checkPageContinuation(hasNextPage: boolean, index: number, pageCount: number): string[] {
  const findings: string[] = [];
  const shouldHaveNextPage = index < pageCount - 1;
  if (hasNextPage !== shouldHaveNextPage) {
    findings.push(hasNextPage ? 'truncated_pagination' : 'pagination_continuation_mismatch');
  }
  return findings;
}

type GraphQlEdge = GraphQlPage['data']['repository']['vulnerabilityAlerts']['edges'][number];
type GraphQlPageInfo = GraphQlPage['data']['repository']['vulnerabilityAlerts']['pageInfo'];

function checkEmptyPageCursors(pageInfo: GraphQlPageInfo): string[] {
  const findings: string[] = [];
  if (pageInfo.startCursor !== null || pageInfo.endCursor !== null)
    findings.push('empty_page_cursor_mismatch');
  if (pageInfo.hasNextPage) findings.push('empty_page_claims_continuation');
  return findings;
}

function checkNonEmptyPageCursors(
  edges: readonly GraphQlEdge[],
  pageInfo: GraphQlPageInfo,
  seenPageCursors: Set<string>
): string[] {
  const findings: string[] = [];
  const firstCursor = edges[0]?.cursor;
  const lastCursor = edges.at(-1)?.cursor;
  if (pageInfo.startCursor !== firstCursor || pageInfo.endCursor !== lastCursor) {
    findings.push('page_info_cursor_mismatch');
  }
  const pageBoundaryCursors = new Set([pageInfo.startCursor, pageInfo.endCursor]);
  for (const cursor of pageBoundaryCursors) {
    if (cursor === null) continue;
    if (seenPageCursors.has(cursor)) findings.push('duplicate_page_cursor');
    seenPageCursors.add(cursor);
  }
  return findings;
}

function checkPageBoundaryCursors(
  edges: readonly GraphQlEdge[],
  pageInfo: GraphQlPageInfo,
  seenPageCursors: Set<string>
): string[] {
  return edges.length === 0
    ? checkEmptyPageCursors(pageInfo)
    : checkNonEmptyPageCursors(edges, pageInfo, seenPageCursors);
}

function checkPageCursors(
  page: GraphQlPage,
  index: number,
  pageCount: number,
  seenPageCursors: Set<string>
): string[] {
  const { edges, pageInfo } = page.data.repository.vulnerabilityAlerts;
  return [
    ...checkPageContinuation(pageInfo.hasNextPage, index, pageCount),
    ...checkPageBoundaryCursors(edges, pageInfo, seenPageCursors),
  ];
}

function countPageEdges(
  page: GraphQlPage,
  requestedState: DependabotAlertState | null,
  stateCounts: Record<DependabotAlertState, number>,
  seenAlertIds: Set<string>,
  seenEdgeCursors: Set<string>
): { readonly hasUnknownState: boolean; readonly findings: readonly string[] } {
  let hasUnknownState = false;
  const findings: string[] = [];
  for (const edge of page.data.repository.vulnerabilityAlerts.edges) {
    if (seenEdgeCursors.has(edge.cursor)) findings.push('duplicate_edge_cursor');
    seenEdgeCursors.add(edge.cursor);
    if (seenAlertIds.has(edge.node.id)) findings.push('duplicate_alert_id');
    seenAlertIds.add(edge.node.id);
    if (!isDependabotAlertState(edge.node.state)) {
      hasUnknownState = true;
      continue;
    }
    stateCounts[edge.node.state] += 1;
    if (requestedState !== null && requestedState !== edge.node.state)
      findings.push('state_filter_mismatch');
  }
  return { hasUnknownState, findings };
}

interface PageAnalysisAccumulator {
  readonly stateCounts: Record<DependabotAlertState, number>;
  readonly seenAlertIds: Set<string>;
  readonly seenEdgeCursors: Set<string>;
  readonly seenPageCursors: Set<string>;
  readonly findings: string[];
  readonly pageCount: number;
  readonly reportedTotal: number | null;
  readonly requestedState: DependabotAlertState | null;
  returnedAlerts: number;
  hasUnknownState: boolean;
}

function addPageToAnalysis(
  page: GraphQlPage,
  index: number,
  accumulator: PageAnalysisAccumulator
): void {
  const connection = page.data.repository.vulnerabilityAlerts;
  accumulator.returnedAlerts += connection.edges.length;
  if (connection.totalCount !== accumulator.reportedTotal)
    accumulator.findings.push('total_count_drift');
  accumulator.findings.push(
    ...checkPageCursors(page, index, accumulator.pageCount, accumulator.seenPageCursors)
  );
  const edgeResult = countPageEdges(
    page,
    accumulator.requestedState,
    accumulator.stateCounts,
    accumulator.seenAlertIds,
    accumulator.seenEdgeCursors
  );
  accumulator.findings.push(...edgeResult.findings);
  accumulator.hasUnknownState ||= edgeResult.hasUnknownState;
}

function analyzePages(
  pages: readonly GraphQlPage[],
  requestedState: DependabotAlertState | null
): PageAnalysis {
  const reportedTotal = pages[0]?.data.repository.vulnerabilityAlerts.totalCount ?? null;
  const accumulator: PageAnalysisAccumulator = {
    stateCounts: emptyStateCounts(),
    seenAlertIds: new Set<string>(),
    seenEdgeCursors: new Set<string>(),
    seenPageCursors: new Set<string>(),
    findings: [],
    pageCount: pages.length,
    reportedTotal,
    requestedState,
    returnedAlerts: 0,
    hasUnknownState: false,
  };
  for (const [index, page] of pages.entries()) {
    addPageToAnalysis(page, index, accumulator);
  }

  if (reportedTotal !== accumulator.returnedAlerts)
    accumulator.findings.push('total_count_row_mismatch');
  if (requestedState !== null) accumulator.findings.push('filtered_query_scope');
  return {
    details: {
      pageCount: pages.length,
      reportedTotal,
      returnedAlerts: accumulator.returnedAlerts,
      uniqueAlerts: accumulator.seenAlertIds.size,
      openCount: accumulator.hasUnknownState ? null : accumulator.stateCounts.OPEN,
      stateCounts: accumulator.hasUnknownState ? null : accumulator.stateCounts,
    },
    findings: accumulator.findings,
    hasUnknownState: accumulator.hasUnknownState,
  };
}

export function assessment(
  status: DependabotInventoryStatus,
  context: ReturnType<typeof parseContext>,
  details: Partial<
    Pick<
      DependabotInventoryAssessment,
      | 'pageCount'
      | 'reportedTotal'
      | 'returnedAlerts'
      | 'uniqueAlerts'
      | 'openCount'
      | 'stateCounts'
    >
  > = {},
  findings: readonly string[] = []
): DependabotInventoryAssessment {
  return {
    status,
    scope: context.scope,
    source: 'github_graphql',
    repository: context.repository,
    headSha: context.headSha,
    capturedAt: context.capturedAt,
    queryValidated: context.queryValidated,
    queryOwner: context.queryOwner,
    queryName: context.queryName,
    requestedState: context.requestedState,
    pageCount: details.pageCount ?? 0,
    reportedTotal: details.reportedTotal ?? null,
    returnedAlerts: details.returnedAlerts ?? null,
    uniqueAlerts: details.uniqueAlerts ?? null,
    openCount: details.openCount ?? null,
    stateCounts: details.stateCounts ?? null,
    findings: [...context.findings, ...findings],
  };
}

/**
 * Assess the normalized objects emitted by `gh api graphql --paginate --slurp`.
 *
 * A `clean` result means only that a complete, internally consistent,
 * unfiltered traversal of the accessible connection contained no OPEN rows.
 * A filtered query can never establish inventory completeness. Missing,
 * malformed, partial, and unknown evidence stays unmeasured.
 */
export function assessDependabotInventory(
  input: unknown,
  evidenceContext: DependabotEvidenceContext = {}
): DependabotInventoryAssessment {
  const context = parseContext(evidenceContext);
  if (context.findings.length > 0) return assessment('unmeasured', context);
  const parsed = parsePages(input);
  if (parsed.pages === null) {
    return assessment('unmeasured', context, { pageCount: parsed.pageCount }, parsed.findings);
  }
  const analysis = analyzePages(parsed.pages, context.requestedState);
  if (analysis.hasUnknownState) {
    return assessment('unmeasured', context, analysis.details, ['missing_or_unknown_alert_state']);
  }
  if (analysis.findings.length > 0) {
    return assessment('inconsistent', context, analysis.details, analysis.findings);
  }
  return assessment(
    analysis.details.openCount === 0 ? 'clean' : 'open_count',
    context,
    analysis.details
  );
}

if (process.argv[1]?.endsWith('check-dependabot-inventory.ts') === true) {
  void import('./check-dependabot-inventory-cli.js').then(({ main }) =>
    main()
      .then((exitCode) => {
        process.exitCode = exitCode;
      })
      .catch(() => {
        process.stdout.write(
          `${JSON.stringify({ status: 'unmeasured', scope: 'unknown', findings: ['cli_failure'] })}\n`
        );
        process.exitCode = 1;
      })
  );
}
