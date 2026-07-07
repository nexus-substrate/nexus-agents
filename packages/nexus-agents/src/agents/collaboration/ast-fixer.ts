/**
 * nexus-agents/agents - AST-Based Code Fixer
 *
 * Uses ts-morph for TypeScript AST transformations to apply
 * constitutional violations fixes at the correct locations.
 *
 * The `error-handling` and `no-eval` fixers delegate to ast-grep pattern
 * rewrites (`./ast-rewrites.ts`) instead of the regex/text-suffix transforms
 * this module used to inline — those silently no-op'd on semicolon-terminated
 * promise chains and over-matched `*Function` callees (#4243). The other four
 * fixers, and this class's entire public surface (`applyFix`,
 * `createAstFixer()`, `AstFixResult`, comment-fallback, line-targeting),
 * are unchanged.
 *
 * @module agents/collaboration/ast-fixer
 * @see Issue #459 - AST-based code fixing in constitutional critic
 * @see Issue #4243 - ast-fixer misses semicolon-terminated chains, over-matches *Function
 * @see Issue #4249 - epic: replace ast-fixer's broken regex transforms
 */

import { Project, SyntaxKind, SourceFile, Node } from 'ts-morph';
import type { Violation } from './constitutional-types.js';
import { appendCatchToUnhandledThen, neutralizeEvalCalls } from './ast-rewrites.js';

/**
 * Result of an AST fix attempt.
 */
export interface AstFixResult {
  /** Whether the fix was successfully applied */
  readonly success: boolean;
  /** The transformed code (or original if fix failed) */
  readonly code: string;
  /** Description of what was changed */
  readonly changeDescription?: string;
  /** Error message if fix failed */
  readonly error?: string;
}

/**
 * AST-based code fixer for constitutional violations.
 *
 * Applies targeted transformations based on violation type,
 * preserving formatting and comments where possible.
 */
export class AstFixer {
  private readonly project: Project;

  constructor() {
    this.project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        allowJs: true,
        checkJs: false,
        strict: false,
      },
    });
  }

  /**
   * Applies a fix for a violation using AST transformation.
   *
   * @param code - The source code to fix
   * @param violation - The violation to address
   * @returns Result with transformed code or error
   */
  applyFix(code: string, violation: Violation): AstFixResult {
    const fixers: Record<string, (sf: SourceFile, v: Violation) => AstFixResult> = {
      'no-secrets': this.fixNoSecrets.bind(this),
      'no-console': this.fixNoConsole.bind(this),
      'error-handling': this.fixErrorHandling.bind(this),
      'type-safety': this.fixTypeSafety.bind(this),
      'no-eval': this.fixNoEval.bind(this),
      'input-validation': this.fixInputValidation.bind(this),
    };

    const fixer = fixers[violation.principleId];
    if (fixer === undefined) {
      return this.applyCommentFix(code, violation);
    }

    try {
      const sourceFile = this.project.createSourceFile('temp.ts', code, { overwrite: true });
      const result = fixer(sourceFile, violation);
      this.project.removeSourceFile(sourceFile);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown AST error';
      return {
        success: false,
        code,
        error: `AST transformation failed: ${message}`,
      };
    }
  }

  /**
   * Fixes hardcoded secrets by replacing with environment variable references.
   */
  private fixNoSecrets(sourceFile: SourceFile, violation: Violation): AstFixResult {
    const lineNum = this.getLineNumber(violation);
    if (lineNum === null) {
      return this.applyCommentFix(sourceFile.getFullText(), violation);
    }

    const line = sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration).find((node) => {
      const startLine = node.getStartLineNumber();
      return startLine === lineNum || startLine === lineNum - 1 || startLine === lineNum + 1;
    });

    if (line === undefined) {
      return this.applyCommentFix(sourceFile.getFullText(), violation);
    }

    const name = line.getName();
    const envVarName = this.toEnvVarName(name);

    // Replace the initializer with process.env reference
    const initializer = line.getInitializer();
    if (initializer !== undefined) {
      const comment = `/* TODO: Move to environment variable: ${envVarName} */`;
      initializer.replaceWithText(`process.env['${envVarName}'] ${comment}`);

      return {
        success: true,
        code: sourceFile.getFullText(),
        changeDescription: `Replaced hardcoded secret '${name}' with process.env['${envVarName}']`,
      };
    }

    return this.applyCommentFix(sourceFile.getFullText(), violation);
  }

  /**
   * Checks if expression is a console method call.
   */
  private isConsoleCall(expression: Node): boolean {
    if (!Node.isPropertyAccessExpression(expression)) {
      return false;
    }
    const obj = expression.getExpression();
    const prop = expression.getName();
    return obj.getText() === 'console' && ['log', 'warn', 'error', 'debug', 'info'].includes(prop);
  }

  /**
   * Fixes console.log/warn/error statements by commenting them out.
   */
  private fixNoConsole(sourceFile: SourceFile, violation: Violation): AstFixResult {
    const lineNum = this.getLineNumber(violation);
    let modified = false;

    const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
    for (const call of callExpressions) {
      if (!this.isConsoleCall(call.getExpression())) {
        continue;
      }

      const callLine = call.getStartLineNumber();
      if (lineNum !== null && callLine !== lineNum) {
        continue;
      }

      const statement = call.getFirstAncestorByKind(SyntaxKind.ExpressionStatement);
      if (statement !== undefined) {
        const originalText = statement.getText();
        statement.replaceWithText(`// ${originalText} // Removed: no-console`);
        modified = true;
        if (lineNum !== null) {
          break;
        }
      }
    }

    if (modified) {
      return {
        success: true,
        code: sourceFile.getFullText(),
        changeDescription: 'Commented out console statement(s)',
      };
    }

    return this.applyCommentFix(sourceFile.getFullText(), violation);
  }

  /**
   * Fixes missing error handling by adding .catch() to promise chains.
   *
   * Delegates to the ast-grep pattern rewrite {@link appendCatchToUnhandledThen}
   * (#4243) — the old text-suffix regex silently no-op'd on any
   * semicolon-terminated statement.
   */
  private fixErrorHandling(sourceFile: SourceFile, violation: Violation): AstFixResult {
    const lineNum = this.getLineNumber(violation);
    const code = sourceFile.getFullText();
    const result = appendCatchToUnhandledThen(code, lineNum);

    if (result.modified) {
      return {
        success: true,
        code: result.code,
        changeDescription: 'Added .catch() to promise chain(s)',
      };
    }

    return this.applyCommentFix(code, violation);
  }

  /**
   * Fixes type safety issues by replacing 'any' with 'unknown'.
   */
  private fixTypeSafety(sourceFile: SourceFile, violation: Violation): AstFixResult {
    const lineNum = this.getLineNumber(violation);
    let modified = false;

    // Find 'any' type references
    const anyKeywords = sourceFile.getDescendantsOfKind(SyntaxKind.AnyKeyword);
    for (const anyNode of anyKeywords) {
      const nodeLine = anyNode.getStartLineNumber();
      if (lineNum !== null && nodeLine !== lineNum) {
        continue;
      }

      anyNode.replaceWithText('unknown');
      modified = true;

      if (lineNum !== null) {
        break;
      }
    }

    if (modified) {
      return {
        success: true,
        code: sourceFile.getFullText(),
        changeDescription: "Replaced 'any' type with 'unknown'",
      };
    }

    return this.applyCommentFix(sourceFile.getFullText(), violation);
  }

  /**
   * Fixes eval() usage by commenting it out with a warning.
   *
   * Delegates to the ast-grep pattern rewrite {@link neutralizeEvalCalls}
   * (#4243) — the old `expressionText.endsWith('Function')` text check
   * over-matched ordinary identifiers like `setupFunction()`.
   */
  private fixNoEval(sourceFile: SourceFile, violation: Violation): AstFixResult {
    const lineNum = this.getLineNumber(violation);
    const code = sourceFile.getFullText();
    const result = neutralizeEvalCalls(code, lineNum);

    if (result.modified) {
      return {
        success: true,
        code: result.code,
        changeDescription: 'Disabled eval() call with security error',
      };
    }

    return this.applyCommentFix(code, violation);
  }

  /**
   * Checks if expression is a JSON.parse call.
   */
  private isJsonParse(expression: Node): boolean {
    if (!Node.isPropertyAccessExpression(expression)) {
      return false;
    }
    return expression.getText() === 'JSON.parse';
  }

  /**
   * Fixes input validation by wrapping JSON.parse in try-catch.
   */
  private fixInputValidation(sourceFile: SourceFile, violation: Violation): AstFixResult {
    const lineNum = this.getLineNumber(violation);
    let modified = false;

    const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
    for (const call of callExpressions) {
      if (!this.isJsonParse(call.getExpression())) {
        continue;
      }

      const callLine = call.getStartLineNumber();
      if (lineNum !== null && callLine !== lineNum) {
        continue;
      }

      // Skip if already in try-catch
      const tryStatement = call.getFirstAncestorByKind(SyntaxKind.TryStatement);
      if (tryStatement !== undefined) {
        continue;
      }

      const statement = call.getFirstAncestorByKind(SyntaxKind.ExpressionStatement);
      if (statement !== undefined) {
        const originalText = statement.getText();
        const wrapped =
          `try {\n  ${originalText}\n} catch (parseError) {\n` +
          `  throw new Error(\`Invalid JSON: \${parseError instanceof Error ? parseError.message : 'Parse failed'}\`);\n}`;
        statement.replaceWithText(wrapped);
        modified = true;

        if (lineNum !== null) {
          break;
        }
      }
    }

    if (modified) {
      return {
        success: true,
        code: sourceFile.getFullText(),
        changeDescription: 'Wrapped JSON.parse in try-catch block',
      };
    }

    return this.applyCommentFix(sourceFile.getFullText(), violation);
  }

  /**
   * Fallback: applies a comment-based fix when AST transformation isn't possible.
   */
  private applyCommentFix(code: string, violation: Violation): AstFixResult {
    const lineNum = this.getLineNumber(violation);
    if (lineNum === null) {
      // Add comment at top of file
      const comment = `// TODO [${violation.principleId}]: ${violation.suggestedFix}`;
      return {
        success: true,
        code: `${comment}\n${code}`,
        changeDescription: 'Added TODO comment at file start',
      };
    }

    const lines = code.split('\n');
    if (lineNum > 0 && lineNum <= lines.length) {
      const comment = `// TODO [${violation.principleId}]: ${violation.suggestedFix}`;
      lines.splice(lineNum - 1, 0, comment);
      return {
        success: true,
        code: lines.join('\n'),
        changeDescription: `Added TODO comment at line ${String(lineNum)}`,
      };
    }

    return {
      success: false,
      code,
      error: `Invalid line number: ${String(lineNum)}`,
    };
  }

  /**
   * Extracts line number from violation location string.
   */
  private getLineNumber(violation: Violation): number | null {
    if (violation.location === undefined) {
      return null;
    }

    const match = /line\s*(\d+)/i.exec(violation.location);
    if (match === null) {
      return null;
    }

    return parseInt(match[1] ?? '0', 10);
  }

  /**
   * Converts a variable name to SCREAMING_SNAKE_CASE for env vars.
   */
  private toEnvVarName(name: string): string {
    return name
      .replace(/([A-Z])/g, '_$1')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .toUpperCase()
      .replace(/^_/, '')
      .replace(/_+/g, '_');
  }
}

/**
 * Creates an AST fixer instance.
 */
export function createAstFixer(): AstFixer {
  return new AstFixer();
}
