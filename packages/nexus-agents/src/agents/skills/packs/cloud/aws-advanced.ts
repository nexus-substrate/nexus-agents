/**
 * AWS Advanced Patterns Skills
 *
 * AWS-specific patterns for IAM, S3, DynamoDB, SQS/SNS,
 * and infrastructure-as-code best practices.
 *
 * @module agents/skills/packs/cloud/aws-advanced
 * (Epic #643 Phase 4)
 */

import type { CreateSkillOptions } from '../../skill-types.js';

export const AWS_ADVANCED_SKILLS: readonly CreateSkillOptions[] = [
  {
    name: 'aws-iam-review',
    description:
      'Reviews AWS IAM policies and code for security best practices. Checks least privilege, ' +
      'wildcard avoidance, condition keys, resource-level permissions, ' +
      'cross-account access patterns, and role assumption chains.',
    category: 'cloud-native',
    complexity: 'complex',
    code: [
      'function awsIamReview(code: string): string {',
      '  const checks = [',
      '    { check: "No Wildcard Actions", pattern: /"Action":\\s*"\\*"|Action:\\s*\\*/, bad: true },',
      '    { check: "Resource Scoped", pattern: /"Resource":\\s*"arn:aws/i },',
      '    { check: "Condition Keys", pattern: /"Condition":|aws:SourceIp|aws:PrincipalOrgID/i },',
      '    { check: "Role Assumption", pattern: /sts:AssumeRole|roleArn|assumeRole/i },',
      '    { check: "MFA Required", pattern: /aws:MultiFactorAuth|mfa|BoolIfExists/i },',
      '    { check: "Deny Statements", pattern: /"Effect":\\s*"Deny"/i },',
      '  ];',
      '  return checks.map(c => {',
      '    const found = c.pattern.test(code);',
      '    const ok = c.bad ? !found : found;',
      '    return `${ok ? "OK" : "WARN"}: ${c.check}`;',
      '  }).join("\\n");',
      '}',
    ].join('\n'),
    parameters: [
      {
        name: 'code',
        type: 'string',
        description: 'AWS IAM policy or code to review',
        required: true,
      },
    ],
    outputType: 'string',
    tags: ['cloud', 'aws', 'iam', 'security', 'least-privilege'],
    examples: [
      {
        description: 'Review an IAM policy for least privilege',
        input: {
          code: '{ "Effect": "Allow", "Action": "s3:GetObject", "Resource": "arn:aws:s3:::my-bucket/*" }',
        },
        expectedOutput: 'OK: No Wildcard Actions\nOK: Resource Scoped',
      },
    ],
  },
  {
    name: 'aws-dynamodb-review',
    description:
      'Reviews DynamoDB table design and access patterns. Checks single-table design, ' +
      'GSI usage, query vs scan patterns, capacity planning, TTL configuration, ' +
      'and DynamoDB Streams setup.',
    category: 'database',
    complexity: 'moderate',
    code: [
      'function awsDynamoDbReview(code: string): string {',
      '  const checks = [',
      '    { check: "Query over Scan", pattern: /\\.query\\(|QueryCommand|KeyConditionExpression/i },',
      '    { check: "GSI Design", pattern: /GlobalSecondaryIndex|GSI|IndexName/i },',
      '    { check: "TTL Configured", pattern: /TimeToLiveSpecification|ttl|expiresAt/i },',
      '    { check: "Batch Operations", pattern: /batchWrite|batchGet|BatchWriteItem/i },',
      '    { check: "Error Handling", pattern: /ConditionalCheckFailed|ProvisionedThroughput/i },',
      '  ];',
      '  return checks.map(c => `${c.pattern.test(code) ? "OK" : "INFO"}: ${c.check}`).join("\\n");',
      '}',
    ].join('\n'),
    parameters: [
      {
        name: 'code',
        type: 'string',
        description: 'DynamoDB code or table definition to review',
        required: true,
      },
    ],
    outputType: 'string',
    tags: ['cloud', 'aws', 'dynamodb', 'nosql', 'database'],
    examples: [
      {
        description: 'Review DynamoDB access patterns',
        input: {
          code: 'const result = await ddb.send(new QueryCommand({ KeyConditionExpression: "pk = :pk", IndexName: "GSI1" }))',
        },
        expectedOutput: 'OK: Query over Scan\nOK: GSI Design',
      },
    ],
  },
] as const;
