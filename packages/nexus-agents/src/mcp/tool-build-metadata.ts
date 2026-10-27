/** Internal producer build metadata policy shared by ordinary and task tool results. */
import { VERSION } from '../version.js';

/**
 * `_meta` key naming the build that produced a tool result (#5008).
 *
 * The MCP server a client is talking to is routinely a pinned global install
 * rather than the working tree, so a result read as evidence about "the
 * current code" could be answering from a months-old build with nothing in the
 * response to say so.
 *
 * It rides in `_meta` for the same reason the error envelope does (#2649):
 * `structuredContent` is validated against the tool's `outputSchema` with
 * `additionalProperties: false`, so an undeclared field there fails every call
 * with -32602 (#5044/#5045). `_meta` is the spec's out-of-band channel and is
 * never schema-validated.
 *
 * Kept module-private: the tests assert the literal wire name, which pins what
 * a client actually sees rather than agreeing with the constant.
 */
const BUILD_META_KEY = 'nexus-agents/build';

/** Preserve existing metadata and identify the build producing this new result. */
export function buildToolMetadata(
  meta: Record<string, unknown> | undefined
): Record<string, unknown> {
  return { ...meta, [BUILD_META_KEY]: { version: VERSION } };
}
