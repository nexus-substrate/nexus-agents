#!/usr/bin/env node
/**
 * Nexus Agents - Main Entry Point
 *
 * This is the main application entry point that starts the MCP server.
 * It re-exports the CLI functionality for use as a library or direct execution.
 */

// Re-export CLI for programmatic use
export { VERSION } from '@nexus-agents/cli';

// Import and run CLI when executed directly
import '@nexus-agents/cli';
