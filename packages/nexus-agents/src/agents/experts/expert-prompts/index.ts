/**
 * nexus-agents/agents - Expert Prompts Module
 *
 * Re-exports all modular expert prompts and the prompt composer.
 * Provides backward-compatible aliases for the original constant names.
 */

// Base prompts (new modular names)
export { SECURITY_EXPERT_BASE_PROMPT } from './security-expert.js';
export { TESTING_EXPERT_BASE_PROMPT } from './testing-expert.js';
export { CODE_EXPERT_BASE_PROMPT } from './code-expert.js';
export { ARCHITECTURE_EXPERT_BASE_PROMPT } from './architecture-expert.js';
export { DOCUMENTATION_EXPERT_BASE_PROMPT } from './documentation-expert.js';
export { RESEARCH_EXPERT_BASE_PROMPT } from './research-expert.js';
export { PM_EXPERT_BASE_PROMPT } from './pm-expert.js';
export { UX_EXPERT_BASE_PROMPT } from './ux-expert.js';
export { INFRASTRUCTURE_EXPERT_BASE_PROMPT } from './infrastructure-expert.js';

// Prompt composer
export { PromptComposer } from './prompt-composer.js';
export type { KnowledgeSection } from './prompt-composer.js';

// Backward-compatible aliases (original constant names)
import { SECURITY_EXPERT_BASE_PROMPT } from './security-expert.js';
import { TESTING_EXPERT_BASE_PROMPT } from './testing-expert.js';
import { CODE_EXPERT_BASE_PROMPT } from './code-expert.js';
import { ARCHITECTURE_EXPERT_BASE_PROMPT } from './architecture-expert.js';
import { DOCUMENTATION_EXPERT_BASE_PROMPT } from './documentation-expert.js';

/** Alias for backward compatibility with existing expert classes */
export const SECURITY_EXPERT_SYSTEM_PROMPT = SECURITY_EXPERT_BASE_PROMPT;

/** Alias for backward compatibility with existing expert classes */
export const TESTING_EXPERT_SYSTEM_PROMPT = TESTING_EXPERT_BASE_PROMPT;

/** Alias for backward compatibility with existing expert classes */
export const CODE_EXPERT_SYSTEM_PROMPT = CODE_EXPERT_BASE_PROMPT;

/** Alias for backward compatibility with existing expert classes */
export const ARCHITECTURE_EXPERT_SYSTEM_PROMPT = ARCHITECTURE_EXPERT_BASE_PROMPT;

/** Alias for backward compatibility with existing expert classes */
export const DOCUMENTATION_EXPERT_SYSTEM_PROMPT = DOCUMENTATION_EXPERT_BASE_PROMPT;
