/**
 * nexus-agents/agents - Expert Documentation Types
 *
 * Type definitions for documentation-related expert outputs.
 * Extracted from expert-types.ts to maintain file size limits.
 */

import type { ExpertOutput } from './expert-types.js';

/**
 * Documentation result from DocumentationExpert.
 */
export interface DocumentationResult extends ExpertOutput {
  /** Documentation type */
  documentationType: 'api' | 'readme' | 'guide' | 'reference';
  /** Generated documentation sections */
  sections?: DocumentationSection[] | undefined;
  /** API documentation */
  apiDocs?: ApiDocumentation | undefined;
}

/**
 * Documentation section.
 */
export interface DocumentationSection {
  /** Section title */
  title: string;
  /** Section content */
  content: string;
  /** Subsections */
  subsections?: DocumentationSection[];
}

/**
 * API documentation structure.
 */
export interface ApiDocumentation {
  /** API endpoints or functions */
  endpoints: ApiEndpoint[];
  /** Data types */
  types: ApiType[];
}

/**
 * API endpoint documentation.
 */
export interface ApiEndpoint {
  /** Endpoint name */
  name: string;
  /** Description */
  description: string;
  /** Parameters */
  parameters: Array<{
    name: string;
    type: string;
    description: string;
    required: boolean;
  }>;
  /** Return type */
  returns: { type: string; description: string };
  /** Example usage */
  example?: string;
}

/**
 * API type documentation.
 */
export interface ApiType {
  /** Type name */
  name: string;
  /** Description */
  description: string;
  /** Properties */
  properties: Array<{
    name: string;
    type: string;
    description: string;
    optional: boolean;
  }>;
}
