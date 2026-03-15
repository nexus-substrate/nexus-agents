/**
 * nexus-agents/cli/hooks - Hook Type Definitions
 *
 * Zod schemas for Claude CLI hook input/output protocol.
 * Based on: https://code.claude.com/docs/en/hooks
 *
 * @module cli/hooks/hook-types
 * (Source: Issue #411, #412 - Claude CLI Hook Integration)
 */

import { z } from 'zod';

// ============================================================================
// Hook Event Names
// ============================================================================

export const HookEventName = z.enum([
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PermissionRequest',
  'PostToolUse',
  'PostToolUseFailure',
  'SubagentStart',
  'SubagentStop',
  'Stop',
  'PreCompact',
  'SessionEnd',
  'Notification',
  'Setup',
]);

export type HookEventName = z.infer<typeof HookEventName>;

// ============================================================================
// Permission Mode
// ============================================================================

export const PermissionMode = z.enum([
  'default',
  'plan',
  'acceptEdits',
  'dontAsk',
  'bypassPermissions',
]);

export type PermissionMode = z.infer<typeof PermissionMode>;

// ============================================================================
// Common Hook Input (all hooks receive these fields)
// ============================================================================

export const HookInputBaseSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string(),
  cwd: z.string(),
  permission_mode: PermissionMode,
  hook_event_name: HookEventName,
});

export type HookInputBase = z.infer<typeof HookInputBaseSchema>;

// ============================================================================
// Session Lifecycle Hooks
// ============================================================================

export const SessionStartSource = z.enum(['startup', 'resume', 'clear', 'compact']);

export const SessionStartInputSchema = HookInputBaseSchema.extend({
  hook_event_name: z.literal('SessionStart'),
  source: SessionStartSource,
  model: z.string().optional(),
  agent_type: z.string().optional(),
});

export type SessionStartInput = z.infer<typeof SessionStartInputSchema>;

export const SessionEndReason = z.enum(['clear', 'logout', 'prompt_input_exit', 'other']);

export const SessionEndInputSchema = HookInputBaseSchema.extend({
  hook_event_name: z.literal('SessionEnd'),
  reason: SessionEndReason,
});

export type SessionEndInput = z.infer<typeof SessionEndInputSchema>;

// ============================================================================
// Tool Lifecycle Hooks
// ============================================================================

export const PreToolUseInputSchema = HookInputBaseSchema.extend({
  hook_event_name: z.literal('PreToolUse'),
  tool_name: z.string(),
  tool_input: z.record(z.string(), z.unknown()),
  tool_use_id: z.string(),
});

export type PreToolUseInput = z.infer<typeof PreToolUseInputSchema>;

export const PostToolUseInputSchema = HookInputBaseSchema.extend({
  hook_event_name: z.literal('PostToolUse'),
  tool_name: z.string(),
  tool_input: z.record(z.string(), z.unknown()),
  tool_response: z.record(z.string(), z.unknown()),
  tool_use_id: z.string(),
});

export type PostToolUseInput = z.infer<typeof PostToolUseInputSchema>;

export const PostToolUseFailureInputSchema = HookInputBaseSchema.extend({
  hook_event_name: z.literal('PostToolUseFailure'),
  tool_name: z.string(),
  tool_input: z.record(z.string(), z.unknown()),
  tool_use_id: z.string(),
  error: z.string().optional(),
});

export type PostToolUseFailureInput = z.infer<typeof PostToolUseFailureInputSchema>;

// ============================================================================
// Stop Hooks
// ============================================================================

export const StopInputSchema = HookInputBaseSchema.extend({
  hook_event_name: z.literal('Stop'),
  stop_hook_active: z.boolean(),
});

export type StopInput = z.infer<typeof StopInputSchema>;

export const SubagentStopInputSchema = HookInputBaseSchema.extend({
  hook_event_name: z.literal('SubagentStop'),
  stop_hook_active: z.boolean(),
  agent_id: z.string(),
  agent_transcript_path: z.string(),
});

export type SubagentStopInput = z.infer<typeof SubagentStopInputSchema>;

// ============================================================================
// Other Hooks
// ============================================================================

export const UserPromptSubmitInputSchema = HookInputBaseSchema.extend({
  hook_event_name: z.literal('UserPromptSubmit'),
  prompt: z.string(),
});

export type UserPromptSubmitInput = z.infer<typeof UserPromptSubmitInputSchema>;

export const NotificationType = z.enum([
  'permission_prompt',
  'idle_prompt',
  'auth_success',
  'elicitation_dialog',
]);

export const NotificationInputSchema = HookInputBaseSchema.extend({
  hook_event_name: z.literal('Notification'),
  message: z.string(),
  notification_type: NotificationType,
});

export type NotificationInput = z.infer<typeof NotificationInputSchema>;

export const PreCompactTrigger = z.enum(['manual', 'auto']);

export const PreCompactInputSchema = HookInputBaseSchema.extend({
  hook_event_name: z.literal('PreCompact'),
  trigger: PreCompactTrigger,
  custom_instructions: z.string().optional(),
});

export type PreCompactInput = z.infer<typeof PreCompactInputSchema>;

export const SetupTrigger = z.enum(['init', 'maintenance']);

export const SetupInputSchema = HookInputBaseSchema.extend({
  hook_event_name: z.literal('Setup'),
  trigger: SetupTrigger,
});

export type SetupInput = z.infer<typeof SetupInputSchema>;

export const SubagentStartInputSchema = HookInputBaseSchema.extend({
  hook_event_name: z.literal('SubagentStart'),
  agent_id: z.string(),
  agent_type: z.string(),
});

export type SubagentStartInput = z.infer<typeof SubagentStartInputSchema>;

export const PermissionRequestInputSchema = HookInputBaseSchema.extend({
  hook_event_name: z.literal('PermissionRequest'),
  tool_name: z.string(),
  tool_input: z.record(z.string(), z.unknown()),
  tool_use_id: z.string(),
});

export type PermissionRequestInput = z.infer<typeof PermissionRequestInputSchema>;

// ============================================================================
// Union of All Hook Inputs
// ============================================================================

export const HookInputSchema = z.discriminatedUnion('hook_event_name', [
  SessionStartInputSchema,
  SessionEndInputSchema,
  PreToolUseInputSchema,
  PostToolUseInputSchema,
  PostToolUseFailureInputSchema,
  StopInputSchema,
  SubagentStopInputSchema,
  UserPromptSubmitInputSchema,
  NotificationInputSchema,
  PreCompactInputSchema,
  SetupInputSchema,
  SubagentStartInputSchema,
  PermissionRequestInputSchema,
]);

export type HookInput = z.infer<typeof HookInputSchema>;

// ============================================================================
// Hook Output Types
// ============================================================================

/** Permission decision for PreToolUse hooks */
export const PermissionDecision = z.enum(['allow', 'deny', 'ask']);
export type PermissionDecision = z.infer<typeof PermissionDecision>;

/** Decision for PostToolUse and Stop hooks */
export const HookDecision = z.enum(['block']);
export type HookDecision = z.infer<typeof HookDecision>;

/** Common output fields */
export const HookOutputBaseSchema = z.object({
  continue: z.boolean().optional(),
  stopReason: z.string().optional(),
  suppressOutput: z.boolean().optional(),
  systemMessage: z.string().optional(),
});

export type HookOutputBase = z.infer<typeof HookOutputBaseSchema>;

/** PreToolUse specific output */
export const PreToolUseOutputSchema = HookOutputBaseSchema.extend({
  hookSpecificOutput: z
    .object({
      hookEventName: z.literal('PreToolUse'),
      permissionDecision: PermissionDecision.optional(),
      permissionDecisionReason: z.string().optional(),
      updatedInput: z.record(z.string(), z.unknown()).optional(),
      additionalContext: z.string().optional(),
    })
    .optional(),
});

export type PreToolUseOutput = z.infer<typeof PreToolUseOutputSchema>;

/** PostToolUse specific output */
export const PostToolUseOutputSchema = HookOutputBaseSchema.extend({
  decision: HookDecision.optional(),
  reason: z.string().optional(),
  hookSpecificOutput: z
    .object({
      hookEventName: z.literal('PostToolUse'),
      additionalContext: z.string().optional(),
    })
    .optional(),
});

export type PostToolUseOutput = z.infer<typeof PostToolUseOutputSchema>;

/** Stop specific output */
export const StopOutputSchema = HookOutputBaseSchema.extend({
  decision: HookDecision.optional(),
  reason: z.string().optional(),
});

export type StopOutput = z.infer<typeof StopOutputSchema>;

/** UserPromptSubmit specific output */
export const UserPromptSubmitOutputSchema = HookOutputBaseSchema.extend({
  decision: HookDecision.optional(),
  reason: z.string().optional(),
  hookSpecificOutput: z
    .object({
      hookEventName: z.literal('UserPromptSubmit'),
      additionalContext: z.string().optional(),
    })
    .optional(),
});

export type UserPromptSubmitOutput = z.infer<typeof UserPromptSubmitOutputSchema>;

/** SessionStart specific output */
export const SessionStartOutputSchema = HookOutputBaseSchema.extend({
  hookSpecificOutput: z
    .object({
      hookEventName: z.literal('SessionStart'),
      additionalContext: z.string().optional(),
    })
    .optional(),
});

export type SessionStartOutput = z.infer<typeof SessionStartOutputSchema>;

/** PermissionRequest specific output */
export const PermissionRequestOutputSchema = HookOutputBaseSchema.extend({
  hookSpecificOutput: z
    .object({
      hookEventName: z.literal('PermissionRequest'),
      decision: z.object({
        behavior: z.enum(['allow', 'deny']),
        updatedInput: z.record(z.string(), z.unknown()).optional(),
        message: z.string().optional(),
        interrupt: z.boolean().optional(),
      }),
    })
    .optional(),
});

export type PermissionRequestOutput = z.infer<typeof PermissionRequestOutputSchema>;

// ============================================================================
// Exit Codes
// ============================================================================

/** Exit codes per Claude CLI protocol */
export const EXIT_SUCCESS = 0;
export const EXIT_BLOCK = 2;
export const EXIT_ERROR = 1;

// ============================================================================
// Handler Result Type
// ============================================================================

export interface HookResult {
  exitCode: number;
  stdout?: string;
  stderr?: string;
}
