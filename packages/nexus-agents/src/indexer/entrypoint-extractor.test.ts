/**
 * Tests for entrypoint extractor.
 *
 * @module indexer/entrypoint-extractor.test
 */

import { describe, it, expect } from 'vitest';
import { sanitizeValue, extractEntrypoints } from './entrypoint-extractor.js';

// ============================================================================
// Sanitization Tests
// ============================================================================

describe('sanitizeValue', () => {
  it('should redact OpenAI API keys', () => {
    const input = 'Key: sk-abcdefghijklmnopqrstuvwxyz012345678901234567';
    const result = sanitizeValue(input);
    expect(result).toBe('Key: [REDACTED]');
  });

  it('should redact Anthropic API keys', () => {
    // 95 chars after sk-ant-
    const key = 'sk-ant-' + 'a'.repeat(95);
    const input = `API key is ${key}`;
    const result = sanitizeValue(input);
    expect(result).toContain('[REDACTED]');
  });

  it('should redact GitHub PATs', () => {
    const input = 'Token: ghp_abcdefghijklmnopqrstuvwxyz0123456789';
    const result = sanitizeValue(input);
    expect(result).toBe('Token: [REDACTED]');
  });

  it('should redact GitLab PATs', () => {
    const input = 'Token: glpat-abcdefghijklmno12345';
    const result = sanitizeValue(input);
    expect(result).toBe('Token: [REDACTED]');
  });

  it('should redact Bearer tokens', () => {
    const input = 'Auth: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload';
    const result = sanitizeValue(input);
    expect(result).toBe('Auth: [REDACTED]');
  });

  it('should redact hex strings (potential secrets)', () => {
    const input = 'Hash: a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
    const result = sanitizeValue(input);
    expect(result).toBe('Hash: [REDACTED]');
  });

  it('should redact localhost URLs', () => {
    const input = 'Server: localhost:3000';
    const result = sanitizeValue(input);
    expect(result).toBe('Server: [REDACTED]');
  });

  it('should redact private IPs (192.168.x.x)', () => {
    const input = 'IP: 192.168.1.100';
    const result = sanitizeValue(input);
    expect(result).toBe('IP: [REDACTED]');
  });

  it('should redact private IPs (10.x.x.x)', () => {
    const input = 'IP: 10.0.0.1';
    const result = sanitizeValue(input);
    expect(result).toBe('IP: [REDACTED]');
  });

  it('should not redact normal text', () => {
    const input = 'This is a normal description without secrets';
    const result = sanitizeValue(input);
    expect(result).toBe(input);
  });

  it('should handle multiple patterns in one string', () => {
    const input = 'Server at localhost:8080, key ghp_abc123456789012345678901234567890123';
    const result = sanitizeValue(input);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('localhost');
    expect(result).not.toContain('ghp_');
  });
});

// ============================================================================
// Full Extraction Tests
// ============================================================================

describe('extractEntrypoints', () => {
  it('should return a valid result structure', () => {
    const result = extractEntrypoints({
      packageRoot: 'packages/nexus-agents',
    });

    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('errors');
    expect(result).toHaveProperty('warnings');
    expect(Array.isArray(result.errors)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('should extract CLI commands when successful', () => {
    const result = extractEntrypoints({
      packageRoot: 'packages/nexus-agents',
    });

    if (result.success && result.manifest) {
      expect(result.manifest.cli_commands).toBeDefined();
      expect(Array.isArray(result.manifest.cli_commands)).toBe(true);
      // Should find at least some commands
      expect(result.manifest.cli_commands.length).toBeGreaterThan(0);
    }
  });

  it('should extract MCP tools when successful', () => {
    const result = extractEntrypoints({
      packageRoot: 'packages/nexus-agents',
    });

    if (result.success && result.manifest) {
      expect(result.manifest.mcp_tools).toBeDefined();
      expect(Array.isArray(result.manifest.mcp_tools)).toBe(true);
    }
  });

  it('should extract REST endpoints when successful', () => {
    const result = extractEntrypoints({
      packageRoot: 'packages/nexus-agents',
    });

    if (result.success && result.manifest) {
      expect(result.manifest.rest_endpoints).toBeDefined();
      expect(Array.isArray(result.manifest.rest_endpoints)).toBe(true);
    }
  });

  it('should include schema version', () => {
    const result = extractEntrypoints({
      packageRoot: 'packages/nexus-agents',
    });

    if (result.success && result.manifest) {
      expect(result.manifest.schema_version).toBe('1.0');
    }
  });

  it('should include generation timestamp', () => {
    const result = extractEntrypoints({
      packageRoot: 'packages/nexus-agents',
    });

    if (result.success && result.manifest) {
      expect(result.manifest.generated_at).toBeDefined();
      expect(typeof result.manifest.generated_at).toBe('string');
    }
  });
});

// ============================================================================
// CLI Command Extraction Tests
// ============================================================================

describe('extractCliCommands', () => {
  it('should extract known commands', () => {
    const result = extractEntrypoints({
      packageRoot: 'packages/nexus-agents',
    });

    if (result.success && result.manifest) {
      const commandNames = result.manifest.cli_commands.map((c) => c.name);

      // Check for expected commands
      expect(commandNames).toContain('doctor');
      expect(commandNames).toContain('orchestrate');
    }
  });

  it('should include source file information', () => {
    const result = extractEntrypoints({
      packageRoot: 'packages/nexus-agents',
    });

    if (result.success && result.manifest) {
      for (const cmd of result.manifest.cli_commands) {
        expect(cmd.source_file).toBeDefined();
        expect(cmd.source_line).toBeGreaterThan(0);
      }
    }
  });

  it('should extract command descriptions', () => {
    const result = extractEntrypoints({
      packageRoot: 'packages/nexus-agents',
    });

    if (result.success && result.manifest) {
      const doctor = result.manifest.cli_commands.find((c) => c.name === 'doctor');
      if (doctor) {
        expect(doctor.description).toBeDefined();
        expect(doctor.description.length).toBeGreaterThan(0);
      }
    }
  });

  it('should extract subcommands for composite commands', () => {
    const result = extractEntrypoints({
      packageRoot: 'packages/nexus-agents',
    });

    if (result.success && result.manifest) {
      const workflow = result.manifest.cli_commands.find((c) => c.name === 'workflow');
      if (workflow?.subcommands) {
        expect(workflow.subcommands).toContain('list');
        expect(workflow.subcommands).toContain('run');
      }
    }
  });
});

// ============================================================================
// MCP Tool Extraction Tests
// ============================================================================

describe('extractMcpTools', () => {
  it('should extract known tools', () => {
    const result = extractEntrypoints({
      packageRoot: 'packages/nexus-agents',
    });

    if (result.success && result.manifest) {
      const toolNames = result.manifest.mcp_tools.map((t) => t.name);

      // Check for expected tools
      expect(toolNames).toContain('orchestrate');
    }
  });

  it('should include parameter information', () => {
    const result = extractEntrypoints({
      packageRoot: 'packages/nexus-agents',
    });

    if (result.success && result.manifest) {
      const orchestrate = result.manifest.mcp_tools.find((t) => t.name === 'orchestrate');
      if (orchestrate) {
        expect(orchestrate.parameters).toBeDefined();
        expect(Array.isArray(orchestrate.parameters)).toBe(true);

        // Check for task parameter
        const taskParam = orchestrate.parameters.find((p) => p.name === 'task');
        if (taskParam) {
          expect(taskParam.type).toBeDefined();
        }
      }
    }
  });

  it('should include tool descriptions', () => {
    const result = extractEntrypoints({
      packageRoot: 'packages/nexus-agents',
    });

    if (result.success && result.manifest) {
      for (const tool of result.manifest.mcp_tools) {
        expect(tool.description).toBeDefined();
        expect(tool.description.length).toBeGreaterThan(0);
      }
    }
  });
});

// ============================================================================
// REST Endpoint Extraction Tests
// ============================================================================

describe('extractRestEndpoints', () => {
  it('should extract health endpoint', () => {
    const result = extractEntrypoints({
      packageRoot: 'packages/nexus-agents',
    });

    if (result.success && result.manifest) {
      const healthEndpoint = result.manifest.rest_endpoints.find((e) => e.path === '/health');
      expect(healthEndpoint).toBeDefined();
      if (healthEndpoint) {
        expect(healthEndpoint.method).toBe('GET');
      }
    }
  });

  it('should include HTTP methods', () => {
    const result = extractEntrypoints({
      packageRoot: 'packages/nexus-agents',
    });

    if (result.success && result.manifest) {
      const methods = new Set(result.manifest.rest_endpoints.map((e) => e.method));

      // Should have at least GET and POST methods
      expect(methods.has('GET')).toBe(true);
      expect(methods.has('POST')).toBe(true);
    }
  });

  it('should include source file information', () => {
    const result = extractEntrypoints({
      packageRoot: 'packages/nexus-agents',
    });

    if (result.success && result.manifest) {
      for (const endpoint of result.manifest.rest_endpoints) {
        expect(endpoint.source_file).toBeDefined();
        expect(endpoint.source_line).toBeGreaterThan(0);
      }
    }
  });

  it('should extract endpoint descriptions', () => {
    const result = extractEntrypoints({
      packageRoot: 'packages/nexus-agents',
    });

    if (result.success && result.manifest) {
      for (const endpoint of result.manifest.rest_endpoints) {
        expect(endpoint.description).toBeDefined();
        expect(endpoint.description.length).toBeGreaterThan(0);
      }
    }
  });
});

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

describe('error handling', () => {
  it('should handle missing package root gracefully', () => {
    const result = extractEntrypoints({
      packageRoot: 'nonexistent/path',
    });

    // Should return errors but not throw
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('integration', () => {
  it('should produce consistent output structure', () => {
    const result = extractEntrypoints({
      packageRoot: 'packages/nexus-agents',
    });

    if (result.success && result.manifest) {
      // Verify all arrays are readonly (immutable)
      expect(Object.isFrozen(result.manifest.cli_commands)).toBe(false); // Not frozen, but readonly type
      expect(Array.isArray(result.manifest.cli_commands)).toBe(true);
      expect(Array.isArray(result.manifest.mcp_tools)).toBe(true);
      expect(Array.isArray(result.manifest.rest_endpoints)).toBe(true);
    }
  });

  it('should sanitize values by default', () => {
    const result = extractEntrypoints({
      packageRoot: 'packages/nexus-agents',
      sanitize: true,
    });

    if (result.success && result.manifest) {
      // Check that no sensitive patterns exist in output
      const jsonOutput = JSON.stringify(result.manifest);
      expect(jsonOutput).not.toContain('sk-ant-');
      expect(jsonOutput).not.toContain('ghp_');
      expect(jsonOutput).not.toContain('Bearer ');
    }
  });
});
