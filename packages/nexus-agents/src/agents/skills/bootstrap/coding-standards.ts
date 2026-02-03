/**
 * Bootstrap skills for coding standards review and analysis.
 *
 * Provides built-in skills for TypeScript review, Python review,
 * CI/CD pipeline validation, and code complexity analysis.
 *
 * @module agents/skills/bootstrap/coding-standards
 * (Epic #643 Phase 2 - Standards Absorption)
 */

import type { CreateSkillOptions } from '../skill-types.js';

/**
 * Built-in coding standards skills for the SkillLibrary.
 *
 * Each skill provides a concise function body that reviews or analyzes
 * code against established best practices and patterns.
 */
export const CODING_SKILLS = [
  {
    name: 'typescript-review',
    description:
      'Reviews TypeScript code for best practices including strict mode compliance, ' +
      'proper typing (no implicit any), error handling patterns (Result types over ' +
      'try/catch), and idiomatic async/await usage.',
    category: 'coding-standards',
    complexity: 'moderate',
    code: [
      'const issues = [];',
      'if (code.includes(": any")) issues.push("Avoid `any` - use `unknown` or a specific type");',
      'if (code.includes("as any")) issues.push("Avoid type assertions with `any`");',
      'if (!code.includes("readonly") && code.includes("interface")) issues.push("Consider `readonly` properties in interfaces");',
      'if (code.includes("catch (e)") && !code.includes("instanceof")) issues.push("Type-narrow caught errors with `instanceof`");',
      'if (code.includes("console.log")) issues.push("Replace `console.log` with structured logger");',
      'if (code.includes("null") && !code.includes("undefined")) issues.push("Be consistent: prefer `undefined` over `null` unless API requires it");',
      'if (code.includes("export default")) issues.push("Prefer named exports over default exports");',
      'const severity = issues.length > 4 ? "high" : issues.length > 1 ? "medium" : "low";',
      'return JSON.stringify({ issues, severity, issueCount: issues.length });',
    ].join('\n'),
    parameters: [
      {
        name: 'code',
        type: 'string',
        description: 'TypeScript source code to review',
        required: true,
      },
    ],
    outputType: 'JSON object with issues array, severity level, and issue count',
    dependencies: [],
    tags: ['typescript', 'review', 'best-practices', 'strict-mode', 'typing'],
    examples: [
      {
        description: 'Review code with any types and missing readonly',
        input: { code: 'interface User { name: any; }' },
        expectedOutput:
          '{"issues":["Avoid `any` - use `unknown` or a specific type","Consider `readonly` properties in interfaces"],"severity":"medium","issueCount":2}',
      },
    ],
  },
  {
    name: 'python-review',
    description:
      'Reviews Python code for PEP 8 style compliance, type hint usage, ' +
      'async pattern correctness, and common anti-patterns such as mutable ' +
      'default arguments and bare except clauses.',
    category: 'coding-standards',
    complexity: 'moderate',
    code: [
      'const issues = [];',
      'if (code.includes("def ") && !code.includes("->")) issues.push("Add return type hints to function signatures");',
      'if (code.includes("except:")) issues.push("Avoid bare `except:` - catch specific exceptions");',
      'if (/def \\w+\\([^)]*=\\[\\]/.test(code)) issues.push("Mutable default argument detected - use `None` and assign inside");',
      'if (code.includes("import *")) issues.push("Avoid wildcard imports - import specific names");',
      'if (code.includes("global ")) issues.push("Avoid `global` statements - pass values explicitly");',
      'if (/print\\(/.test(code) && !code.includes("logging")) issues.push("Use `logging` module instead of `print()` for production");',
      'if (code.includes("async def") && !code.includes("await")) issues.push("Async function without `await` - verify async is needed");',
      'const severity = issues.length > 4 ? "high" : issues.length > 1 ? "medium" : "low";',
      'return JSON.stringify({ issues, severity, issueCount: issues.length });',
    ].join('\n'),
    parameters: [
      {
        name: 'code',
        type: 'string',
        description: 'Python source code to review',
        required: true,
      },
    ],
    outputType: 'JSON object with issues array, severity level, and issue count',
    dependencies: [],
    tags: ['python', 'review', 'pep8', 'type-hints', 'async'],
    examples: [
      {
        description: 'Review code with bare except and missing type hints',
        input: { code: 'def greet(name):\n  try:\n    print(name)\n  except:\n    pass' },
        expectedOutput:
          '{"issues":["Add return type hints to function signatures","Avoid bare `except:` - catch specific exceptions","Use `logging` module instead of `print()` for production"],"severity":"medium","issueCount":3}',
      },
    ],
  },
  {
    name: 'cicd-pipeline-validate',
    description:
      'Validates CI/CD pipeline configurations for common issues including ' +
      'missing caching, absent security scanning steps, missing artifact ' +
      'retention, and platform-specific best practices for GitHub Actions ' +
      'and GitLab CI.',
    category: 'devops',
    complexity: 'moderate',
    code: [
      'const issues = [];',
      'const isGHA = platform === "github-actions";',
      'const isGitLab = platform === "gitlab-ci";',
      'if (!config.includes("cache")) issues.push("No caching configured - builds may be slow");',
      'if (!config.includes("timeout")) issues.push("No timeout configured - jobs could hang indefinitely");',
      'if (isGHA && !config.includes("actions/checkout")) issues.push("Missing actions/checkout step");',
      'if (isGHA && config.includes("secrets.") && !config.includes("environment")) issues.push("Secrets used without environment protection");',
      'if (isGitLab && !config.includes("stages:")) issues.push("Missing explicit stages definition");',
      'if (isGitLab && !config.includes("artifacts:")) issues.push("No artifacts configured for pipeline outputs");',
      'if (!config.includes("lint") && !config.includes("eslint")) issues.push("No linting step detected in pipeline");',
      'if (!config.includes("test")) issues.push("No test step detected in pipeline");',
      'const valid = issues.length === 0;',
      'return JSON.stringify({ valid, platform, issues, issueCount: issues.length });',
    ].join('\n'),
    parameters: [
      {
        name: 'config',
        type: 'string',
        description: 'CI/CD pipeline configuration content (YAML)',
        required: true,
      },
      {
        name: 'platform',
        type: 'string',
        description: 'Pipeline platform: "github-actions" or "gitlab-ci"',
        required: true,
      },
    ],
    outputType: 'JSON object with valid boolean, platform, issues array, and issue count',
    dependencies: [],
    tags: ['cicd', 'pipeline', 'github-actions', 'gitlab-ci', 'devops', 'validation'],
    examples: [
      {
        description: 'Validate a minimal GitHub Actions config missing caching',
        input: {
          config:
            'on: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4',
          platform: 'github-actions',
        },
        expectedOutput:
          '{"valid":false,"platform":"github-actions","issues":["No caching configured - builds may be slow","No timeout configured - jobs could hang indefinitely","No linting step detected in pipeline","No test step detected in pipeline"],"issueCount":4}',
      },
    ],
  },
  {
    name: 'code-complexity-analyze',
    description:
      'Analyzes code for cyclomatic complexity indicators by counting ' +
      'branching constructs (if/else, switch, loops, ternaries, catch blocks) ' +
      'and suggests simplifications when complexity is high.',
    category: 'code-analysis',
    complexity: 'simple',
    code: [
      'const branches = (code.match(/\\b(if|else if|else|switch|case|for|while|do|catch|\\?.*:)/g) || []).length;',
      'const functions = (code.match(/\\b(function|=>|def |fn )/g) || []).length;',
      'const perFunction = functions > 0 ? Math.round(branches / functions) : branches;',
      'const suggestions = [];',
      'if (perFunction > 10) suggestions.push("Consider extracting complex branches into separate functions");',
      'if (perFunction > 5) suggestions.push("Consider using early returns to reduce nesting");',
      'if (code.includes("else if") && (code.match(/else if/g) || []).length > 3) suggestions.push("Replace chained else-if with a lookup table or strategy pattern");',
      'if ((code.match(/\\b(for|while)\\b/g) || []).length > 2) suggestions.push("Multiple loops detected - consider combining or using higher-order functions");',
      'const level = perFunction > 10 ? "high" : perFunction > 5 ? "moderate" : "low";',
      'return JSON.stringify({ language, branches, functions, complexityPerFunction: perFunction, level, suggestions });',
    ].join('\n'),
    parameters: [
      {
        name: 'code',
        type: 'string',
        description: 'Source code to analyze for complexity',
        required: true,
      },
      {
        name: 'language',
        type: 'string',
        description: 'Programming language of the code (e.g., "typescript", "python")',
        required: true,
      },
    ],
    outputType:
      'JSON object with language, branch count, function count, complexity per function, level, and suggestions',
    dependencies: [],
    tags: ['complexity', 'cyclomatic', 'analysis', 'refactoring', 'code-quality'],
    examples: [
      {
        description: 'Analyze a function with moderate branching',
        input: {
          code: 'function calc(x) {\n  if (x > 0) {\n    if (x > 10) return "big";\n    return "small";\n  } else {\n    return "negative";\n  }\n}',
          language: 'typescript',
        },
        expectedOutput:
          '{"language":"typescript","branches":3,"functions":1,"complexityPerFunction":3,"level":"low","suggestions":[]}',
      },
    ],
  },
] as const satisfies readonly CreateSkillOptions[];
