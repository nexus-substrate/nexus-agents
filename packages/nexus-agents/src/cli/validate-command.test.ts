/**
 * Tests for the validate command.
 * (Source: Issue #1598)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock doctor and governance modules before import
vi.mock('./doctor.js', () => ({
  runDoctor: vi.fn(),
}));

vi.mock('../governance/index.js', () => ({
  calculateFitnessScore: vi.fn(),
}));

vi.mock('../version.js', () => ({
  VERSION: '0.0.0-test',
}));

import { runValidate } from './validate-command.js';
import type { ValidateResult } from './validate-command.js';
import { runDoctor } from './doctor.js';
import type { DoctorResult } from './doctor.js';
import { calculateFitnessScore } from '../governance/index.js';
import type { FitnessAudit } from '../governance/index.js';

const mockRunDoctor = runDoctor as unknown as ReturnType<typeof vi.fn>;
const mockCalcFitness = calculateFitnessScore as unknown as ReturnType<typeof vi.fn>;

function makeDoctorResult(overrides: Partial<DoctorResult> = {}): DoctorResult {
  return {
    clis: [
      {
        name: 'claude' as const,
        installed: true,
        version: '1.0.0',
        versionStatus: 'supported' as const,
        authenticated: true,
        authState: 'authenticated',
      },
      {
        name: 'gemini' as const,
        installed: true,
        version: '1.0.0',
        versionStatus: 'supported' as const,
        authenticated: true,
        authState: 'authenticated',
      },
      {
        name: 'codex' as const,
        installed: true,
        version: '1.0.0',
        versionStatus: 'supported' as const,
        authenticated: true,
        authState: 'authenticated',
      },
      {
        name: 'opencode' as const,
        installed: true,
        version: '1.0.0',
        versionStatus: 'supported' as const,
        authenticated: true,
        authState: 'authenticated',
      },
    ],
    nodeVersion: { version: 'v22.0.0', major: 22, supported: true },
    apiKeys: [{ name: 'ANTHROPIC_API_KEY', configured: true }],
    configFile: { found: true, path: './nexus-agents.yaml' },
    mcpServerReady: true,
    mcpClientReady: true,
    registryAdvisory: {
      totalModels: 5,
      availableModels: 5,
      unavailableModels: 0,
      models: [],
      registryAgeDays: 1,
      registryStale: false,
    },
    learningPersistence: {
      enabled: true,
      dirExists: true,
      dirWritable: true,
      outcomeCount: 0,
      ruleCount: 0,
      rulesLastSaved: null,
      error: null,
    },
    sqliteCheck: { available: true, error: null },
    dataDirectory: { rootExists: true, rootPath: '/tmp', repoRoot: null, subdirectories: [] },
    sandbox: {
      active: false,
      flavor: undefined,
      root: undefined,
      heuristicMatch: 'unknown' as const,
      mismatch: false,
      dataDirInsideRepo: false,
    },
    installFreshness: { state: 'aligned' as const, version: '1.0.0' },
    harnessAlignment: {
      inProject: true,
      agentsMdExists: true,
      files: [],
      alignedCount: 0,
      driftCount: 0,
      missingCount: 0,
    },
    voterTransport: { configured: false },
    scratchSpace: [
      {
        label: 'nexus' as const,
        root: '/tmp/nexus-test',
        available: true,
        freeBytes: 20 * 1024 ** 3,
        totalBytes: 32 * 1024 ** 3,
        percentUsed: 38,
        severity: 'ok' as const,
        message: '20.0 GiB free of 32.0 GiB (38% used)',
      },
    ],
    allHealthy: true,
    timestamp: new Date(),
    ...overrides,
  };
}

function makeFitnessAudit(score: number): FitnessAudit {
  return {
    score,
    dimensions: {
      canonicalPaths: 20,
      explicitBehavior: 15,
      determinism: 15,
      observability: 15,
      configSimplicity: 10,
      layerSeparation: 10,
      operatorErgonomics: 10,
      governanceIntegration: 5,
    },
    findings: [],
    version: 'v0.0.0-test',
    timestamp: new Date().toISOString(),
  };
}

beforeEach(() => {
  mockRunDoctor.mockReset();
  mockCalcFitness.mockReset();
});

describe('runValidate', () => {
  it('should return allPassed=true when doctor healthy and fitness >= 90', async () => {
    mockRunDoctor.mockResolvedValue(makeDoctorResult());
    mockCalcFitness.mockReturnValue(makeFitnessAudit(98));

    const result: ValidateResult = await runValidate();

    expect(result.allPassed).toBe(true);
    expect(result.phases).toHaveLength(3);
    const doctor = result.phases.find((p) => p.name === 'Doctor');
    const fitness = result.phases.find((p) => p.name === 'Fitness Audit');
    const config = result.phases.find((p) => p.name === 'Config');
    expect(doctor?.passed).toBe(true);
    expect(fitness?.passed).toBe(true);
    expect(config?.passed).toBe(true);
  });

  it('should return allPassed=false when doctor unhealthy', async () => {
    mockRunDoctor.mockResolvedValue(makeDoctorResult({ allHealthy: false }));
    mockCalcFitness.mockReturnValue(makeFitnessAudit(98));

    const result = await runValidate();

    expect(result.allPassed).toBe(false);
    const doctorPhase = result.phases.find((p) => p.name === 'Doctor');
    expect(doctorPhase?.passed).toBe(false);
  });

  it('should return allPassed=false when fitness score < 90', async () => {
    mockRunDoctor.mockResolvedValue(makeDoctorResult());
    mockCalcFitness.mockReturnValue(makeFitnessAudit(85));

    const result = await runValidate();

    expect(result.allPassed).toBe(false);
    const fitnessPhase = result.phases.find((p) => p.name === 'Fitness Audit');
    expect(fitnessPhase?.passed).toBe(false);
    expect(fitnessPhase?.summary).toContain('85');
  });

  it('should pass config phase even when no config file found', async () => {
    mockRunDoctor.mockResolvedValue(makeDoctorResult({ configFile: { found: false, path: null } }));
    mockCalcFitness.mockReturnValue(makeFitnessAudit(98));

    const result = await runValidate();

    const configPhase = result.phases.find((p) => p.name === 'Config');
    expect(configPhase?.passed).toBe(true);
    expect(configPhase?.summary).toContain('optional');
  });

  it('should include config path in summary when found', async () => {
    mockRunDoctor.mockResolvedValue(makeDoctorResult());
    mockCalcFitness.mockReturnValue(makeFitnessAudit(98));

    const result = await runValidate();

    const configPhase = result.phases.find((p) => p.name === 'Config');
    expect(configPhase?.summary).toContain('nexus-agents.yaml');
  });

  it('should include CLI count in doctor summary', async () => {
    mockRunDoctor.mockResolvedValue(makeDoctorResult());
    mockCalcFitness.mockReturnValue(makeFitnessAudit(98));

    const result = await runValidate();

    const doctorPhase = result.phases.find((p) => p.name === 'Doctor');
    expect(doctorPhase?.summary).toContain('4/4');
  });
});
