/**
 * Bootstrap skills for architecture validation and documentation analysis.
 *
 * Provides built-in skills for clean architecture validation,
 * microservices pattern checking, and Diataxis documentation classification.
 *
 * @module agents/skills/bootstrap/architecture-standards
 * (Epic #643 Phase 2 - Standards Absorption)
 */

import type { CreateSkillOptions } from '../skill-types.js';

/**
 * Built-in architecture and documentation skills for the SkillLibrary.
 *
 * Each skill provides a concise function body that validates code structure
 * or classifies documentation against established architectural frameworks.
 */
export const ARCHITECTURE_SKILLS = [
  {
    name: 'clean-architecture-validate',
    description:
      'Validates code against clean architecture principles including the dependency rule ' +
      '(inner layers must not reference outer layers), layer boundary enforcement, and ' +
      'proper separation of entities, use cases, adapters, and frameworks.',
    category: 'code-analysis',
    complexity: 'moderate',
    code: [
      'const violations = [];',
      'const layers = ["entity", "use-case", "adapter", "framework"];',
      'const layerIndex = layers.indexOf(layer);',
      'if (layerIndex === -1) return JSON.stringify({ valid: false, violations: ["Unknown layer: " + layer + ". Expected: " + layers.join(", ")] });',
      'const outerLayers = layers.slice(layerIndex + 1);',
      'for (const outer of outerLayers) {',
      '  if (code.toLowerCase().includes("import") && code.toLowerCase().includes(outer)) violations.push("Dependency rule violation: " + layer + " layer imports from " + outer + " layer");',
      '}',
      'if (layer === "entity" && /import.*(?:express|fastify|koa|http)/i.test(code)) violations.push("Entity layer must not depend on frameworks");',
      'if (layer === "use-case" && /import.*(?:pg|mysql|mongo|redis|prisma)/i.test(code)) violations.push("Use-case layer must not depend on infrastructure directly - use repository interfaces");',
      'if (layer === "entity" && /import.*(?:database|repository|service)/i.test(code)) violations.push("Entity layer should contain only business logic - no infrastructure references");',
      'const valid = violations.length === 0;',
      'return JSON.stringify({ valid, layer, violations, checkedAgainst: outerLayers });',
    ].join('\n'),
    parameters: [
      {
        name: 'code',
        type: 'string',
        description: 'Source code to validate against clean architecture principles',
        required: true,
      },
      {
        name: 'layer',
        type: 'string',
        description:
          'The architectural layer this code belongs to: "entity", "use-case", "adapter", or "framework"',
        required: true,
      },
    ],
    outputType:
      'JSON object with valid boolean, layer name, violations array, and checked outer layers',
    dependencies: [],
    tags: ['clean-architecture', 'dependency-rule', 'layer-boundaries', 'solid', 'architecture'],
    examples: [
      {
        description: 'Validate entity code that incorrectly imports a framework',
        input: {
          code: 'import express from "express";\nexport class User { name: string; }',
          layer: 'entity',
        },
        expectedOutput:
          '{"valid":false,"layer":"entity","violations":["Dependency rule violation: entity layer imports from framework layer","Entity layer must not depend on frameworks"],"checkedAgainst":["use-case","adapter","framework"]}',
      },
    ],
  },
  {
    name: 'microservices-pattern-check',
    description:
      'Checks a microservices architecture description for common patterns and anti-patterns ' +
      'including service boundaries, inter-service communication strategy, resilience patterns ' +
      '(circuit breakers, retries, timeouts), data ownership, and observability.',
    category: 'code-analysis',
    complexity: 'moderate',
    code: [
      'const findings = [];',
      'const desc = serviceDescription.toLowerCase();',
      'if (!desc.includes("circuit breaker") && !desc.includes("retry")) findings.push({ type: "warning", message: "No resilience pattern (circuit breaker/retry) mentioned" });',
      'if (!desc.includes("timeout")) findings.push({ type: "warning", message: "No timeout strategy described - risk of cascading failures" });',
      'if (desc.includes("shared database") || desc.includes("shared db")) findings.push({ type: "error", message: "Shared database anti-pattern detected - each service should own its data" });',
      'if (desc.includes("synchronous") && !desc.includes("asynchronous")) findings.push({ type: "warning", message: "Only synchronous communication - consider async messaging for decoupling" });',
      'if (!desc.includes("log") && !desc.includes("metric") && !desc.includes("trace")) findings.push({ type: "warning", message: "No observability strategy (logging/metrics/tracing) mentioned" });',
      'if (!desc.includes("health") && !desc.includes("readiness")) findings.push({ type: "info", message: "Consider adding health/readiness check endpoints" });',
      'if (desc.includes("monolith") && desc.includes("microservice")) findings.push({ type: "info", message: "Transitioning from monolith - consider strangler fig pattern" });',
      'const errors = findings.filter(f => f.type === "error").length;',
      'const warnings = findings.filter(f => f.type === "warning").length;',
      'return JSON.stringify({ findings, summary: { errors, warnings, info: findings.length - errors - warnings } });',
    ].join('\n'),
    parameters: [
      {
        name: 'serviceDescription',
        type: 'string',
        description:
          'Text description of the microservices architecture or a specific service design',
        required: true,
      },
    ],
    outputType:
      'JSON object with findings array (type + message) and summary counts of errors, warnings, and info',
    dependencies: [],
    tags: [
      'microservices',
      'architecture',
      'resilience',
      'service-boundaries',
      'distributed-systems',
    ],
    examples: [
      {
        description: 'Check a service description with shared database anti-pattern',
        input: {
          serviceDescription:
            'Order service uses a shared database with the inventory service. Communication is synchronous REST.',
        },
        expectedOutput:
          '{"findings":[{"type":"warning","message":"No resilience pattern (circuit breaker/retry) mentioned"},{"type":"warning","message":"No timeout strategy described - risk of cascading failures"},{"type":"error","message":"Shared database anti-pattern detected - each service should own its data"},{"type":"warning","message":"Only synchronous communication - consider async messaging for decoupling"},{"type":"warning","message":"No observability strategy (logging/metrics/tracing) mentioned"},{"type":"info","message":"Consider adding health/readiness check endpoints"}],"summary":{"errors":1,"warnings":4,"info":1}}',
      },
    ],
  },
  {
    name: 'diataxis-doc-classify',
    description:
      'Classifies documentation into Diataxis framework categories (tutorial, how-to guide, ' +
      'reference, explanation) based on content analysis and suggests improvements to better ' +
      'align with the identified category.',
    category: 'documentation',
    complexity: 'simple',
    code: [
      'const doc = documentation.toLowerCase();',
      'const scores = { tutorial: 0, "how-to": 0, reference: 0, explanation: 0 };',
      'if (/step \\d|first.*then|let.s|follow along|beginner/i.test(documentation)) scores.tutorial += 3;',
      'if (/learn|introduce|getting started|walkthrough/i.test(documentation)) scores.tutorial += 2;',
      'if (/how to|solve|goal|achieve|recipe|steps to/i.test(documentation)) scores["how-to"] += 3;',
      'if (/prerequisite|assume you|you need to/i.test(documentation)) scores["how-to"] += 2;',
      'if (/api|parameter|return|type|interface|schema|endpoint/i.test(documentation)) scores.reference += 3;',
      'if (/table|specification|signature|default value/i.test(documentation)) scores.reference += 2;',
      'if (/why|because|concept|understand|theory|background|context/i.test(documentation)) scores.explanation += 3;',
      'if (/history|design decision|trade-?off|alternative/i.test(documentation)) scores.explanation += 2;',
      'const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);',
      'const primary = sorted[0][0];',
      'const suggestions = [];',
      'if (primary === "tutorial" && !doc.includes("exercise")) suggestions.push("Add hands-on exercises for the reader");',
      'if (primary === "how-to" && !doc.includes("prerequisite")) suggestions.push("Add a prerequisites section");',
      'if (primary === "reference" && !doc.includes("example")) suggestions.push("Add usage examples for each entry");',
      'if (primary === "explanation" && !doc.includes("diagram")) suggestions.push("Consider adding diagrams to illustrate concepts");',
      'return JSON.stringify({ classification: primary, scores, suggestions });',
    ].join('\n'),
    parameters: [
      {
        name: 'documentation',
        type: 'string',
        description: 'Documentation text to classify',
        required: true,
      },
    ],
    outputType:
      'JSON object with primary classification, category scores, and improvement suggestions',
    dependencies: [],
    tags: ['diataxis', 'documentation', 'classification', 'technical-writing', 'docs'],
    examples: [
      {
        description: 'Classify a how-to guide',
        input: {
          documentation:
            'How to deploy to production\n\nPrerequisite: Docker installed.\n\nSteps to achieve a zero-downtime deployment:\n1. Build the image\n2. Push to registry\n3. Update the service',
        },
        expectedOutput:
          '{"classification":"how-to","scores":{"tutorial":0,"how-to":5,"reference":0,"explanation":0},"suggestions":[]}',
      },
    ],
  },
] as const satisfies readonly CreateSkillOptions[];
