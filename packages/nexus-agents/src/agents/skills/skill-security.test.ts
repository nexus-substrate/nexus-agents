/**
 * nexus-agents/agents - Skill Security Tests
 *
 * Unit tests for skill security controls including RBAC,
 * capabilities validation, provenance, and attestation.
 *
 * @module agents/skills/skill-security.test
 */

import { describe, it, expect } from 'vitest';
import {
  // Types
  type SkillCapabilities,
  type SkillRBAC,
  type SkillProvenance,
  type SkillAttestation,
  // Constants
  SKILL_PERMISSIONS,
  DEFAULT_PERMISSIONS,
  DEFAULT_CAPABILITIES,
  DEFAULT_RBAC,
  MAX_EXECUTION_TIME_MS,
  // Schemas
  SkillPermissionSchema,
  SkillCapabilitiesSchema,
  SkillRBACSchema,
  SkillProvenanceSchema,
  SkillAttestationSchema,
  // Functions
  canExecuteSkill,
  createAttestation,
  validateSkillProvenance,
  checkPermissionBoundary,
  validateCapabilities,
  validateRBAC,
  validateSkillExecution,
  createSecurityError,
} from './skill-security.js';

describe('Skill Security - Constants', () => {
  it('should define all permission types', () => {
    expect(SKILL_PERMISSIONS).toEqual([
      'read',
      'write',
      'execute',
      'network',
      'filesystem',
      'spawn',
    ]);
    expect(SKILL_PERMISSIONS.length).toBe(6);
  });

  it('should have read-only default permissions', () => {
    expect(DEFAULT_PERMISSIONS).toEqual(['read']);
  });

  it('should have secure default capabilities', () => {
    expect(DEFAULT_CAPABILITIES.sandboxed).toBe(true);
    expect(DEFAULT_CAPABILITIES.permissions).toEqual(['read']);
    expect(DEFAULT_CAPABILITIES.maxExecutionTime).toBeLessThanOrEqual(MAX_EXECUTION_TIME_MS);
  });

  it('should have permissive default RBAC for development', () => {
    expect(DEFAULT_RBAC.allowedRoles.length).toBeGreaterThan(0);
    expect(DEFAULT_RBAC.requiresAttestation).toBe(false);
  });
});

describe('Skill Security - Zod Schemas', () => {
  describe('SkillPermissionSchema', () => {
    it('should accept valid permissions', () => {
      for (const perm of SKILL_PERMISSIONS) {
        expect(SkillPermissionSchema.safeParse(perm).success).toBe(true);
      }
    });

    it('should reject invalid permissions', () => {
      expect(SkillPermissionSchema.safeParse('admin').success).toBe(false);
      expect(SkillPermissionSchema.safeParse('').success).toBe(false);
      expect(SkillPermissionSchema.safeParse(123).success).toBe(false);
    });
  });

  describe('SkillCapabilitiesSchema', () => {
    it('should accept valid capabilities', () => {
      const capabilities: SkillCapabilities = {
        permissions: ['read', 'write'],
        maxExecutionTime: 30000,
        sandboxed: true,
      };
      expect(SkillCapabilitiesSchema.safeParse(capabilities).success).toBe(true);
    });

    it('should reject execution time exceeding maximum', () => {
      const capabilities = {
        permissions: ['read'],
        maxExecutionTime: MAX_EXECUTION_TIME_MS + 1,
        sandboxed: true,
      };
      expect(SkillCapabilitiesSchema.safeParse(capabilities).success).toBe(false);
    });

    it('should reject negative execution time', () => {
      const capabilities = {
        permissions: ['read'],
        maxExecutionTime: -1,
        sandboxed: true,
      };
      expect(SkillCapabilitiesSchema.safeParse(capabilities).success).toBe(false);
    });
  });

  describe('SkillRBACSchema', () => {
    it('should accept valid RBAC configuration', () => {
      const rbac: SkillRBAC = {
        allowedRoles: ['orchestrator', 'code_expert'],
        requiresAttestation: false,
      };
      expect(SkillRBACSchema.safeParse(rbac).success).toBe(true);
    });

    it('should accept RBAC with denied roles', () => {
      const rbac: SkillRBAC = {
        allowedRoles: ['orchestrator'],
        deniedRoles: ['custom'],
        requiresAttestation: true,
      };
      expect(SkillRBACSchema.safeParse(rbac).success).toBe(true);
    });

    it('should reject empty allowed roles', () => {
      const rbac = {
        allowedRoles: [],
        requiresAttestation: false,
      };
      expect(SkillRBACSchema.safeParse(rbac).success).toBe(false);
    });
  });

  describe('SkillProvenanceSchema', () => {
    it('should accept valid provenance', () => {
      const provenance: SkillProvenance = {
        createdBy: 'agent-001',
        createdAt: new Date(),
        version: 0,
      };
      expect(SkillProvenanceSchema.safeParse(provenance).success).toBe(true);
    });

    it('should accept provenance with modification info', () => {
      const now = new Date();
      const provenance: SkillProvenance = {
        createdBy: 'agent-001',
        createdAt: new Date(now.getTime() - 86400000),
        modifiedBy: 'agent-002',
        modifiedAt: now,
        version: 1,
        signature: 'abc123def456',
      };
      expect(SkillProvenanceSchema.safeParse(provenance).success).toBe(true);
    });

    it('should reject empty creator', () => {
      const provenance = {
        createdBy: '',
        createdAt: new Date(),
        version: 0,
      };
      expect(SkillProvenanceSchema.safeParse(provenance).success).toBe(false);
    });
  });

  describe('SkillAttestationSchema', () => {
    it('should accept valid attestation', () => {
      const attestation: SkillAttestation = {
        skillId: 'skill-001',
        executorId: 'agent-001',
        timestamp: new Date(),
        inputHash: 'a'.repeat(64),
        authorized: true,
        authorizationMethod: 'role',
      };
      expect(SkillAttestationSchema.safeParse(attestation).success).toBe(true);
    });

    it('should reject invalid input hash length', () => {
      const attestation = {
        skillId: 'skill-001',
        executorId: 'agent-001',
        timestamp: new Date(),
        inputHash: 'tooshort',
        authorized: true,
        authorizationMethod: 'role',
      };
      expect(SkillAttestationSchema.safeParse(attestation).success).toBe(false);
    });

    it('should reject non-hex input hash', () => {
      const attestation = {
        skillId: 'skill-001',
        executorId: 'agent-001',
        timestamp: new Date(),
        inputHash: 'g'.repeat(64), // 'g' is not a valid hex character
        authorized: true,
        authorizationMethod: 'role',
      };
      expect(SkillAttestationSchema.safeParse(attestation).success).toBe(false);
    });
  });
});

describe('Skill Security - canExecuteSkill', () => {
  it('should allow execution for roles in allowedRoles', () => {
    const rbac: SkillRBAC = {
      allowedRoles: ['orchestrator', 'code_expert'],
      requiresAttestation: false,
    };
    expect(canExecuteSkill('orchestrator', rbac)).toBe(true);
    expect(canExecuteSkill('code_expert', rbac)).toBe(true);
  });

  it('should deny execution for roles not in allowedRoles', () => {
    const rbac: SkillRBAC = {
      allowedRoles: ['orchestrator'],
      requiresAttestation: false,
    };
    expect(canExecuteSkill('custom', rbac)).toBe(false);
  });

  it('should deny execution for roles in deniedRoles even if in allowedRoles', () => {
    const rbac: SkillRBAC = {
      allowedRoles: ['orchestrator', 'code_expert', 'custom'],
      deniedRoles: ['custom'],
      requiresAttestation: false,
    };
    expect(canExecuteSkill('orchestrator', rbac)).toBe(true);
    expect(canExecuteSkill('custom', rbac)).toBe(false);
  });

  it('should handle empty deniedRoles', () => {
    const rbac: SkillRBAC = {
      allowedRoles: ['orchestrator'],
      deniedRoles: [],
      requiresAttestation: false,
    };
    expect(canExecuteSkill('orchestrator', rbac)).toBe(true);
  });
});

describe('Skill Security - createAttestation', () => {
  it('should create attestation with correct fields', () => {
    const input = { param1: 'value1', param2: 42 };
    const attestation = createAttestation('skill-001', 'agent-001', input, true, 'role');

    expect(attestation.skillId).toBe('skill-001');
    expect(attestation.executorId).toBe('agent-001');
    expect(attestation.authorized).toBe(true);
    expect(attestation.authorizationMethod).toBe('role');
    expect(attestation.inputHash).toHaveLength(64);
    expect(attestation.timestamp).toBeInstanceOf(Date);
  });

  it('should generate consistent hashes for same input', () => {
    const input = { a: 1, b: 2 };
    const att1 = createAttestation('s', 'e', input, true, 'role');
    const att2 = createAttestation('s', 'e', input, true, 'role');
    expect(att1.inputHash).toBe(att2.inputHash);
  });

  it('should generate different hashes for different input', () => {
    const att1 = createAttestation('s', 'e', { a: 1 }, true, 'role');
    const att2 = createAttestation('s', 'e', { a: 2 }, true, 'role');
    expect(att1.inputHash).not.toBe(att2.inputHash);
  });

  it('should handle null and undefined input', () => {
    const attNull = createAttestation('s', 'e', null, true, 'role');
    const attUndefined = createAttestation('s', 'e', undefined, true, 'role');
    expect(attNull.inputHash).toHaveLength(64);
    expect(attUndefined.inputHash).toHaveLength(64);
  });
});

describe('Skill Security - validateSkillProvenance', () => {
  it('should accept valid provenance', () => {
    const provenance: SkillProvenance = {
      createdBy: 'agent-001',
      createdAt: new Date(),
      version: 0,
    };
    const result = validateSkillProvenance(provenance);
    expect(result.ok).toBe(true);
  });

  it('should reject provenance with modifiedAt before createdAt', () => {
    const now = new Date();
    const provenance: SkillProvenance = {
      createdBy: 'agent-001',
      createdAt: now,
      modifiedBy: 'agent-002',
      modifiedAt: new Date(now.getTime() - 1000),
      version: 1,
    };
    const result = validateSkillProvenance(provenance);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_PROVENANCE');
      expect(result.error.message).toContain('Modified date cannot be before');
    }
  });

  it('should reject provenance with modifiedBy but version 0', () => {
    const provenance: SkillProvenance = {
      createdBy: 'agent-001',
      createdAt: new Date(),
      modifiedBy: 'agent-002',
      version: 0,
    };
    const result = validateSkillProvenance(provenance);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_PROVENANCE');
    }
  });
});

describe('Skill Security - checkPermissionBoundary', () => {
  it('should allow requests within boundary', () => {
    const capabilities: SkillCapabilities = {
      permissions: ['read', 'write', 'execute'],
      maxExecutionTime: 30000,
      sandboxed: true,
    };
    expect(checkPermissionBoundary(capabilities, ['read'])).toBe(true);
    expect(checkPermissionBoundary(capabilities, ['read', 'write'])).toBe(true);
    expect(checkPermissionBoundary(capabilities, ['read', 'write', 'execute'])).toBe(true);
  });

  it('should deny requests outside boundary', () => {
    const capabilities: SkillCapabilities = {
      permissions: ['read'],
      maxExecutionTime: 30000,
      sandboxed: true,
    };
    expect(checkPermissionBoundary(capabilities, ['write'])).toBe(false);
    expect(checkPermissionBoundary(capabilities, ['read', 'network'])).toBe(false);
  });

  it('should allow empty requested permissions', () => {
    const capabilities: SkillCapabilities = {
      permissions: ['read'],
      maxExecutionTime: 30000,
      sandboxed: true,
    };
    expect(checkPermissionBoundary(capabilities, [])).toBe(true);
  });
});

describe('Skill Security - validateCapabilities', () => {
  it('should accept valid sandboxed capabilities', () => {
    const capabilities: SkillCapabilities = {
      permissions: ['read', 'write', 'spawn', 'network'],
      maxExecutionTime: 30000,
      sandboxed: true,
    };
    const result = validateCapabilities(capabilities);
    expect(result.ok).toBe(true);
  });

  it('should reject non-sandboxed with spawn and network', () => {
    const capabilities: SkillCapabilities = {
      permissions: ['spawn', 'network'],
      maxExecutionTime: 30000,
      sandboxed: false,
    };
    const result = validateCapabilities(capabilities);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SANDBOX_VIOLATION');
    }
  });

  it('should allow non-sandboxed with only spawn', () => {
    const capabilities: SkillCapabilities = {
      permissions: ['spawn'],
      maxExecutionTime: 30000,
      sandboxed: false,
    };
    const result = validateCapabilities(capabilities);
    expect(result.ok).toBe(true);
  });
});

describe('Skill Security - validateRBAC', () => {
  it('should accept valid RBAC', () => {
    const rbac: SkillRBAC = {
      allowedRoles: ['orchestrator'],
      requiresAttestation: false,
    };
    const result = validateRBAC(rbac);
    expect(result.ok).toBe(true);
  });

  it('should reject RBAC with overlapping allowed and denied roles', () => {
    const rbac: SkillRBAC = {
      allowedRoles: ['orchestrator', 'code_expert'],
      deniedRoles: ['code_expert'],
      requiresAttestation: false,
    };
    const result = validateRBAC(rbac);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ROLE_NOT_ALLOWED');
      expect(result.error.context?.overlappingRoles).toContain('code_expert');
    }
  });
});

describe('Skill Security - validateSkillExecution', () => {
  const validCapabilities: SkillCapabilities = {
    permissions: ['read', 'write'],
    maxExecutionTime: 30000,
    sandboxed: true,
  };

  const validRbac: SkillRBAC = {
    allowedRoles: ['orchestrator', 'code_expert'],
    requiresAttestation: false,
  };

  it('should allow valid execution', () => {
    const result = validateSkillExecution('orchestrator', validCapabilities, validRbac, ['read']);
    expect(result.ok).toBe(true);
  });

  it('should reject unauthorized role', () => {
    const result = validateSkillExecution('custom', validCapabilities, validRbac, ['read']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ROLE_NOT_ALLOWED');
    }
  });

  it('should reject permissions outside boundary', () => {
    const result = validateSkillExecution('orchestrator', validCapabilities, validRbac, [
      'network',
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PERMISSION_DENIED');
    }
  });

  it('should reject invalid capabilities', () => {
    const badCapabilities: SkillCapabilities = {
      permissions: ['spawn', 'network'],
      maxExecutionTime: 30000,
      sandboxed: false,
    };
    const result = validateSkillExecution('orchestrator', badCapabilities, validRbac, ['spawn']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SANDBOX_VIOLATION');
    }
  });
});

describe('Skill Security - createSecurityError', () => {
  it('should create error with all fields', () => {
    const error = createSecurityError('PERMISSION_DENIED', 'Access denied', { user: 'test' });
    expect(error.code).toBe('PERMISSION_DENIED');
    expect(error.message).toBe('Access denied');
    expect(error.context?.user).toBe('test');
  });

  it('should create error without context', () => {
    const error = createSecurityError('ROLE_NOT_ALLOWED', 'Unauthorized');
    expect(error.code).toBe('ROLE_NOT_ALLOWED');
    expect(error.message).toBe('Unauthorized');
    expect(error.context).toBeUndefined();
  });
});
