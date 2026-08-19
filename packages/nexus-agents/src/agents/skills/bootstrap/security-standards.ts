/**
 * Security Standards Skills Bootstrap
 *
 * Pre-built security skills for the SkillLibrary system.
 * Phase 2 of Epic #643 (Standards Absorption).
 *
 * Skills cover: OWASP API Top 10, STRIDE threat modeling,
 * secrets detection, auth patterns, input validation, NIST 800-53.
 *
 * @module agents/skills/bootstrap/security-standards
 */

import type { CreateSkillOptions } from '../skill-types.js';

/**
 * Security-focused skills for code review, threat modeling,
 * and compliance mapping.
 */
export const SECURITY_SKILLS = [
  // ── OWASP API Review ──────────────────────────────────────────────
  {
    name: 'owasp-api-review',
    description:
      'Reviews code for OWASP API Security Top 10 vulnerabilities including ' +
      'broken object-level authorization (API1), broken authentication (API2), ' +
      'excessive data exposure (API3), lack of rate limiting (API4), ' +
      'broken function-level authorization (API5), mass assignment (API6), ' +
      'security misconfiguration (API7), injection (API8), ' +
      'improper asset management (API9), and insufficient logging (API10).',
    category: 'security',
    complexity: 'complex',
    code: [
      'function owaspApiReview(code: string, context: string): string {',
      '  const checks = [',
      '    { id: "API1", name: "Broken Object-Level Auth", pattern: /\\.(findById|getById)\\(/i },',
      '    { id: "API2", name: "Broken Authentication", pattern: /password|token|secret/i },',
      '    { id: "API3", name: "Excessive Data Exposure", pattern: /select\\s+\\*/i },',
      '    { id: "API4", name: "Lack of Rate Limiting", pattern: /app\\.(get|post|put|delete)\\(/i },',
      '    { id: "API5", name: "Broken Function-Level Auth", pattern: /isAdmin|role/i },',
      '    { id: "API6", name: "Mass Assignment", pattern: /Object\\.assign|spread.*req\\.body/i },',
      '    { id: "API7", name: "Security Misconfiguration", pattern: /cors\\(\\)|helmet/i },',
      '    { id: "API8", name: "Injection", pattern: /\\$\\{.*\\}.*query|exec\\(/i },',
      '  ];',
      '  return checks.map(c => `${c.id}: ${c.name} - ${c.pattern.test(code) ? "REVIEW" : "OK"}`).join("\\n");',
      '}',
    ].join('\n'),
    parameters: [
      {
        name: 'code',
        type: 'string',
        description: 'Source code to review for OWASP API vulnerabilities',
        required: true,
      },
      {
        name: 'context',
        type: 'string',
        description: 'API context: framework, auth scheme, data sensitivity level',
        required: true,
      },
    ],
    outputType: 'string',
    tags: ['security', 'owasp', 'api', 'vulnerability', 'code-review'],
    examples: [
      {
        description: 'Review Express.js API endpoint for OWASP vulnerabilities',
        input: {
          code: 'app.get("/users/:id", (req, res) => { db.query(`SELECT * FROM users WHERE id=${req.params.id}`) })',
          context: 'Express.js REST API with JWT auth',
        },
        expectedOutput:
          'API1: Broken Object-Level Auth - REVIEW\nAPI3: Excessive Data Exposure - REVIEW\nAPI8: Injection - REVIEW',
      },
    ],
  },

  // ── STRIDE Threat Model ───────────────────────────────────────────
  {
    name: 'threat-model-analyze',
    description:
      'Analyzes a system description and generates a STRIDE threat model. ' +
      'Evaluates Spoofing, Tampering, Repudiation, Information Disclosure, ' +
      'Denial of Service, and Elevation of Privilege threats for each ' +
      'component and data flow. Returns structured threat categories with ' +
      'risk ratings and recommended mitigations.',
    category: 'security',
    complexity: 'complex',
    code: [
      'function threatModelAnalyze(systemDescription: string, dataFlows: string): string {',
      '  const stride = [',
      '    { threat: "Spoofing", mitigation: "Strong authentication, MFA, certificate pinning" },',
      '    { threat: "Tampering", mitigation: "Input validation, checksums, signed payloads" },',
      '    { threat: "Repudiation", mitigation: "Audit logging, timestamps, digital signatures" },',
      '    { threat: "Info Disclosure", mitigation: "Encryption at rest/transit, access controls" },',
      '    { threat: "Denial of Service", mitigation: "Rate limiting, circuit breakers, scaling" },',
      '    { threat: "Elevation of Privilege", mitigation: "RBAC, least privilege, input validation" },',
      '  ];',
      '  return stride.map(s => `[${s.threat}] Mitigation: ${s.mitigation}`).join("\\n");',
      '}',
    ].join('\n'),
    parameters: [
      {
        name: 'systemDescription',
        type: 'string',
        description: 'Architecture description: components, boundaries, trust zones',
        required: true,
      },
      {
        name: 'dataFlows',
        type: 'string',
        description: 'Data flow descriptions: source, destination, protocol, sensitivity',
        required: true,
      },
    ],
    outputType: 'string',
    tags: ['security', 'threat-model', 'stride', 'risk-assessment', 'architecture'],
    examples: [
      {
        description: 'Generate STRIDE model for a microservices API gateway',
        input: {
          systemDescription: 'API gateway fronting 3 microservices with JWT auth',
          dataFlows: 'Client->Gateway(HTTPS), Gateway->Services(gRPC), Services->DB(TLS)',
        },
        expectedOutput:
          '[Spoofing] Mitigation: Strong authentication, MFA, certificate pinning\n[Tampering] Mitigation: Input validation, checksums, signed payloads',
      },
    ],
  },

  // ── Secrets Scan ──────────────────────────────────────────────────
  {
    name: 'secrets-scan',
    description:
      'Scans source code for hardcoded secrets, API keys, tokens, passwords, ' +
      'and credentials. Detects AWS keys, GitHub tokens, JWTs, private keys, ' +
      'database connection strings, and generic high-entropy strings. ' +
      'Returns findings with severity (critical/high/medium) and line references.',
    category: 'security',
    complexity: 'moderate',
    code: [
      'function secretsScan(code: string, fileType: string): string {',
      '  const patterns = [',
      '    { name: "AWS Key", regex: /AKIA[0-9A-Z]{16}/, severity: "critical" },',
      '    { name: "GitHub Token", regex: /gh[ps]_[A-Za-z0-9_]{36,}/, severity: "critical" },',
      '    { name: "JWT", regex: /eyJ[A-Za-z0-9-_]+\\.eyJ[A-Za-z0-9-_]+/, severity: "high" },',
      '    { name: "Private Key", regex: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/, severity: "critical" },',
      '    { name: "Connection String", regex: /(mongodb|postgres|mysql):\\/\\/[^\\s]+/, severity: "high" },',
      '    { name: "Generic Secret", regex: /(password|secret|api_key)\\s*[:=]\\s*["\'][^"\']{8,}/, severity: "medium" },',
      '  ];',
      '  const findings = patterns.filter(p => p.regex.test(code));',
      '  return findings.length === 0 ? "No secrets detected" : findings.map(f => `[${f.severity}] ${f.name}`).join("\\n");',
      '}',
    ].join('\n'),
    parameters: [
      {
        name: 'code',
        type: 'string',
        description: 'Source code to scan for hardcoded secrets',
        required: true,
      },
      {
        name: 'fileType',
        type: 'string',
        description: 'File type/extension for context-aware scanning (e.g., ts, py, yaml, env)',
        required: true,
      },
    ],
    outputType: 'string',
    tags: ['security', 'secrets', 'credentials', 'scanning', 'devsecops'],
    examples: [
      {
        description: 'Scan TypeScript file for leaked credentials',
        input: {
          // arch-lint-ignore security -- deliberate insecure sample: this is the
          // *input* to a credential-scanning example. AKIAIOSFODNN7EXAMPLE is
          // AWS's published documentation placeholder, not a live credential.
          code: 'const apiKey = "AKIAIOSFODNN7EXAMPLE"; const db = "postgres://admin:pass@host/db";',
          fileType: 'ts',
        },
        expectedOutput: '[critical] AWS Key\n[high] Connection String',
      },
    ],
  },

  // ── Auth Pattern Validate ─────────────────────────────────────────
  {
    name: 'auth-pattern-validate',
    description:
      'Validates authentication and authorization implementation patterns ' +
      'against security best practices. Checks JWT configuration (algorithm, ' +
      'expiry, secret strength), OAuth 2.0 flows (PKCE, state parameter), ' +
      'session management (secure flags, rotation), and password handling ' +
      '(hashing algorithm, salt usage). Returns pass/fail with specific remediation.',
    category: 'security',
    complexity: 'moderate',
    code: [
      'function authPatternValidate(code: string, authType: string): string {',
      '  const checks: Record<string, Array<{ check: string; pattern: RegExp; expected: boolean }>> = {',
      '    jwt: [',
      '      { check: "Uses RS256/ES256 (not HS256)", pattern: /HS256/, expected: false },',
      '      { check: "Sets expiration", pattern: /expiresIn|exp/, expected: true },',
      '      { check: "Validates issuer", pattern: /issuer|iss/, expected: true },',
      '    ],',
      '    oauth: [',
      '      { check: "Uses PKCE", pattern: /code_challenge|code_verifier/, expected: true },',
      '      { check: "Validates state param", pattern: /state/, expected: true },',
      '    ],',
      '    session: [',
      '      { check: "HttpOnly cookie flag", pattern: /httpOnly|HttpOnly/, expected: true },',
      '      { check: "Secure cookie flag", pattern: /secure:\\s*true|Secure/, expected: true },',
      '    ],',
      '  };',
      '  const rules = checks[authType] ?? checks.jwt;',
      '  return rules.map(r => `${r.pattern.test(code) === r.expected ? "PASS" : "FAIL"}: ${r.check}`).join("\\n");',
      '}',
    ].join('\n'),
    parameters: [
      {
        name: 'code',
        type: 'string',
        description: 'Authentication implementation code to validate',
        required: true,
      },
      {
        name: 'authType',
        type: 'string',
        description: 'Authentication type: jwt, oauth, session, or password',
        required: true,
      },
    ],
    outputType: 'string',
    tags: ['security', 'authentication', 'authorization', 'jwt', 'oauth'],
    examples: [
      {
        description: 'Validate JWT implementation for security best practices',
        input: {
          code: 'jwt.sign(payload, secret, { algorithm: "HS256", expiresIn: "1h" })',
          authType: 'jwt',
        },
        expectedOutput:
          'FAIL: Uses RS256/ES256 (not HS256)\nPASS: Sets expiration\nFAIL: Validates issuer',
      },
    ],
  },

  // ── Input Validation Check ────────────────────────────────────────
  {
    name: 'input-validation-check',
    description:
      'Checks input validation and sanitization patterns in source code. ' +
      'Validates use of schema validation libraries (Zod, Joi, Yup), ' +
      'SQL parameterization, HTML sanitization (DOMPurify, sanitize-html), ' +
      'and type coercion safety. Flags missing validation on request handlers ' +
      'and identifies injection-vulnerable string interpolation.',
    category: 'security',
    complexity: 'moderate',
    code: [
      'function inputValidationCheck(code: string, framework: string): string {',
      '  const checks = [',
      '    { check: "Schema validation present", pattern: /z\\.|Joi\\.|yup\\.|zod/i, pass: true },',
      '    { check: "SQL parameterized", pattern: /\\$\\d|\\?|:named|prepared/i, pass: true },',
      '    { check: "No raw SQL interpolation", pattern: /`.*\\$\\{.*\\}.*(?:SELECT|INSERT|UPDATE|DELETE)/i, pass: false },',
      '    { check: "HTML sanitization", pattern: /sanitize|DOMPurify|escape/i, pass: true },',
      '    { check: "No eval usage", pattern: /\\beval\\s*\\(/, pass: false },',
      '    { check: "Type coercion safe", pattern: /parseInt|Number\\(|parseFloat/, pass: true },',
      '  ];',
      '  return checks.map(c => {',
      '    const found = c.pattern.test(code);',
      '    const ok = c.pass ? found : !found;',
      '    return `${ok ? "PASS" : "WARN"}: ${c.check}`;',
      '  }).join("\\n");',
      '}',
    ].join('\n'),
    parameters: [
      {
        name: 'code',
        type: 'string',
        description: 'Source code to check for input validation patterns',
        required: true,
      },
      {
        name: 'framework',
        type: 'string',
        description: 'Framework context: express, fastify, nextjs, nestjs, or generic',
        required: true,
      },
    ],
    outputType: 'string',
    tags: ['security', 'input-validation', 'sanitization', 'injection', 'zod'],
    examples: [
      {
        description: 'Check Express handler for input validation',
        input: {
          code: 'app.post("/api/users", (req, res) => { const { name } = req.body; db.query(`INSERT INTO users (name) VALUES (${name})`); })',
          framework: 'express',
        },
        expectedOutput:
          'WARN: Schema validation present\nWARN: SQL parameterized\nWARN: No raw SQL interpolation',
      },
    ],
  },

  // ── NIST 800-53 Controls Map ──────────────────────────────────────
  {
    name: 'nist-controls-map',
    description:
      'Maps source code patterns to applicable NIST SP 800-53 Rev 5 security ' +
      'controls. Identifies implemented controls across families: Access Control (AC), ' +
      'Audit and Accountability (AU), Identification and Authentication (IA), ' +
      'System and Communications Protection (SC), and System and Information ' +
      'Integrity (SI). Returns control IDs with implementation status.',
    category: 'security',
    complexity: 'complex',
    code: [
      'function nistControlsMap(code: string, controlFamily: string): string {',
      '  const families: Record<string, Array<{ id: string; name: string; pattern: RegExp }>> = {',
      '    AC: [',
      '      { id: "AC-3", name: "Access Enforcement", pattern: /authorize|permission|rbac|acl/i },',
      '      { id: "AC-6", name: "Least Privilege", pattern: /role|scope|capability/i },',
      '    ],',
      '    AU: [',
      '      { id: "AU-2", name: "Audit Events", pattern: /audit|log\\.(info|warn|error)/i },',
      '      { id: "AU-3", name: "Content of Audit Records", pattern: /timestamp|userId|action/i },',
      '    ],',
      '    IA: [',
      '      { id: "IA-2", name: "Identification and Auth", pattern: /authenticate|login|verify/i },',
      '      { id: "IA-5", name: "Authenticator Mgmt", pattern: /bcrypt|argon2|hash/i },',
      '    ],',
      '    SC: [',
      '      { id: "SC-8", name: "Transmission Confidentiality", pattern: /https|tls|ssl|encrypt/i },',
      '      { id: "SC-13", name: "Cryptographic Protection", pattern: /crypto|cipher|aes|rsa/i },',
      '    ],',
      '  };',
      '  const controls = families[controlFamily] ?? Object.values(families).flat();',
      '  return controls.map(c => `${c.id} ${c.name}: ${c.pattern.test(code) ? "DETECTED" : "NOT FOUND"}`).join("\\n");',
      '}',
    ].join('\n'),
    parameters: [
      {
        name: 'code',
        type: 'string',
        description: 'Source code to map against NIST 800-53 controls',
        required: true,
      },
      {
        name: 'controlFamily',
        type: 'string',
        description: 'NIST control family to check: AC, AU, IA, SC, SI, or "all" for full scan',
        required: true,
      },
    ],
    outputType: 'string',
    tags: ['security', 'nist', 'compliance', '800-53', 'controls', 'governance'],
    examples: [
      {
        description: 'Map authentication code to NIST IA controls',
        input: {
          code: 'const hash = await bcrypt.hash(password, 12); await auditLog.info({ userId, action: "login" });',
          controlFamily: 'IA',
        },
        expectedOutput:
          'IA-2 Identification and Auth: NOT FOUND\nIA-5 Authenticator Mgmt: DETECTED',
      },
    ],
  },
] as const satisfies readonly CreateSkillOptions[];
