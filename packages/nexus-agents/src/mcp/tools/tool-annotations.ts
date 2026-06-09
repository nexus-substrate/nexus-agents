/**
 * MCP Tool Annotations Registry — DERIVED VIEW (#993; folded into the manifest #3597).
 *
 * The per-tool annotation + side-effect DATA now lives in the canonical
 * {@link TOOL_MANIFEST} (one `{ name, annotations, sideEffects }` entry per tool,
 * #3597 increment 2 of #3563). This module is the keyed-record + accessor view
 * over that data: `TOOL_ANNOTATIONS` is derived from the manifest (each entry's
 * `.annotations`/`.sideEffects` are the SAME objects the manifest holds — no
 * clone, so reference identity is preserved for the live accessor in
 * `mcp/tool-annotations.ts`). The annotation TYPES are defined in the manifest
 * (the import-free leaf) and re-exported here for the existing consumers.
 *
 * @module mcp/tools/tool-annotations
 * (Source: Issue #993 — Document MCP tool side effects in schema metadata)
 */

import {
  TOOL_MANIFEST,
  type SideEffectCategory,
  type SideEffect,
  type ToolAnnotations,
  type ToolSideEffectsEntry,
} from './tool-manifest.js';

// Re-export the annotation types from their canonical home (the manifest leaf)
// so existing consumers can keep importing them from this module.
export type { SideEffectCategory, SideEffect, ToolAnnotations, ToolSideEffectsEntry };

/**
 * Canonical registry of tool annotations and side effects, keyed by tool name.
 * Derived from {@link TOOL_MANIFEST}; each value's `annotations`/`sideEffects`
 * reference the manifest entry's own objects (preserving identity).
 */
export const TOOL_ANNOTATIONS: Readonly<Record<string, ToolSideEffectsEntry>> = Object.freeze(
  Object.fromEntries(
    TOOL_MANIFEST.map((entry) => [
      entry.name,
      { annotations: entry.annotations, sideEffects: entry.sideEffects },
    ])
  )
);

/**
 * Returns the annotations for a given tool, or undefined if not found.
 */
export function getToolAnnotations(toolName: string): ToolSideEffectsEntry | undefined {
  return TOOL_ANNOTATIONS[toolName];
}

/**
 * Returns only the MCP protocol annotations for a tool (for registerTool config).
 */
export function getMcpAnnotations(toolName: string): ToolAnnotations | undefined {
  return TOOL_ANNOTATIONS[toolName]?.annotations;
}

/**
 * Returns side effects for a tool filtered by category.
 */
export function getSideEffectsByCategory(
  toolName: string,
  category: SideEffectCategory
): readonly SideEffect[] {
  const entry = TOOL_ANNOTATIONS[toolName];
  if (entry === undefined) return [];
  return entry.sideEffects.filter((se) => se.category === category);
}
