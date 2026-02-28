#!/usr/bin/env node
/**
 * Postinstall script — prints setup hint after npm install.
 * Plain JS (no build required, runs before dist/ exists).
 *
 * @see Issue #1251
 */

/* eslint-disable no-console */
console.log('\n\x1b[36mnexus-agents\x1b[0m installed successfully.');
console.log('Run \x1b[1mnexus-agents setup\x1b[0m to configure MCP, data directories, and hooks.');
console.log('Quick start: https://github.com/williamzujkowski/nexus-agents#quick-start\n');
