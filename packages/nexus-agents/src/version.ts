/**
 * nexus-agents - Version constant
 *
 * Injected at build time via tsup define from package.json.
 * Do NOT edit this value manually — it is replaced during build.
 */

declare const __NEXUS_VERSION__: string;

export const VERSION: string = typeof __NEXUS_VERSION__ !== 'undefined' ? __NEXUS_VERSION__ : 'dev';
