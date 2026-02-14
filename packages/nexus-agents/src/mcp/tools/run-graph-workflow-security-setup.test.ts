/**
 * Tests for security scan setup graph workflow templates.
 *
 * Three independent pipelines:
 * - security-setup-semgrep (SAST)
 * - security-setup-zap (DAST)
 * - security-setup-trivy (SCA/container)
 *
 * (Source: Issue #1075 — Security Scan Setup graph workflow templates)
 */

import { describe, it, expect } from 'vitest';
import { executeGraph } from '../../orchestration/graph/index.js';
import {
  getSecuritySetupRegistry,
  semgrepDetectStackHandler,
  semgrepGenerateConfigHandler,
  semgrepValidateHandler,
  zapConfigureTargetHandler,
  zapGenerateConfigHandler,
  zapValidateHandler,
  trivyDetectStackHandler,
  trivyGenerateConfigHandler,
  trivyValidateHandler,
  SEMGREP_SETUP_METADATA,
  ZAP_SETUP_METADATA,
  TRIVY_SETUP_METADATA,
  SECURITY_SETUP_TEMPLATES,
} from './run-graph-workflow-security-setup.js';

// ============================================================================
// Test Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function runGraph(name: string, inputs: Record<string, unknown>) {
  const registry = getSecuritySetupRegistry();
  const factory = registry.get(name);
  if (!factory) throw new Error(`No factory for '${name}'`);
  const graph = factory();
  if (!graph) throw new Error(`Failed to compile '${name}'`);
  const result = await executeGraph(graph, inputs);
  if (!result.ok) throw new Error(`Execution failed: ${result.error.message}`);
  return result.value;
}

// ============================================================================
// Registry & Metadata
// ============================================================================

describe('security setup registry', () => {
  it('contains 3 templates', () => {
    const registry = getSecuritySetupRegistry();
    expect(registry.size).toBe(3);
  });

  it('has expected template names', () => {
    const registry = getSecuritySetupRegistry();
    expect([...registry.keys()]).toEqual([
      'security-setup-semgrep',
      'security-setup-zap',
      'security-setup-trivy',
    ]);
  });

  it('all factories compile successfully', () => {
    const registry = getSecuritySetupRegistry();
    for (const [name, factory] of registry) {
      expect(factory(), `${name} failed to compile`).toBeDefined();
    }
  });
});

describe('SECURITY_SETUP_TEMPLATES metadata', () => {
  it('has 3 entries', () => {
    expect(SECURITY_SETUP_TEMPLATES).toHaveLength(3);
  });

  it('all have 3 nodes and no conditional edges', () => {
    for (const meta of SECURITY_SETUP_TEMPLATES) {
      expect(meta.nodeCount).toBe(3);
      expect(meta.hasConditionalEdges).toBe(false);
    }
  });

  it('semgrep metadata is correct', () => {
    expect(SEMGREP_SETUP_METADATA.name).toBe('security-setup-semgrep');
    expect(SEMGREP_SETUP_METADATA.inputFields).toEqual(['stack']);
  });

  it('zap metadata is correct', () => {
    expect(ZAP_SETUP_METADATA.name).toBe('security-setup-zap');
    expect(ZAP_SETUP_METADATA.inputFields).toEqual(['targetUrl', 'failThreshold']);
  });

  it('trivy metadata is correct', () => {
    expect(TRIVY_SETUP_METADATA.name).toBe('security-setup-trivy');
    expect(TRIVY_SETUP_METADATA.inputFields).toEqual(['stack', 'scanType']);
  });
});

// ============================================================================
// Semgrep — Node Handlers
// ============================================================================

describe('semgrepDetectStackHandler', () => {
  it('detects valid stack', async () => {
    const r = await semgrepDetectStackHandler({ stack: 'python' });
    expect(r['detectedStack']).toBe('python');
    expect(String(r['rulesets'])).toContain('p/python');
  });

  it('defaults to generic for unknown stack', async () => {
    const r = await semgrepDetectStackHandler({ stack: 'cobol' });
    expect(r['detectedStack']).toBe('generic');
    expect(r['rulesets']).toBe('p/default');
  });

  it('normalizes case', async () => {
    const r = await semgrepDetectStackHandler({ stack: 'Node' });
    expect(r['detectedStack']).toBe('node');
  });

  it('detects rust stack', async () => {
    const r = await semgrepDetectStackHandler({ stack: 'rust' });
    expect(r['detectedStack']).toBe('rust');
    expect(r['rulesets']).toBe('p/rust');
  });

  it('detects cpp stack', async () => {
    const r = await semgrepDetectStackHandler({ stack: 'cpp' });
    expect(r['detectedStack']).toBe('cpp');
    expect(r['rulesets']).toBe('p/c');
  });

  it('detects kotlin stack', async () => {
    const r = await semgrepDetectStackHandler({ stack: 'kotlin' });
    expect(r['detectedStack']).toBe('kotlin');
    expect(r['rulesets']).toBe('p/kotlin');
  });

  it('detects php stack', async () => {
    const r = await semgrepDetectStackHandler({ stack: 'php' });
    expect(r['detectedStack']).toBe('php');
    expect(r['rulesets']).toBe('p/php');
  });

  it('detects shell stack', async () => {
    const r = await semgrepDetectStackHandler({ stack: 'shell' });
    expect(r['detectedStack']).toBe('shell');
    expect(r['rulesets']).toBe('p/bash');
  });

  it('detects hcl stack', async () => {
    const r = await semgrepDetectStackHandler({ stack: 'hcl' });
    expect(r['detectedStack']).toBe('hcl');
    expect(r['rulesets']).toBe('p/terraform');
  });

  it('detects yaml stack', async () => {
    const r = await semgrepDetectStackHandler({ stack: 'yaml' });
    expect(r['detectedStack']).toBe('yaml');
    expect(r['rulesets']).toBe('p/kubernetes');
  });

  it('aliases typescript to node', async () => {
    const r = await semgrepDetectStackHandler({ stack: 'typescript' });
    expect(r['detectedStack']).toBe('node');
    expect(String(r['rulesets'])).toContain('p/javascript');
  });

  it('aliases terraform to hcl', async () => {
    const r = await semgrepDetectStackHandler({ stack: 'terraform' });
    expect(r['detectedStack']).toBe('hcl');
    expect(r['rulesets']).toBe('p/terraform');
  });

  it('aliases bash to shell', async () => {
    const r = await semgrepDetectStackHandler({ stack: 'bash' });
    expect(r['detectedStack']).toBe('shell');
    expect(r['rulesets']).toBe('p/bash');
  });

  it('aliases kubernetes to yaml', async () => {
    const r = await semgrepDetectStackHandler({ stack: 'kubernetes' });
    expect(r['detectedStack']).toBe('yaml');
    expect(r['rulesets']).toBe('p/kubernetes');
  });
});

describe('semgrepGenerateConfigHandler', () => {
  it('generates CI workflow with semgrep job', async () => {
    const r = await semgrepGenerateConfigHandler({ rulesets: 'p/python' });
    const ci = String(r['ciConfig']);
    expect(ci).toContain('name: Semgrep SAST');
    expect(ci).toContain('semgrep scan');
    expect(ci).toContain('p/python');
  });

  it('generates scanner config with rules', async () => {
    const r = await semgrepGenerateConfigHandler({ rulesets: 'p/default' });
    const cfg = String(r['scannerConfig']);
    expect(cfg).toContain('.semgrep.yml');
    expect(cfg).toContain('eval(...)');
    expect(cfg).toContain('severity: ERROR');
  });
});

describe('semgrepValidateHandler', () => {
  it('passes valid config', async () => {
    const r = await semgrepValidateHandler({
      ciConfig: 'name: X\non: push\njobs:\n  semgrep:',
      scannerConfig: 'rules: []',
    });
    expect(r['validationErrors']).toEqual([]);
  });

  it('detects missing semgrep job', async () => {
    const r = await semgrepValidateHandler({
      ciConfig: 'name: X\non: push\njobs:\n  other:',
      scannerConfig: 'rules: []',
    });
    expect(r['validationErrors']).toContain('Missing semgrep job');
  });
});

// ============================================================================
// Semgrep — Full Execution
// ============================================================================

describe('security-setup-semgrep full execution', () => {
  it('runs with node stack', async () => {
    const result = await runGraph('security-setup-semgrep', { stack: 'node' });
    const output = String(result.finalState['output']);
    expect(output).toContain('Semgrep SAST');
    expect(output).toContain('p/javascript');
  });

  it('runs with python stack', async () => {
    const result = await runGraph('security-setup-semgrep', {
      stack: 'python',
    });
    const output = String(result.finalState['output']);
    expect(output).toContain('p/python');
  });

  it('runs with generic stack', async () => {
    const result = await runGraph('security-setup-semgrep', { stack: '' });
    expect(result.finalState['detectedStack']).toBe('generic');
  });

  it('executes 3 nodes', async () => {
    const result = await runGraph('security-setup-semgrep', { stack: 'go' });
    expect(result.nodeResults).toHaveLength(3);
  });

  it('generates both CI and scanner config', async () => {
    const result = await runGraph('security-setup-semgrep', { stack: 'node' });
    const output = String(result.finalState['output']);
    expect(output).toContain('## CI Workflow');
    expect(output).toContain('## Scanner Configuration');
  });
});

// ============================================================================
// ZAP — Node Handlers
// ============================================================================

describe('zapConfigureTargetHandler', () => {
  it('uses provided URL', async () => {
    const r = await zapConfigureTargetHandler({
      targetUrl: 'https://app.example.com',
      failThreshold: 'medium',
    });
    expect(r['resolvedUrl']).toBe('https://app.example.com');
    expect(r['resolvedThreshold']).toBe('medium');
  });

  it('defaults URL when empty', async () => {
    const r = await zapConfigureTargetHandler({
      targetUrl: '',
      failThreshold: 'high',
    });
    expect(r['resolvedUrl']).toBe('http://localhost:3000');
  });

  it('defaults threshold for invalid input', async () => {
    const r = await zapConfigureTargetHandler({
      targetUrl: 'https://x.com',
      failThreshold: 'invalid',
    });
    expect(r['resolvedThreshold']).toBe('high');
  });
});

describe('zapGenerateConfigHandler', () => {
  it('generates CI workflow with ZAP job', async () => {
    const r = await zapGenerateConfigHandler({
      resolvedUrl: 'https://app.example.com',
      resolvedThreshold: 'high',
    });
    const ci = String(r['ciConfig']);
    expect(ci).toContain('name: ZAP DAST');
    expect(ci).toContain('zaproxy/action-baseline');
    expect(ci).toContain('https://app.example.com');
  });

  it('sets fail_action based on threshold', async () => {
    const low = await zapGenerateConfigHandler({
      resolvedUrl: 'http://localhost',
      resolvedThreshold: 'low',
    });
    expect(String(low['ciConfig'])).toContain('fail_action: true');

    const high = await zapGenerateConfigHandler({
      resolvedUrl: 'http://localhost',
      resolvedThreshold: 'high',
    });
    expect(String(high['ciConfig'])).toContain('fail_action: warn');
  });

  it('generates automation plan with spider', async () => {
    const r = await zapGenerateConfigHandler({
      resolvedUrl: 'https://app.example.com',
      resolvedThreshold: 'medium',
    });
    const cfg = String(r['scannerConfig']);
    expect(cfg).toContain('zap-automation.yaml');
    expect(cfg).toContain('spider');
    expect(cfg).toContain('passiveScan-wait');
    expect(cfg).toContain('activeScan');
  });
});

describe('zapValidateHandler', () => {
  it('passes valid config', async () => {
    const r = await zapValidateHandler({
      ciConfig: 'name: X\non: push\njobs:\n  zap:',
      scannerConfig: 'spider config',
    });
    expect(r['validationErrors']).toEqual([]);
  });

  it('detects missing ZAP job', async () => {
    const r = await zapValidateHandler({
      ciConfig: 'name: X\non: push\njobs:\n  other:',
      scannerConfig: 'spider config',
    });
    expect(r['validationErrors']).toContain('Missing ZAP job');
  });

  it('detects missing spider config', async () => {
    const r = await zapValidateHandler({
      ciConfig: 'name: X\non: push\njobs:\n  zap:',
      scannerConfig: 'no scan config here',
    });
    expect(r['validationErrors']).toContain('Missing spider config');
  });
});

// ============================================================================
// ZAP — Full Execution
// ============================================================================

describe('security-setup-zap full execution', () => {
  it('runs with target URL', async () => {
    const result = await runGraph('security-setup-zap', {
      targetUrl: 'https://staging.example.com',
      failThreshold: 'medium',
    });
    const output = String(result.finalState['output']);
    expect(output).toContain('ZAP DAST');
    expect(output).toContain('https://staging.example.com');
  });

  it('runs with default URL', async () => {
    const result = await runGraph('security-setup-zap', {});
    const output = String(result.finalState['output']);
    expect(output).toContain('http://localhost:3000');
  });

  it('executes 3 nodes', async () => {
    const result = await runGraph('security-setup-zap', {
      targetUrl: 'https://x.com',
    });
    expect(result.nodeResults).toHaveLength(3);
  });

  it('includes automation plan in output', async () => {
    const result = await runGraph('security-setup-zap', {
      targetUrl: 'https://app.example.com',
    });
    const output = String(result.finalState['output']);
    expect(output).toContain('## Scanner Configuration');
    expect(output).toContain('spider');
  });

  it('uses low threshold correctly', async () => {
    const result = await runGraph('security-setup-zap', {
      targetUrl: 'https://x.com',
      failThreshold: 'low',
    });
    const ci = String(result.finalState['ciConfig']);
    expect(ci).toContain('fail_action: true');
  });
});

// ============================================================================
// Trivy — Node Handlers
// ============================================================================

describe('trivyDetectStackHandler', () => {
  it('detects valid stack', async () => {
    const r = await trivyDetectStackHandler({ stack: 'go', scanType: 'fs' });
    expect(r['detectedStack']).toBe('go');
    expect(r['resolvedScanType']).toBe('fs');
  });

  it('resolves image scan type', async () => {
    const r = await trivyDetectStackHandler({ stack: 'node', scanType: 'image' });
    expect(r['resolvedScanType']).toBe('image');
  });

  it('defaults scan type for invalid input', async () => {
    const r = await trivyDetectStackHandler({ stack: 'node', scanType: 'invalid' });
    expect(r['resolvedScanType']).toBe('fs');
  });
});

describe('trivyGenerateConfigHandler', () => {
  it('generates CI workflow with trivy job', async () => {
    const r = await trivyGenerateConfigHandler({ resolvedScanType: 'fs' });
    const ci = String(r['ciConfig']);
    expect(ci).toContain('name: Trivy Security Scan');
    expect(ci).toContain('trivy-action');
    expect(ci).toContain("scan-type: 'fs'");
  });

  it('uses image scan type', async () => {
    const r = await trivyGenerateConfigHandler({ resolvedScanType: 'image' });
    const ci = String(r['ciConfig']);
    expect(ci).toContain("scan-type: 'image'");
  });

  it('generates scanner config with skip dirs', async () => {
    const r = await trivyGenerateConfigHandler({ resolvedScanType: 'fs' });
    const cfg = String(r['scannerConfig']);
    expect(cfg).toContain('trivy.yaml');
    expect(cfg).toContain('skip-dirs');
    expect(cfg).toContain('node_modules');
  });
});

describe('trivyValidateHandler', () => {
  it('passes valid config', async () => {
    const r = await trivyValidateHandler({
      ciConfig: 'name: X\non: push\njobs:\n  trivy:',
      scannerConfig: 'severity: CRITICAL',
    });
    expect(r['validationErrors']).toEqual([]);
  });

  it('detects missing trivy job', async () => {
    const r = await trivyValidateHandler({
      ciConfig: 'name: X\non: push\njobs:\n  other:',
      scannerConfig: 'config',
    });
    expect(r['validationErrors']).toContain('Missing trivy job');
  });
});

// ============================================================================
// Trivy — Full Execution
// ============================================================================

describe('security-setup-trivy full execution', () => {
  it('runs with default inputs', async () => {
    const result = await runGraph('security-setup-trivy', { stack: 'node' });
    const output = String(result.finalState['output']);
    expect(output).toContain('Trivy Security Scan');
  });

  it('runs with image scan type', async () => {
    const result = await runGraph('security-setup-trivy', {
      stack: 'node',
      scanType: 'image',
    });
    const ci = String(result.finalState['ciConfig']);
    expect(ci).toContain("'image'");
  });

  it('executes 3 nodes', async () => {
    const result = await runGraph('security-setup-trivy', { stack: 'go' });
    expect(result.nodeResults).toHaveLength(3);
  });

  it('produces valid output structure', async () => {
    const result = await runGraph('security-setup-trivy', { stack: 'python' });
    const output = String(result.finalState['output']);
    expect(output).toContain('## CI Workflow');
    expect(output).toContain('## Scanner Configuration');
  });

  it('has no validation errors for well-formed config', async () => {
    const result = await runGraph('security-setup-trivy', { stack: 'node' });
    const errors = result.finalState['validationErrors'] as string[];
    expect(errors).toHaveLength(0);
  });
});
