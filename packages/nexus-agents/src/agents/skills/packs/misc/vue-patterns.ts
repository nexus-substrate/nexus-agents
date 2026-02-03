/**
 * Vue.js Patterns Skills
 *
 * Vue 3 Composition API patterns: reactivity, composables,
 * state management, and performance optimization.
 *
 * @module agents/skills/packs/misc/vue-patterns
 * (Epic #643 Phase 4)
 */

import type { CreateSkillOptions } from '../../skill-types.js';

export const VUE_SKILLS: readonly CreateSkillOptions[] = [
  {
    name: 'vue-composition-review',
    description:
      'Reviews Vue 3 Composition API code for best practices. Checks reactive state ' +
      'management (ref, reactive, computed), composable extraction, lifecycle hooks, ' +
      'prop validation, emit declarations, and template ref usage.',
    category: 'frontend',
    complexity: 'moderate',
    code: [
      'function vueCompositionReview(code: string): string {',
      '  const checks = [',
      '    { check: "Reactive State", pattern: /\\bref\\(|reactive\\(|computed\\(/i },',
      '    { check: "Composable Pattern", pattern: /^export\\s+function\\s+use[A-Z]|useComposable/m },',
      '    { check: "Lifecycle Hooks", pattern: /onMounted|onUnmounted|onBeforeMount/i },',
      '    { check: "Prop Validation", pattern: /defineProps|withDefaults|PropType/i },',
      '    { check: "Emit Declaration", pattern: /defineEmits|emit\\(/i },',
      '    { check: "Watch Cleanup", pattern: /watchEffect|watch\\(.*\\{|onCleanup/i },',
      '  ];',
      '  return checks.map(c => `${c.pattern.test(code) ? "OK" : "INFO"}: ${c.check}`).join("\\n");',
      '}',
    ].join('\n'),
    parameters: [
      {
        name: 'code',
        type: 'string',
        description: 'Vue 3 Composition API code to review',
        required: true,
      },
    ],
    outputType: 'string',
    tags: ['frontend', 'vue', 'composition-api', 'reactivity', 'composables'],
    examples: [
      {
        description: 'Review a Vue 3 composable',
        input: {
          code: 'export function useUser() { const user = ref(null); onMounted(() => fetch()); return { user }; }',
        },
        expectedOutput: 'OK: Reactive State\nOK: Composable Pattern\nOK: Lifecycle Hooks',
      },
    ],
  },
] as const;
