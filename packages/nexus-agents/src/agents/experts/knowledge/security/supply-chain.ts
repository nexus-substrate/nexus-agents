/**
 * Supply Chain Security Knowledge Module
 *
 * Domain knowledge for supply chain attack detection and prevention,
 * derived from adversary-lab research on Aqua Security/TeamPCP (March 2026)
 * and CyberStrike/FortiGate (Jan-Feb 2026) incidents.
 * Note: Trivy (Aqua) replaced with Grype (Anchore) + OSV-Scanner (Google) per #1690.
 *
 * @module agents/experts/knowledge/security/supply-chain
 * (Source: adversary-lab research, nexus-agents #1605)
 */

import type { KnowledgeModule } from '../types.js';

/**
 * Supply chain security knowledge covering dependency pinning,
 * CI/CD hardening, and AI-assisted attack patterns.
 */
export const SUPPLY_CHAIN_MODULE: KnowledgeModule = {
  id: 'security-supply-chain',
  domain: 'security',
  title: 'Supply Chain Security',
  tags: ['supply-chain', 'ci-cd', 'dependency-management', 'github-actions'],
  nistControls: ['SA-12', 'SA-15', 'SR-3', 'SR-4', 'SR-11'],
  sections: [
    {
      title: 'Dependency Pinning',
      priority: 10,
      content: `Pin all external dependencies to immutable references:
- GitHub Actions: pin to full 40-character commit SHAs, never mutable tags
- Docker images: pin to digest (sha256:...), not tags
- npm/pip packages: use lockfiles with integrity hashes
- Tags can be force-pushed (Trivy TeamPCP attack: 75 of 76 tags hijacked)
- Only commit SHAs and content-addressable hashes are immutable`,
    },
    {
      title: 'CI/CD Token Scoping',
      priority: 9,
      content: `Minimize CI token permissions to reduce blast radius:
- Declare explicit permissions per job (never use write-all)
- Use contents:read unless write is specifically needed
- Scope GITHUB_TOKEN to minimum required permissions
- Rotate tokens immediately after any suspected exposure
- Never pass secrets via environment variables when pipe IPC is available`,
    },
    {
      title: 'Supply Chain Attack Indicators',
      priority: 8,
      content: `Watch for these supply chain compromise indicators:
- Unexpected tag changes on dependencies (force-push)
- Typosquat domains in configs (e.g., aquasecurtiy vs aquasecurity)
- New postinstall hooks in updated packages
- Process memory dumping in CI runners (Runner.Worker)
- Encrypted exfiltration payloads (AES-256+RSA-4096)
- ICP canister C2 (blockchain-based dead-drop resolvers)
- Systemd persistence disguised as monitoring (e.g., pgmon service)`,
    },
    {
      title: 'AI-Assisted Attack Awareness',
      priority: 7,
      content: `AI-generated malware characteristics (detection opportunity):
- Clean, descriptive variable names (no obfuscation)
- Modular, well-structured code
- Minimal error handling (crashes instead of failing silently)
- No anti-analysis techniques (no VM detection, no debugger checks)
- Fast development cycle (multiple variants in hours)
- Paradoxically easier to detect than human-crafted obfuscated malware
- AI amplifies low-skill operators to execute expert-level attack chains`,
    },
  ],
};
