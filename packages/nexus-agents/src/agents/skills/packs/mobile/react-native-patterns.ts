/**
 * React Native Patterns Skills
 *
 * React Native patterns covering bridge communication, navigation,
 * performance optimization, and platform-specific patterns.
 *
 * @module agents/skills/packs/mobile/react-native-patterns
 * (Epic #643 Phase 4)
 */

import type { CreateSkillOptions } from '../../skill-types.js';

export const REACT_NATIVE_SKILLS: readonly CreateSkillOptions[] = [
  {
    name: 'react-native-performance-review',
    description:
      'Reviews React Native code for performance best practices. Checks FlatList ' +
      'optimization (getItemLayout, keyExtractor), memoization (useMemo, useCallback, memo), ' +
      'bridge communication minimization, Hermes engine usage, and image optimization.',
    category: 'code-analysis',
    complexity: 'moderate',
    code: [
      'function reactNativePerformanceReview(code: string): string {',
      '  const checks = [',
      '    { check: "FlatList Optimization", pattern: /getItemLayout|keyExtractor|windowSize/i },',
      '    { check: "Memoization", pattern: /useMemo|useCallback|React\\.memo/i },',
      '    { check: "Bridge Minimization", pattern: /useNativeDriver|nativeEvent|TurboModule/i },',
      '    { check: "Image Optimization", pattern: /FastImage|resizeMode|cacheControl/i },',
      '    { check: "Interaction Manager", pattern: /InteractionManager|requestAnimationFrame/i },',
      '    { check: "Hermes Engine", pattern: /hermes|enableHermes|hermesFlags/i },',
      '  ];',
      '  return checks.map(c => `${c.pattern.test(code) ? "OK" : "INFO"}: ${c.check}`).join("\\n");',
      '}',
    ].join('\n'),
    parameters: [
      {
        name: 'code',
        type: 'string',
        description: 'React Native code to review for performance',
        required: true,
      },
    ],
    outputType: 'string',
    tags: ['mobile', 'react-native', 'performance', 'optimization', 'javascript'],
    examples: [
      {
        description: 'Review a FlatList component for performance',
        input: {
          code: '<FlatList data={items} renderItem={renderItem} keyExtractor={item => item.id} getItemLayout={getLayout} />',
        },
        expectedOutput: 'OK: FlatList Optimization',
      },
    ],
  },
  {
    name: 'react-native-navigation-review',
    description:
      'Reviews React Native navigation patterns. Checks React Navigation setup, ' +
      'deep linking configuration, screen transition performance, typed routes, ' +
      'and navigation state persistence.',
    category: 'code-analysis',
    complexity: 'simple',
    code: [
      'function reactNativeNavigationReview(code: string): string {',
      '  const checks = [',
      '    { check: "Navigation Setup", pattern: /NavigationContainer|createNativeStackNavigator/i },',
      '    { check: "Deep Linking", pattern: /linking|deepLink|universalLink|prefixes/i },',
      '    { check: "Typed Routes", pattern: /RootStackParamList|NavigationProp|RouteProp/i },',
      '    { check: "State Persistence", pattern: /onStateChange|initialState|AsyncStorage.*nav/i },',
      '    { check: "Screen Options", pattern: /screenOptions|headerShown|gestureEnabled/i },',
      '  ];',
      '  return checks.map(c => `${c.pattern.test(code) ? "OK" : "INFO"}: ${c.check}`).join("\\n");',
      '}',
    ].join('\n'),
    parameters: [
      {
        name: 'code',
        type: 'string',
        description: 'React Native navigation code to review',
        required: true,
      },
    ],
    outputType: 'string',
    tags: ['mobile', 'react-native', 'navigation', 'deep-linking', 'routing'],
    examples: [
      {
        description: 'Review navigation setup',
        input: {
          code: 'const Stack = createNativeStackNavigator<RootStackParamList>(); <NavigationContainer linking={linking}>',
        },
        expectedOutput: 'OK: Navigation Setup\nOK: Deep Linking\nOK: Typed Routes',
      },
    ],
  },
] as const;
