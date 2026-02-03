/**
 * Android Development Patterns Skills
 *
 * Android-specific patterns covering lifecycle management,
 * Jetpack Compose, dependency injection, and architecture components.
 *
 * @module agents/skills/packs/mobile/android-patterns
 * (Epic #643 Phase 4)
 */

import type { CreateSkillOptions } from '../../skill-types.js';

export const ANDROID_SKILLS: readonly CreateSkillOptions[] = [
  {
    name: 'android-lifecycle-review',
    description:
      'Reviews Android code for lifecycle management best practices. Checks ViewModel usage, ' +
      'LiveData/StateFlow observation, lifecycle-aware coroutine scopes, proper resource cleanup, ' +
      'configuration change handling, and process death restoration.',
    category: 'code-analysis',
    complexity: 'moderate',
    code: [
      'function androidLifecycleReview(code: string): string {',
      '  const checks = [',
      '    { check: "ViewModel Usage", pattern: /ViewModel|viewModel|hiltViewModel/i },',
      '    { check: "State Management", pattern: /StateFlow|LiveData|mutableStateOf/i },',
      '    { check: "Lifecycle Scope", pattern: /lifecycleScope|viewModelScope|repeatOnLifecycle/i },',
      '    { check: "Resource Cleanup", pattern: /onCleared|onDestroy|DisposableEffect/i },',
      '    { check: "SavedState", pattern: /SavedStateHandle|onSaveInstanceState|rememberSaveable/i },',
      '    { check: "DI Framework", pattern: /Hilt|Dagger|Koin|@Inject/i },',
      '  ];',
      '  return checks.map(c => `${c.pattern.test(code) ? "OK" : "WARN"}: ${c.check}`).join("\\n");',
      '}',
    ].join('\n'),
    parameters: [
      {
        name: 'code',
        type: 'string',
        description: 'Android/Kotlin code to review',
        required: true,
      },
    ],
    outputType: 'string',
    tags: ['mobile', 'android', 'lifecycle', 'jetpack', 'kotlin'],
    examples: [
      {
        description: 'Review a ViewModel for lifecycle best practices',
        input: {
          code: '@HiltViewModel class UserViewModel @Inject constructor(): ViewModel() { val state = MutableStateFlow(UiState()) }',
        },
        expectedOutput: 'OK: ViewModel Usage\nOK: State Management\nOK: DI Framework',
      },
    ],
  },
  {
    name: 'jetpack-compose-review',
    description:
      'Reviews Jetpack Compose code for performance and correctness. Checks stable types, ' +
      'remember/derivedStateOf usage, side effect APIs, recomposition optimization, ' +
      'and proper modifier chaining.',
    category: 'code-analysis',
    complexity: 'moderate',
    code: [
      'function jetpackComposeReview(code: string): string {',
      '  const checks = [',
      '    { check: "Remember Usage", pattern: /remember\\s*\\{|rememberSaveable/i },',
      '    { check: "Derived State", pattern: /derivedStateOf|snapshotFlow/i },',
      '    { check: "Side Effects", pattern: /LaunchedEffect|DisposableEffect|SideEffect/i },',
      '    { check: "Stable Types", pattern: /@Stable|@Immutable|data class/i },',
      '    { check: "Modifier Chain", pattern: /Modifier\\.|modifier\\s*=/i },',
      '    { check: "State Hoisting", pattern: /on\\w+:\\s*\\(|on\\w+\\s*=\\s*\\{/i },',
      '  ];',
      '  return checks.map(c => `${c.pattern.test(code) ? "OK" : "WARN"}: ${c.check}`).join("\\n");',
      '}',
    ].join('\n'),
    parameters: [
      {
        name: 'code',
        type: 'string',
        description: 'Jetpack Compose code to review',
        required: true,
      },
    ],
    outputType: 'string',
    tags: ['mobile', 'android', 'compose', 'jetpack', 'ui'],
    examples: [
      {
        description: 'Review a Compose composable for performance',
        input: {
          code: '@Composable fun UserCard(name: String, onClick: () -> Unit, modifier: Modifier = Modifier) { val cached = remember { expensiveCalc() } }',
        },
        expectedOutput: 'OK: Remember Usage\nOK: Modifier Chain\nOK: State Hoisting',
      },
    ],
  },
] as const;
