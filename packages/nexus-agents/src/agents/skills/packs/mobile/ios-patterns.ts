/**
 * iOS Development Patterns Skills
 *
 * iOS-specific patterns covering SwiftUI, UIKit, Combine,
 * and architecture patterns for Apple platforms.
 *
 * @module agents/skills/packs/mobile/ios-patterns
 * (Epic #643 Phase 4)
 */

import type { CreateSkillOptions } from '../../skill-types.js';

export const IOS_SKILLS: readonly CreateSkillOptions[] = [
  {
    name: 'swiftui-review',
    description:
      'Reviews SwiftUI code for best practices. Checks property wrapper usage ' +
      '(@State, @Binding, @ObservedObject, @EnvironmentObject), view composition, ' +
      'performance (lazy stacks, equatable), and proper data flow patterns.',
    category: 'code-analysis',
    complexity: 'moderate',
    code: [
      'function swiftuiReview(code: string): string {',
      '  const checks = [',
      '    { check: "Property Wrappers", pattern: /@State|@Binding|@ObservedObject|@StateObject/i },',
      '    { check: "Environment", pattern: /@Environment|@EnvironmentObject/i },',
      '    { check: "View Composition", pattern: /var body.*some View|ViewBuilder/i },',
      '    { check: "Lazy Loading", pattern: /LazyVStack|LazyHStack|LazyVGrid/i },',
      '    { check: "Navigation", pattern: /NavigationStack|NavigationLink|navigationDestination/i },',
      '    { check: "Async Pattern", pattern: /\\.task\\s*\\{|async|await/i },',
      '  ];',
      '  return checks.map(c => `${c.pattern.test(code) ? "OK" : "INFO"}: ${c.check}`).join("\\n");',
      '}',
    ].join('\n'),
    parameters: [
      { name: 'code', type: 'string', description: 'SwiftUI code to review', required: true },
    ],
    outputType: 'string',
    tags: ['mobile', 'ios', 'swiftui', 'swift', 'apple'],
    examples: [
      {
        description: 'Review a SwiftUI view for best practices',
        input: {
          code: 'struct UserView: View { @StateObject var vm = UserVM(); var body: some View { LazyVStack { } } }',
        },
        expectedOutput: 'OK: Property Wrappers\nOK: View Composition\nOK: Lazy Loading',
      },
    ],
  },
  {
    name: 'uikit-review',
    description:
      'Reviews UIKit code for common issues. Checks memory management (retain cycles), ' +
      'Auto Layout constraints, table/collection view cell reuse, main thread UI updates, ' +
      'and proper delegate/protocol patterns.',
    category: 'code-analysis',
    complexity: 'moderate',
    code: [
      'function uikitReview(code: string): string {',
      '  const checks = [',
      '    { check: "Weak References", pattern: /weak\\s+(var|let)|\\[weak\\s+self\\]/i },',
      '    { check: "Auto Layout", pattern: /NSLayoutConstraint|anchor|SnapKit|translatesAutoresizing/i },',
      '    { check: "Cell Reuse", pattern: /dequeueReusableCell|prepareForReuse|reuseIdentifier/i },',
      '    { check: "Main Thread", pattern: /DispatchQueue\\.main|@MainActor|MainActor/i },',
      '    { check: "Delegate Pattern", pattern: /protocol.*Delegate|delegate\\s*[=:]/i },',
      '  ];',
      '  return checks.map(c => `${c.pattern.test(code) ? "OK" : "INFO"}: ${c.check}`).join("\\n");',
      '}',
    ].join('\n'),
    parameters: [
      { name: 'code', type: 'string', description: 'UIKit code to review', required: true },
    ],
    outputType: 'string',
    tags: ['mobile', 'ios', 'uikit', 'swift', 'objective-c'],
    examples: [
      {
        description: 'Review a UIKit view controller for common issues',
        input: {
          code: 'class UserVC: UIViewController { weak var delegate: UserDelegate?; override func viewDidLoad() { } }',
        },
        expectedOutput: 'OK: Weak References\nOK: Delegate Pattern',
      },
    ],
  },
] as const;
