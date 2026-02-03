/**
 * nexus-agents/utils - Visual Output Utilities
 *
 * Mermaid diagram generators for common visualizations.
 * Produces Mermaid syntax strings that can be embedded in markdown,
 * rendered by GitHub/GitLab viewers, or used in documentation.
 *
 * No external dependencies - pure string generation.
 *
 * @module utils/visual-output
 */

// ============================================================================
// Types
// ============================================================================

/** A module with its dependency list, used for dependency graph generation. */
export interface ModuleNode {
  /** Module name (displayed as node label) */
  readonly name: string;
  /** Names of modules this module depends on */
  readonly deps: readonly string[];
}

/** A component in an architecture diagram, grouped by layer. */
export interface ArchitectureComponent {
  /** Component name (displayed as node label) */
  readonly name: string;
  /** Layer this component belongs to (e.g., 'API', 'Core', 'Data') */
  readonly layer: string;
  /** Names of other components this component connects to */
  readonly connections: readonly string[];
}

/** An agent in a swarm visualization with role and status. */
export interface SwarmAgent {
  /** Unique agent identifier */
  readonly id: string;
  /** Agent role (e.g., 'code_expert', 'security_expert') */
  readonly role: string;
  /** Current agent status (e.g., 'active', 'idle', 'completed') */
  readonly status: string;
  /** IDs of other agents this agent communicates with */
  readonly connections: readonly string[];
}

/** A step in a flow diagram with optional branching. */
export interface FlowStep {
  /** Unique step identifier */
  readonly id: string;
  /** Step display name */
  readonly name: string;
  /** IDs of subsequent steps (omit for terminal steps) */
  readonly next?: readonly string[];
}

// ============================================================================
// Internal Helpers
// ============================================================================

const MERMAID_UNSAFE_CHARS = /["<>{}|\\]/g;

/**
 * Sanitize a label for safe embedding in Mermaid syntax.
 * Removes characters that could break Mermaid parsing.
 */
function sanitizeLabel(label: string): string {
  return label.replace(MERMAID_UNSAFE_CHARS, '').trim();
}

/**
 * Convert a name to a valid Mermaid node ID.
 * Replaces non-alphanumeric characters with underscores.
 */
function toNodeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_');
}

/**
 * Map an agent status string to a Mermaid node style class name.
 */
function statusToStyle(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === 'active' || normalized === 'running') return 'active';
  if (normalized === 'completed' || normalized === 'done') return 'completed';
  if (normalized === 'error' || normalized === 'failed') return 'error';
  return 'idle';
}

// ============================================================================
// Dependency Graph
// ============================================================================

/**
 * Generate a Mermaid dependency graph from a list of modules.
 *
 * Produces a top-down graph showing module dependencies as directed edges.
 * Modules without dependencies appear as standalone nodes.
 *
 * @param modules - Array of modules with their dependency lists
 * @returns Mermaid graph syntax string
 *
 * @example
 * ```typescript
 * const diagram = generateDependencyGraph([
 *   { name: 'api', deps: ['core', 'auth'] },
 *   { name: 'core', deps: ['utils'] },
 *   { name: 'auth', deps: ['core'] },
 *   { name: 'utils', deps: [] },
 * ]);
 * // Returns Mermaid graph with dependency arrows
 * ```
 */
export function generateDependencyGraph(modules: readonly ModuleNode[]): string {
  const lines: string[] = ['graph TD'];

  for (const mod of modules) {
    const nodeId = toNodeId(mod.name);
    const label = sanitizeLabel(mod.name);

    if (mod.deps.length === 0) {
      lines.push(`  ${nodeId}[${label}]`);
      continue;
    }

    for (const dep of mod.deps) {
      const depId = toNodeId(dep);
      const depLabel = sanitizeLabel(dep);
      lines.push(`  ${nodeId}[${label}] --> ${depId}[${depLabel}]`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// Architecture Diagram
// ============================================================================

/**
 * Generate a Mermaid architecture diagram grouped by layer.
 *
 * Components are organized into subgraphs by their layer property.
 * Connections between components are drawn as directed edges.
 *
 * @param components - Array of architecture components with layer and connection info
 * @returns Mermaid graph syntax string
 *
 * @example
 * ```typescript
 * const diagram = generateArchitectureDiagram([
 *   { name: 'REST API', layer: 'API', connections: ['Service'] },
 *   { name: 'MCP Server', layer: 'API', connections: ['Service'] },
 *   { name: 'Service', layer: 'Core', connections: ['Database'] },
 *   { name: 'Database', layer: 'Data', connections: [] },
 * ]);
 * // Returns Mermaid graph with layered subgraphs
 * ```
 */
export function generateArchitectureDiagram(components: readonly ArchitectureComponent[]): string {
  const lines: string[] = ['graph TB'];

  // Group components by layer
  const layers = new Map<string, ArchitectureComponent[]>();
  for (const component of components) {
    const existing = layers.get(component.layer) ?? [];
    existing.push(component);
    layers.set(component.layer, existing);
  }

  // Render each layer as a subgraph
  for (const [layer, layerComponents] of layers) {
    const layerId = toNodeId(layer);
    lines.push(`  subgraph ${layerId}[${sanitizeLabel(layer)}]`);
    for (const component of layerComponents) {
      const nodeId = toNodeId(component.name);
      lines.push(`    ${nodeId}[${sanitizeLabel(component.name)}]`);
    }
    lines.push('  end');
  }

  // Render connections after subgraphs
  for (const component of components) {
    const sourceId = toNodeId(component.name);
    for (const target of component.connections) {
      const targetId = toNodeId(target);
      lines.push(`  ${sourceId} --> ${targetId}`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// Swarm Visualization
// ============================================================================

/**
 * Generate a Mermaid diagram visualizing agent swarm topology.
 *
 * Agents are displayed as nodes with their role as labels.
 * Status is indicated via CSS class styling (active, idle, completed, error).
 * Communication links between agents are shown as edges.
 *
 * @param agents - Array of swarm agents with roles, statuses, and connections
 * @returns Mermaid graph syntax string with style definitions
 *
 * @example
 * ```typescript
 * const diagram = generateSwarmVisualization([
 *   { id: 'lead', role: 'TechLead', status: 'active', connections: ['dev1', 'dev2'] },
 *   { id: 'dev1', role: 'code_expert', status: 'active', connections: [] },
 *   { id: 'dev2', role: 'security_expert', status: 'idle', connections: [] },
 * ]);
 * // Returns Mermaid graph with styled agent nodes
 * ```
 */
export function generateSwarmVisualization(agents: readonly SwarmAgent[]): string {
  const lines: string[] = ['graph LR'];

  // Define agent nodes with role labels
  for (const agent of agents) {
    const nodeId = toNodeId(agent.id);
    const label = sanitizeLabel(`${agent.id}: ${agent.role}`);
    lines.push(`  ${nodeId}[${label}]`);
  }

  // Define connections
  for (const agent of agents) {
    const sourceId = toNodeId(agent.id);
    for (const targetId of agent.connections) {
      lines.push(`  ${sourceId} <--> ${toNodeId(targetId)}`);
    }
  }

  // Apply status-based styling
  const styleGroups = new Map<string, string[]>();
  for (const agent of agents) {
    const style = statusToStyle(agent.status);
    const group = styleGroups.get(style) ?? [];
    group.push(toNodeId(agent.id));
    styleGroups.set(style, group);
  }

  // Emit style class definitions
  lines.push('');
  lines.push('  classDef active fill:#4CAF50,stroke:#2E7D32,color:#fff');
  lines.push('  classDef idle fill:#9E9E9E,stroke:#616161,color:#fff');
  lines.push('  classDef completed fill:#2196F3,stroke:#1565C0,color:#fff');
  lines.push('  classDef error fill:#F44336,stroke:#C62828,color:#fff');

  for (const [style, nodeIds] of styleGroups) {
    lines.push(`  class ${nodeIds.join(',')} ${style}`);
  }

  return lines.join('\n');
}

// ============================================================================
// Flow Diagram
// ============================================================================

/**
 * Generate a Mermaid flow diagram from a sequence of steps.
 *
 * Steps without a `next` property are rendered as terminal nodes (rounded).
 * Steps with `next` produce directed edges to their successors.
 *
 * @param steps - Array of flow steps with optional branching
 * @returns Mermaid graph syntax string
 *
 * @example
 * ```typescript
 * const diagram = generateFlowDiagram([
 *   { id: 'start', name: 'Receive Task', next: ['analyze'] },
 *   { id: 'analyze', name: 'Analyze Task', next: ['route', 'reject'] },
 *   { id: 'route', name: 'Route to Expert', next: ['execute'] },
 *   { id: 'reject', name: 'Reject Task' },
 *   { id: 'execute', name: 'Execute', next: ['done'] },
 *   { id: 'done', name: 'Complete' },
 * ]);
 * // Returns Mermaid flowchart with branching paths
 * ```
 */
export function generateFlowDiagram(steps: readonly FlowStep[]): string {
  const lines: string[] = ['graph TD'];

  // Collect terminal step IDs for rounded styling
  const terminalIds: string[] = [];

  for (const step of steps) {
    const nodeId = toNodeId(step.id);
    const label = sanitizeLabel(step.name);
    const isTerminal = step.next === undefined || step.next.length === 0;

    if (isTerminal) {
      // Rounded node for terminal steps
      lines.push(`  ${nodeId}([${label}])`);
      terminalIds.push(nodeId);
    } else {
      // Standard node with edges
      lines.push(`  ${nodeId}[${label}]`);
      for (const nextId of step.next) {
        lines.push(`  ${nodeId} --> ${toNodeId(nextId)}`);
      }
    }
  }

  return lines.join('\n');
}

// ============================================================================
// Orchestration Result Visualization
// ============================================================================

/** An orchestration execution step for visualization. */
export interface OrchestrationStep {
  /** Step identifier */
  readonly id: string;
  /** Agent role that executed this step */
  readonly role: string;
  /** Action description */
  readonly action: string;
  /** Step status */
  readonly status: 'success' | 'error' | 'pending' | 'running';
  /** Duration in milliseconds */
  readonly durationMs: number;
  /** Token usage */
  readonly tokensUsed: number;
}

/** Orchestration execution result for visualization. */
export interface OrchestrationVizData {
  /** Execution ID */
  readonly executionId: string;
  /** Orchestrator type */
  readonly orchestratorType: string;
  /** Execution steps */
  readonly steps: readonly OrchestrationStep[];
  /** Total duration in milliseconds */
  readonly totalDurationMs: number;
  /** Total tokens used */
  readonly totalTokensUsed: number;
  /** Agents involved */
  readonly agentsUsed: readonly string[];
}

/**
 * Generate a Mermaid sequence diagram from orchestration execution data.
 *
 * Shows the flow of an orchestration: TechLead delegates to experts,
 * results flow back, with timing annotations.
 *
 * @param data - Orchestration execution result
 * @returns Mermaid sequence diagram syntax
 */
export function generateOrchestrationSequence(data: OrchestrationVizData): string {
  const lines: string[] = ['sequenceDiagram'];
  lines.push('  participant O as Orchestrator');

  // Declare unique agent participants
  const agents = new Set<string>();
  for (const step of data.steps) {
    agents.add(step.role);
  }
  for (const agent of agents) {
    const label = sanitizeLabel(agent);
    lines.push(`  participant ${toNodeId(agent)} as ${label}`);
  }

  // Render each step as a sequence interaction
  for (const step of data.steps) {
    const agentId = toNodeId(step.role);
    const action = sanitizeLabel(step.action);
    const duration = step.durationMs > 0 ? ` (${String(step.durationMs)}ms)` : '';
    const statusIcon = step.status === 'success' ? '+' : step.status === 'error' ? 'x' : '?';

    lines.push(`  O->>${agentId}: ${action}`);
    if (step.status === 'error') {
      lines.push(`  ${agentId}-->>O: Error${duration}`);
    } else {
      lines.push(`  ${agentId}->>O: ${statusIcon} Done${duration}`);
    }
  }

  // Add note with totals
  lines.push(
    `  Note over O: Total: ${String(data.totalDurationMs)}ms, ${String(data.totalTokensUsed)} tokens`
  );

  return lines.join('\n');
}

/**
 * Generate an ASCII art telemetry dashboard for orchestration results.
 *
 * Displays a compact, terminal-friendly summary of agent orchestration
 * with status indicators, timing bars, and token usage.
 *
 * @param data - Orchestration execution result
 * @returns ASCII art dashboard string
 */
export function generateAsciiDashboard(data: OrchestrationVizData): string {
  const lines: string[] = [];
  const width = 60;
  const border = '═'.repeat(width);

  lines.push(`╔${border}╗`);
  lines.push(`║${'  NEXUS AGENTS — ORCHESTRATION DASHBOARD'.padEnd(width)}║`);
  lines.push(`╠${border}╣`);

  // Execution info
  lines.push(`║${`  Execution: ${data.executionId}`.padEnd(width)}║`);
  lines.push(`║${`  Type:      ${data.orchestratorType}`.padEnd(width)}║`);
  lines.push(`║${`  Duration:  ${String(data.totalDurationMs)}ms`.padEnd(width)}║`);
  lines.push(`║${`  Tokens:    ${String(data.totalTokensUsed)}`.padEnd(width)}║`);
  lines.push(`║${`  Agents:    ${data.agentsUsed.join(', ')}`.padEnd(width)}║`);
  lines.push(`╠${border}╣`);

  // Steps section
  lines.push(`║${'  EXECUTION STEPS'.padEnd(width)}║`);
  lines.push(`╠${border}╣`);

  const maxDuration = Math.max(...data.steps.map((s) => s.durationMs), 1);
  const barWidth = 30;

  for (const step of data.steps) {
    const icon =
      step.status === 'success'
        ? '✓'
        : step.status === 'error'
          ? '✗'
          : step.status === 'running'
            ? '►'
            : '○';
    const barLen = Math.max(1, Math.round((step.durationMs / maxDuration) * barWidth));
    const bar = '█'.repeat(barLen) + '░'.repeat(barWidth - barLen);
    const role = step.role.padEnd(16).slice(0, 16);
    const duration = `${String(step.durationMs)}ms`.padStart(8);

    lines.push(`║  ${icon} ${role} ${bar} ${duration} ║`);
  }

  lines.push(`╚${border}╝`);

  return lines.join('\n');
}

/**
 * Generate an ASCII art consensus vote summary.
 *
 * @param votes - Array of vote results with role, decision, confidence
 * @param decision - Final decision
 * @param approvalPct - Approval percentage
 * @returns ASCII art summary string
 */
export function generateVoteSummary(
  votes: readonly { role: string; decision: string; confidence: number }[],
  decision: string,
  approvalPct: number
): string {
  const lines: string[] = [];
  const width = 50;
  const border = '─'.repeat(width);

  lines.push(`┌${border}┐`);
  lines.push(`│${'  CONSENSUS VOTE RESULTS'.padEnd(width)}│`);
  lines.push(`├${border}┤`);

  const decisionIcon = decision === 'approved' ? '✓ APPROVED' : '✗ REJECTED';
  lines.push(
    `│${`  Decision: ${decisionIcon}  (${String(Math.round(approvalPct))}%)`.padEnd(width)}│`
  );
  lines.push(`├${border}┤`);

  for (const vote of votes) {
    const icon = vote.decision === 'approve' ? '👍' : vote.decision === 'reject' ? '👎' : '🤷';
    const conf = `${String(Math.round(vote.confidence * 100))}%`;
    const role = vote.role.padEnd(20).slice(0, 20);
    lines.push(`│  ${icon} ${role} ${conf.padStart(5)} confidence     │`);
  }

  lines.push(`└${border}┘`);

  return lines.join('\n');
}

// ============================================================================
// System Summary Dashboard
// ============================================================================

/** Data for a system summary dashboard. */
export interface SystemSummaryData {
  /** Package version */
  readonly version: string;
  /** Total source files */
  readonly sourceFiles: number;
  /** Total test files */
  readonly testFiles: number;
  /** Total test count */
  readonly testCount: number;
  /** MCP tools registered */
  readonly mcpTools: number;
  /** Expert types available */
  readonly expertTypes: number;
  /** Workflow templates available */
  readonly workflowTemplates: number;
  /** Fitness audit score */
  readonly fitnessScore: number;
  /** CLI commands available */
  readonly cliCommands: number;
  /** Adapter count */
  readonly adapters: number;
  /** Module breakdown by layer */
  readonly layers: ReadonlyArray<{ name: string; files: number }>;
}

/**
 * Generate an ASCII system summary dashboard.
 *
 * Displays a terminal-friendly overview of the nexus-agents system
 * with real codebase statistics organized by architectural layer.
 *
 * @param data - System summary statistics
 * @returns ASCII art dashboard string
 */
export function generateSystemSummary(data: SystemSummaryData): string {
  const lines: string[] = [];
  const width = 62;
  const border = '═'.repeat(width);
  const thin = '─'.repeat(width);

  // Header with ASCII logo
  lines.push(`╔${border}╗`);
  lines.push(`║${''.padEnd(width)}║`);
  lines.push(`║${'    ╔╗╔ ╔══╗ ╔╗  ╔ ╔╗ ╔╗ ╔══╗'.padEnd(width)}║`);
  lines.push(`║${'    ║║║ ║╔═╝ ╠╬╗ ║ ║║ ║║ ╚═╗║'.padEnd(width)}║`);
  lines.push(`║${'    ║╚╝ ║╚═╗ ║╚╬╗║ ║║ ║║ ╔═╝║'.padEnd(width)}║`);
  lines.push(`║${'    ╚══ ╚══╝ ╚═╝╚╝ ╚══╝╝ ╚══╝  AGENTS'.padEnd(width)}║`);
  lines.push(`║${''.padEnd(width)}║`);
  lines.push(`║${'    Multi-Agent Orchestration System'.padEnd(width)}║`);
  lines.push(`╠${border}╣`);

  // Version and stats
  lines.push(`║${'  SYSTEM OVERVIEW'.padEnd(width)}║`);
  lines.push(`║${`  ${thin.slice(0, 58)}`.padEnd(width)}║`);
  lines.push(`║${`  Version:    v${data.version}`.padEnd(width)}║`);
  lines.push(
    `║${`  Fitness:    ${String(data.fitnessScore)}/100 ${'█'.repeat(Math.round(data.fitnessScore / 5))}${'░'.repeat(20 - Math.round(data.fitnessScore / 5))}`.padEnd(width)}║`
  );
  lines.push(`╠${border}╣`);

  // Capabilities grid
  lines.push(`║${'  CAPABILITIES'.padEnd(width)}║`);
  lines.push(`║${`  ${thin.slice(0, 58)}`.padEnd(width)}║`);

  const capabilities = [
    ['MCP Tools', String(data.mcpTools), 'Expert Types', String(data.expertTypes)],
    ['CLI Commands', String(data.cliCommands), 'Workflows', String(data.workflowTemplates)],
    ['Adapters', String(data.adapters), 'Test Count', String(data.testCount)],
  ];

  for (const row of capabilities) {
    const col1 = `  ${row[0] ?? ''}:`.padEnd(18) + (row[1] ?? '').padStart(4);
    const col2 = `  ${row[2] ?? ''}:`.padEnd(18) + (row[3] ?? '').padStart(4);
    lines.push(`║${(col1 + col2).padEnd(width)}║`);
  }

  lines.push(`╠${border}╣`);

  // Architecture layers
  lines.push(`║${'  ARCHITECTURE LAYERS'.padEnd(width)}║`);
  lines.push(`║${`  ${thin.slice(0, 58)}`.padEnd(width)}║`);

  const maxFiles = Math.max(...data.layers.map((l) => l.files), 1);
  const barMaxWidth = 30;

  for (const layer of data.layers) {
    const barLen = Math.max(1, Math.round((layer.files / maxFiles) * barMaxWidth));
    const bar = '█'.repeat(barLen) + '░'.repeat(barMaxWidth - barLen);
    const label = layer.name.padEnd(14).slice(0, 14);
    const count = String(layer.files).padStart(4);
    lines.push(`║  ${label} ${bar} ${count}  ║`);
  }

  lines.push(`╠${border}╣`);

  // Source breakdown
  lines.push(
    `║${`  Source Files: ${String(data.sourceFiles)}    Test Files: ${String(data.testFiles)}`.padEnd(width)}║`
  );
  lines.push(`╚${border}╝`);

  return lines.join('\n');
}

// ============================================================================
// Markdown Embedding Helper
// ============================================================================

/**
 * Wrap a Mermaid diagram string in a markdown code fence.
 *
 * Produces a fenced code block with the `mermaid` language tag,
 * suitable for direct embedding in markdown files.
 *
 * @param diagram - Mermaid diagram syntax (from any generator function)
 * @param title - Optional title to render as a markdown heading above the diagram
 * @returns Markdown string with the diagram in a mermaid code fence
 *
 * @example
 * ```typescript
 * const md = wrapInMarkdownFence(
 *   generateDependencyGraph(modules),
 *   'Module Dependencies',
 * );
 * // Returns:
 * // ## Module Dependencies
 * //
 * // ```mermaid
 * // graph TD
 * //   ...
 * // ```
 * ```
 */
export function wrapInMarkdownFence(diagram: string, title?: string): string {
  const parts: string[] = [];
  if (title !== undefined) {
    parts.push(`## ${sanitizeLabel(title)}`, '');
  }
  parts.push('```mermaid', diagram, '```');
  return parts.join('\n');
}
