/**
 * Python Patterns Knowledge Module
 *
 * Actionable Python coding patterns and best practices
 * for enriching code expert agent prompts.
 *
 * @module agents/experts/knowledge/code/python-patterns
 * (Source: Epic #643 - Standards Absorption, Phase 1c)
 */

import type { KnowledgeModule } from '../types.js';

export const PYTHON_PATTERNS: KnowledgeModule = {
  id: 'code-python-patterns',
  domain: 'code',
  title: 'Python Patterns and Best Practices',
  tags: ['python', 'pep8', 'type-hints', 'testing', 'packaging'],
  sections: [
    {
      title: 'PEP 8 Essentials',
      priority: 10,
      content: [
        'Naming: snake_case for functions/variables, PascalCase for classes, UPPER_SNAKE for constants.',
        'Indentation: 4 spaces, never tabs. Continuation lines align with delimiter.',
        'Line length: 79 chars for code, 72 for docstrings. Use implicit line joining inside brackets.',
        'Imports: stdlib first, then third-party, then local. One import per line.',
        'Use isort for import sorting and black/ruff for formatting.',
        'Blank lines: 2 between top-level definitions, 1 between methods.',
        'Trailing commas in multi-line collections for cleaner diffs.',
      ].join('\n'),
    },
    {
      title: 'Type Hints',
      priority: 9,
      content: [
        'Annotate all public function signatures: `def process(data: list[str]) -> dict[str, int]:`',
        'Use `from __future__ import annotations` for deferred evaluation (3.7+).',
        'TypeVar for generics: `T = TypeVar("T")` then `def first(items: list[T]) -> T:`',
        'Protocol for structural subtyping: `class Renderable(Protocol): def render(self) -> str: ...`',
        'Use Generic[T] for generic classes. Prefer Protocol over ABC when possible.',
        'Union types: `str | int` (3.10+) or `Union[str, int]`. Avoid Optional, use `X | None`.',
        'TypeGuard for narrowing: `def is_str_list(v: list) -> TypeGuard[list[str]]:`',
        'Run mypy or pyright in strict mode. Address all type errors, never use `type: ignore` without comment.',
      ].join('\n'),
    },
    {
      title: 'Dataclasses and Attrs',
      priority: 7,
      content: [
        'Use @dataclass for simple data containers: `@dataclass(frozen=True, slots=True)`.',
        'frozen=True for immutability, slots=True for memory efficiency.',
        'field(default_factory=list) for mutable defaults. Never use mutable default arguments.',
        '__post_init__ for validation: raise ValueError for invalid state.',
        'attrs for more features: validators, converters, evolve for immutable updates.',
        'Prefer dataclasses over NamedTuple when you need methods or default values.',
        'Use kw_only=True (3.10+) to force keyword arguments for clarity.',
      ].join('\n'),
    },
    {
      title: 'Pytest Patterns',
      priority: 8,
      content: [
        'Fixtures: use @pytest.fixture for setup/teardown. Scope: function, class, module, session.',
        'Parametrize: @pytest.mark.parametrize("input,expected", [...]) for table-driven tests.',
        'conftest.py: shared fixtures auto-discovered. Place at appropriate directory level.',
        'Markers: @pytest.mark.slow, @pytest.mark.integration for selective test runs.',
        'Use tmp_path fixture for file operations. Use monkeypatch for env vars.',
        'Assert with plain assert statements. Use pytest.raises(ErrorType) for exceptions.',
        'Test naming: test_<function>_<scenario>_<expected_result>.',
        'Coverage: pytest-cov with --cov-fail-under=80 minimum.',
      ].join('\n'),
    },
    {
      title: 'Context Managers and Generators',
      priority: 7,
      content: [
        'Use `with` for resource management: files, locks, db connections.',
        '@contextmanager decorator for simple cases: yield in try/finally.',
        'Async context managers: `async with` and @asynccontextmanager.',
        'Generator functions for lazy sequences: `yield` values one at a time.',
        'Generator expressions: `(x**2 for x in range(1000))` for memory-efficient pipelines.',
        'Use `yield from` to delegate to sub-generators.',
        'send() and throw() for coroutine-style generators (prefer async/await instead).',
      ].join('\n'),
    },
    {
      title: 'Common Idioms',
      priority: 8,
      content: [
        'List comprehension: `[f(x) for x in items if pred(x)]`. Prefer over map/filter.',
        'Dict comprehension: `{k: v for k, v in pairs}`. Use for transformations.',
        'Walrus operator (3.8+): `if (n := len(data)) > 10:` to assign and test.',
        'Structural pattern matching (3.10+): `match command: case Command(action="quit"):` ...',
        'Unpacking: `first, *rest = items`. Swap: `a, b = b, a`.',
        'Use enumerate() over range(len()). Use zip() for parallel iteration.',
        'collections module: defaultdict, Counter, deque for specialized containers.',
        'functools: lru_cache for memoization, partial for currying.',
      ].join('\n'),
    },
    {
      title: 'Exception Handling Hierarchy',
      priority: 9,
      content: [
        'Catch specific exceptions: `except ValueError` not bare `except:` or `except Exception`.',
        'Create domain exception hierarchy: AppError -> ValidationError, NotFoundError.',
        'Use `raise ... from err` to chain exceptions and preserve tracebacks.',
        'finally for cleanup, else for success-only code after try.',
        'ExceptionGroup (3.11+) for concurrent error handling with `except*`.',
        'Never silence exceptions: at minimum log them. No empty except blocks.',
        'Use contextlib.suppress(ErrorType) for intentionally ignored exceptions.',
      ].join('\n'),
    },
    {
      title: 'Virtual Environment and Dependency Management',
      priority: 6,
      content: [
        'Always use virtual environments: venv, virtualenv, or tool-managed.',
        'pip: pin versions in requirements.txt. Use pip-compile for lock files.',
        'poetry: pyproject.toml for metadata + deps. poetry.lock for reproducible builds.',
        'uv: fast pip replacement. `uv pip install`, `uv venv` for speed.',
        'pyproject.toml: standard metadata format. Replaces setup.py/setup.cfg.',
        'Separate dev dependencies: [project.optional-dependencies] or poetry groups.',
        'Pin major versions at minimum: `requests>=2.28,<3`. Lock files for applications.',
      ].join('\n'),
    },
  ],
} as const;
