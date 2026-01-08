/**
 * nexus-agents/self-eval
 *
 * Self-Evaluation Protocol for codebase component assessment.
 * Implements the MVP approved via consensus voting (#136).
 *
 * This is a CODE REVIEW RECOMMENDATION SYSTEM, not a governance protocol.
 * All outputs are recommendations for human review.
 */

// Component Scanner
export {
  ComponentScanner,
  createComponentScanner,
  scanComponents,
  type ComponentInfo,
  type ComponentInventory,
  type ScannerConfig,
} from './component-scanner.js';
