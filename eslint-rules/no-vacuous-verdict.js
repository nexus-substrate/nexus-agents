/**
 * `no-vacuous-verdict` — a verdict must not report a pass over zero items.
 *
 * `[].every(p)` is `true` and `![].some(p)` is `true`. A verdict aggregated
 * over a collection that turned out empty therefore reports **pass** having
 * measured nothing: absence rendered as health, on exactly the code paths
 * where that is most dangerous. Confirmed instances in this tree included a
 * release announcing zero channels and exiting 0, a consensus session
 * finalizing on zero ballots, and a HIGH-severity review finding downgraded
 * because zero reviews counted as unanimous approval (#4581).
 *
 * ## Why this rule is scoped the way it is
 *
 * Measured before it was written: 68 non-test `.every()` sites, of which only
 * 10 were defects. A blanket ban would have been 85% false positives, and
 * false positives are what teach people to reach for an exemption. Two
 * independent censuses converged on the same discriminator — the **verdict
 * position**: the value is bound to a name like `passed`/`allSuccess`/`ok`, or
 * returned from a function with such a name. That, plus three structural
 * exclusions (type predicates, collection callbacks, provably non-empty
 * receivers), separates the 10 from the 58.
 *
 * ## The rule's own blind spot, stated rather than hidden
 *
 * The name vocabulary is load-bearing, and every voter on the panel that chose
 * this mechanism named the same failure mode: a verdict bound to a name
 * outside the vocabulary escapes silently, and the rule becomes an instance of
 * the very class it polices — a check that passes because it had nothing it
 * recognised to check. Measured recall on the known corpus is 7 of 10. Two
 * consequences follow, and both are deliberate:
 *
 *  1. `verdictWords` and `verdictPrefixes` are rule options, not constants, so
 *     extending the vocabulary is a config change rather than a code change.
 *  2. The rule ships with fixtures proving it FIRES on every known-bad shape.
 *     A detector with only passing fixtures cannot distinguish "found nothing"
 *     from "detected nothing".
 *
 * This rule is a floor, not a proof. The empty-input **test** is what actually
 * catches the class; this catches the subset that has a name to key on.
 *
 * @module eslint-rules/no-vacuous-verdict
 * (Source: Issue #4581)
 */

/**
 * Words that make the value a verdict — a pass/fail judgement, not incidental
 * data. Matched against the LAST camelCase token of the name, so `isAllHealthy`
 * and `allSuccess` match while `hook` and `depsResolved` do not. Substring
 * matching was tried first and matched `hook` on `ok`.
 */
const DEFAULT_VERDICT_WORDS = [
  'passed',
  'passes',
  'pass',
  'success',
  'succeeded',
  'approved',
  'valid',
  'healthy',
  'verdict',
  'compliant',
  'ok',
  'clean',
  'safe',
];

/**
 * Prefixes that make the whole name a verdict regardless of its final word —
 * `allVoted` and `everyStepDone` are judgements about a collection.
 */
const DEFAULT_VERDICT_PREFIXES = ['all', 'every'];

/**
 * Splits an identifier into lowercase camelCase / snake_case tokens.
 *
 * @param {string} name - The identifier.
 * @returns {string[]} Its tokens, lowercased.
 */
function tokenize(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase()
    .split(' ')
    .filter((t) => t !== '');
}

/** Methods whose callback argument is a predicate over items, never a verdict. */
const COLLECTION_METHODS = new Set([
  'filter',
  'find',
  'findIndex',
  'findLast',
  'some',
  'every',
  'sort',
  'map',
  'flatMap',
  'partition',
]);

const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

/**
 * The nearest enclosing function-like node.
 *
 * @param {object} node - AST node to search upward from.
 * @returns {object | undefined} The enclosing function, if any.
 */
function enclosingFunction(node) {
  for (let cur = node.parent; cur !== undefined && cur !== null; cur = cur.parent) {
    if (FUNCTION_TYPES.has(cur.type)) return cur;
  }
  return undefined;
}

/**
 * The declared name of a function-like node, via its own id or its binding.
 *
 * @param {object | undefined} fn - Function node.
 * @returns {string} The name, or the empty string when anonymous.
 */
function functionName(fn) {
  if (fn === undefined) return '';
  if (fn.id !== undefined && fn.id !== null) return String(fn.id.name);
  const p = fn.parent;
  if (p === undefined || p === null) return '';
  if (p.type === 'VariableDeclarator' && p.id.type === 'Identifier') return String(p.id.name);
  if (p.type === 'Property' && p.key.type === 'Identifier') return String(p.key.name);
  if (p.type === 'MethodDefinition' && p.key.type === 'Identifier') return String(p.key.name);
  return '';
}

/**
 * A `x is T` return annotation narrows a type; it is never a verdict.
 *
 * @param {object | undefined} fn - Function node.
 * @returns {boolean} True when the function is a type predicate.
 */
function isTypePredicate(fn) {
  const rt = fn?.returnType;
  return rt !== undefined && rt !== null && rt.typeAnnotation?.type === 'TSTypePredicate';
}

/**
 * True when the node sits inside a predicate handed to filter/find/some/sort.
 *
 * @param {object} node - The aggregation call.
 * @returns {boolean} True when this is a collection callback, not a verdict.
 */
function insideCollectionCallback(node) {
  const fn = enclosingFunction(node);
  const call = fn?.parent;
  if (call === undefined || call === null || call.type !== 'CallExpression') return false;
  const callee = call.callee;
  return callee.type === 'MemberExpression' && callee.property.type === 'Identifier'
    ? COLLECTION_METHODS.has(callee.property.name)
    : false;
}

/**
 * Where the boolean lands: a binding, a property, or a named function's return.
 *
 * Walks through the shapes that pass a value along unchanged — negation,
 * `&&`/`||`, ternaries, parentheses, `as` — so `!x.some(p)` and
 * `x.every(p) ? 0 : 1` reach the same sink their plain form would.
 *
 * @param {object} call - The aggregation call.
 * @returns {{kind: string, name: string} | undefined} The sink, if named.
 */
function sinkOf(call) {
  let cur = call;
  for (;;) {
    const p = cur.parent;
    if (p === undefined || p === null) return undefined;
    if (p.type === 'VariableDeclarator' && p.id.type === 'Identifier') {
      return { kind: 'binding', name: String(p.id.name) };
    }
    if (p.type === 'Property' && p.key.type === 'Identifier') {
      return { kind: 'property', name: String(p.key.name) };
    }
    if (p.type === 'PropertyDefinition' && p.key.type === 'Identifier') {
      return { kind: 'field', name: String(p.key.name) };
    }
    if (p.type === 'AssignmentExpression' && p.left.type === 'MemberExpression') {
      const prop = p.left.property;
      if (prop.type === 'Identifier') return { kind: 'assignment', name: String(prop.name) };
    }
    if (p.type === 'ReturnStatement' || p.type === 'ArrowFunctionExpression') {
      const fn = p.type === 'ArrowFunctionExpression' ? p : enclosingFunction(p);
      return { kind: 'return', name: functionName(fn) };
    }
    if (
      p.type === 'UnaryExpression' ||
      p.type === 'LogicalExpression' ||
      p.type === 'ConditionalExpression' ||
      p.type === 'TSAsExpression' ||
      p.type === 'TSNonNullExpression' ||
      p.type === 'ChainExpression'
    ) {
      cur = p;
      continue;
    }
    return undefined;
  }
}

/**
 * True when the receiver cannot be empty, or when emptiness was already
 * reasoned about somewhere in the enclosing function.
 *
 * A non-empty array literal — written inline, or bound by a `const` in scope —
 * has a floor of one element that no later `push` can remove. A mention of
 * `.length` or `.size` on the same receiver means an author already thought
 * about the empty case; the rule defers to them rather than second-guessing.
 *
 * @param {object} receiver - The expression `.every()`/`.some()` is called on.
 * @param {object} node - The aggregation call.
 * @param {object} context - ESLint rule context.
 * @returns {boolean} True when the site needs no verdict for the empty case.
 */
function cannotBeEmpty(receiver, node, context) {
  if (receiver.type === 'ArrayExpression') return receiver.elements.length > 0;

  const sourceCode = context.sourceCode;

  if (receiver.type === 'Identifier') {
    const scope = sourceCode.getScope(node);
    for (let s = scope; s !== null && s !== undefined; s = s.upper) {
      const variable = s.variables.find((v) => v.name === receiver.name);
      if (variable === undefined) continue;
      const boundToNonEmptyLiteral = variable.defs.some(
        (d) =>
          d.node?.type === 'VariableDeclarator' &&
          d.node.init?.type === 'ArrayExpression' &&
          d.node.init.elements.length > 0
      );
      // Not a literal is not the same as unguarded — fall through to the
      // `.length` check rather than reporting on a parameter that the caller
      // guards two lines up.
      if (boundToNonEmptyLiteral) return true;
      break;
    }
  }

  const fn = enclosingFunction(node);
  const scopeText = sourceCode.getText(fn ?? sourceCode.ast);
  const receiverText = sourceCode.getText(receiver);
  return scopeText.includes(`${receiverText}.length`) || scopeText.includes(`${receiverText}.size`);
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require a verdict aggregated over a possibly-empty collection to name its empty case',
    },
    schema: [
      {
        type: 'object',
        properties: {
          verdictWords: { type: 'array', items: { type: 'string' }, minItems: 1 },
          verdictPrefixes: { type: 'array', items: { type: 'string' }, minItems: 1 },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      vacuousVerdict:
        '`{{name}}` is a verdict aggregated with `.{{method}}()`, which is `{{vacuous}}` when the collection is empty — reporting a pass over zero items. Use `allOf`/`anyOf`/`verdictOver` from utils/verdict-aggregation and name the empty case, or guard on `.length`.',
    },
  },

  create(context) {
    const words = new Set(context.options[0]?.verdictWords ?? DEFAULT_VERDICT_WORDS);
    const prefixes = context.options[0]?.verdictPrefixes ?? DEFAULT_VERDICT_PREFIXES;

    /**
     * @param {string} name - The sink's identifier.
     * @returns {boolean} True when the name says the value is a judgement.
     */
    function isVerdictName(name) {
      if (name === '') return false;
      const tokens = tokenize(name);
      if (tokens.length === 0) return false;
      const last = tokens[tokens.length - 1];
      if (words.has(last)) return true;
      return prefixes.includes(tokens[0]) && tokens.length > 1;
    }

    /**
     * @param {object} node - A CallExpression for `.every()` or `.some()`.
     * @param {string} method - Which aggregation was called.
     * @param {string} vacuous - What the empty collection yields.
     */
    function check(node, method, vacuous) {
      const callee = node.callee;
      if (callee.type !== 'MemberExpression') return;
      if (insideCollectionCallback(node)) return;

      const fn = enclosingFunction(node);
      if (isTypePredicate(fn)) return;

      const sink = sinkOf(node);
      if (sink === undefined || !isVerdictName(sink.name)) return;
      if (cannotBeEmpty(callee.object, node, context)) return;

      context.report({
        node,
        messageId: 'vacuousVerdict',
        data: { name: sink.name, method, vacuous },
      });
    }

    return {
      'CallExpression[callee.type="MemberExpression"][callee.property.name="every"]'(node) {
        check(node, 'every', 'true');
      },
      // `.some()` on empty is `false`, which is usually the safe answer. Negated,
      // it becomes the optimistic one: `!findings.some(isError)` says a validator
      // that produced zero findings validated cleanly.
      'UnaryExpression[operator="!"] > CallExpression[callee.type="MemberExpression"][callee.property.name="some"]'(
        node
      ) {
        check(node, 'some', 'true (negated)');
      },
    };
  },
};

export default rule;
export { DEFAULT_VERDICT_WORDS, DEFAULT_VERDICT_PREFIXES };
