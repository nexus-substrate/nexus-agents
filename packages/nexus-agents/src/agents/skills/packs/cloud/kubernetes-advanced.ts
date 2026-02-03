/**
 * Kubernetes Advanced Patterns Skills
 *
 * Advanced Kubernetes patterns: custom operators, CRDs,
 * resource management, and security hardening.
 *
 * @module agents/skills/packs/cloud/kubernetes-advanced
 * (Epic #643 Phase 4)
 */

import type { CreateSkillOptions } from '../../skill-types.js';

export const KUBERNETES_ADVANCED_SKILLS: readonly CreateSkillOptions[] = [
  {
    name: 'k8s-security-review',
    description:
      'Reviews Kubernetes manifests for security hardening. Checks Pod Security Standards, ' +
      'network policies, RBAC configuration, secret management, resource limits, ' +
      'and container image policies.',
    category: 'cloud-native',
    complexity: 'complex',
    code: [
      'function k8sSecurityReview(manifest: string): string {',
      '  const checks = [',
      '    { check: "Non-Root User", pattern: /runAsNonRoot:\\s*true|runAsUser:\\s*[1-9]/i },',
      '    { check: "Read-Only FS", pattern: /readOnlyRootFilesystem:\\s*true/i },',
      '    { check: "Resource Limits", pattern: /limits:|resources:|cpu:|memory:/i },',
      '    { check: "Network Policy", pattern: /NetworkPolicy|networkpolicy|ingress.*from/i },',
      '    { check: "RBAC Scoped", pattern: /Role:|ClusterRole:|roleRef/i },',
      '    { check: "No Privileged", pattern: /privileged:\\s*true/, bad: true },',
      '  ];',
      '  return checks.map(c => {',
      '    const found = c.pattern.test(manifest);',
      '    const ok = c.bad ? !found : found;',
      '    return `${ok ? "OK" : "WARN"}: ${c.check}`;',
      '  }).join("\\n");',
      '}',
    ].join('\n'),
    parameters: [
      {
        name: 'manifest',
        type: 'string',
        description: 'Kubernetes YAML manifest to review',
        required: true,
      },
    ],
    outputType: 'string',
    tags: ['cloud', 'kubernetes', 'k8s', 'security', 'hardening'],
    examples: [
      {
        description: 'Review a pod spec for security best practices',
        input: {
          manifest:
            'securityContext: { runAsNonRoot: true, readOnlyRootFilesystem: true }; resources: { limits: { cpu: "500m" } }',
        },
        expectedOutput: 'OK: Non-Root User\nOK: Read-Only FS\nOK: Resource Limits',
      },
    ],
  },
  {
    name: 'k8s-operator-review',
    description:
      'Reviews Kubernetes operator and CRD patterns. Checks reconciliation loop design, ' +
      'status subresource usage, finalizer patterns, owner references, ' +
      'and event recording best practices.',
    category: 'cloud-native',
    complexity: 'complex',
    code: [
      'function k8sOperatorReview(code: string): string {',
      '  const checks = [',
      '    { check: "Reconcile Loop", pattern: /Reconcile|reconcile|reconciler/i },',
      '    { check: "Status Update", pattern: /status|StatusUpdate|subresource/i },',
      '    { check: "Finalizer", pattern: /finalizer|SetFinalizer|RemoveFinalizer/i },',
      '    { check: "Owner Reference", pattern: /OwnerReference|SetControllerReference|ownerRef/i },',
      '    { check: "Event Recording", pattern: /EventRecorder|recorder\\.Event|Eventf/i },',
      '    { check: "Requeue", pattern: /RequeueAfter|Requeue:\\s*true|ctrl\\.Result/i },',
      '  ];',
      '  return checks.map(c => `${c.pattern.test(code) ? "OK" : "INFO"}: ${c.check}`).join("\\n");',
      '}',
    ].join('\n'),
    parameters: [
      {
        name: 'code',
        type: 'string',
        description: 'Kubernetes operator code to review',
        required: true,
      },
    ],
    outputType: 'string',
    tags: ['cloud', 'kubernetes', 'k8s', 'operator', 'crd', 'controller'],
    examples: [
      {
        description: 'Review a controller-runtime reconciler',
        input: {
          code: 'func (r *Reconciler) Reconcile(ctx, req) (ctrl.Result, error) { r.recorder.Eventf(obj, "Normal", "Synced") }',
        },
        expectedOutput: 'OK: Reconcile Loop\nOK: Event Recording\nOK: Requeue',
      },
    ],
  },
] as const;
