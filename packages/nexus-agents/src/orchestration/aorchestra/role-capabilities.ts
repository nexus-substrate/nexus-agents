/**
 * Role-based capability matrix for expert workers (#1510).
 *
 * Defines which tool categories each expert role should use, enforced
 * via prompt instruction (soft guard). Inspired by Overstory's
 * role-based tool restrictions.
 *
 * @module orchestration/aorchestra/role-capabilities
 */

// ============================================================================
// Types
// ============================================================================

/** Tool capability tier for expert roles. */
export type CapabilityTier = 'read_only' | 'analysis' | 'write' | 'full';

/** Capability definition for an expert role. */
export interface RoleCapability {
  readonly tier: CapabilityTier;
  readonly allowedTools: readonly string[];
  readonly restriction: string;
}

// ============================================================================
// Capability Matrix
// ============================================================================

/** Read-only tools: safe for analysis roles. */
const READ_TOOLS = ['Read', 'Grep', 'Glob'] as const;

/** Analysis tools: read + limited bash (no mutations). */
const ANALYSIS_TOOLS = [...READ_TOOLS, 'Bash (read-only commands)'] as const;

/** Write tools: full file mutation capability. */
const WRITE_TOOLS = [...READ_TOOLS, 'Edit', 'Write', 'Bash'] as const;

/**
 * Role → capability mapping.
 * Roles not listed default to 'analysis' tier.
 */
export const ROLE_CAPABILITIES: Readonly<Record<string, RoleCapability>> = {
  code: {
    tier: 'write',
    allowedTools: [...WRITE_TOOLS],
    restriction: 'You may read and write files, and run shell commands.',
  },
  testing: {
    tier: 'write',
    allowedTools: [...WRITE_TOOLS],
    restriction: 'You may read and write test files, and run test commands.',
  },
  devops: {
    tier: 'write',
    allowedTools: [...WRITE_TOOLS],
    restriction: 'You may read and write configuration files and run shell commands.',
  },
  architecture: {
    tier: 'read_only',
    allowedTools: [...READ_TOOLS],
    restriction: 'You are read-only. Analyze and recommend — do NOT modify files.',
  },
  security: {
    tier: 'analysis',
    allowedTools: [...ANALYSIS_TOOLS],
    restriction: 'You may read files and run read-only commands. Do NOT modify files.',
  },
  documentation: {
    tier: 'write',
    allowedTools: [...WRITE_TOOLS],
    restriction: 'You may read and write documentation files.',
  },
  research: {
    tier: 'read_only',
    allowedTools: [...READ_TOOLS],
    restriction: 'You are read-only. Research and report — do NOT modify files.',
  },
  product: {
    tier: 'read_only',
    allowedTools: [...READ_TOOLS],
    restriction: 'You are read-only. Analyze requirements — do NOT modify files.',
  },
  ux: {
    tier: 'read_only',
    allowedTools: [...READ_TOOLS],
    restriction: 'You are read-only. Analyze UX patterns — do NOT modify files.',
  },
};

/** Default capability for unknown roles. */
const DEFAULT_CAPABILITY: RoleCapability = {
  tier: 'analysis',
  allowedTools: [...ANALYSIS_TOOLS],
  restriction: 'You may read files and run read-only commands. Do NOT modify files.',
};

// ============================================================================
// Public API
// ============================================================================

/** Get the capability definition for a role. */
export function getRoleCapability(role: string): RoleCapability {
  return ROLE_CAPABILITIES[role] ?? DEFAULT_CAPABILITY;
}

/**
 * Build a tool restriction prompt block for a worker role.
 * Returns empty string if the role has full access.
 */
export function buildToolRestrictionBlock(role: string): string {
  const cap = getRoleCapability(role);
  if (cap.tier === 'full') return '';

  const tools = cap.allowedTools.join(', ');
  return ['## Tool Restrictions', '', cap.restriction, `Allowed tools: ${tools}.`].join('\n');
}
