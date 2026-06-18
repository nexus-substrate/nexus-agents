---
title: 'API: security'
description: Generated API reference for security.
tier: 2
---

# security

## Classes

### AuditTrail

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:193](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L193)

#### Constructors

##### Constructor

```ts
new AuditTrail(durableSink?): AuditTrail;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:197](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L197)

###### Parameters

###### durableSink?

`DurableAuditSink`

###### Returns

[`AuditTrail`](#audittrail)

#### Accessors

##### size

###### Get Signature

```ts
get size(): number;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:261](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L261)

Returns the total number of events.

###### Returns

`number`

#### Methods

##### append()

```ts
append(event): string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:200](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L200)

Appends an event to the trail. Returns the assigned event ID.

###### Parameters

###### event

`Omit`\<[`SecurityAuditEvent`](#securityauditevent), `"id"` \| `"timestamp"`\>

###### Returns

`string`

##### clear()

```ts
clear(): void;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:266](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L266)

Clears all events.

###### Returns

`void`

##### query()

```ts
query(filter?): readonly SecurityAuditEvent[];
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:225](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L225)

Queries events matching the given filter.

###### Parameters

###### filter?

[`SecurityAuditQuery`](#securityauditquery) = `{}`

###### Returns

readonly [`SecurityAuditEvent`](#securityauditevent)[]

---

### HostileInputFirewall

Defined in: [packages/nexus-agents/src/security/firewall/firewall-pipeline.ts:87](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/firewall/firewall-pipeline.ts#L87)

Orchestrates existing security modules into a configurable pipeline.
Each stage is independently toggleable via config.stages.

#### Constructors

##### Constructor

```ts
new HostileInputFirewall(config): HostileInputFirewall;
```

Defined in: [packages/nexus-agents/src/security/firewall/firewall-pipeline.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/firewall/firewall-pipeline.ts#L96)

###### Parameters

###### config

`FirewallConfig`

###### Returns

[`HostileInputFirewall`](#hostileinputfirewall)

#### Methods

##### getAuditTrail()

```ts
getAuditTrail(): AuditTrail;
```

Defined in: [packages/nexus-agents/src/security/firewall/firewall-pipeline.ts:180](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/firewall/firewall-pipeline.ts#L180)

Returns the internal audit trail for inspection.

###### Returns

[`AuditTrail`](#audittrail)

##### process()

```ts
process(input): Result<FirewallResult, FirewallError>;
```

Defined in: [packages/nexus-agents/src/security/firewall/firewall-pipeline.ts:120](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/firewall/firewall-pipeline.ts#L120)

Processes untrusted input through the firewall pipeline.
Returns a structured FirewallResult or a typed FirewallError.

###### Parameters

###### input

`unknown`

###### Returns

[`Result`](core.md#result)\<[`FirewallResult`](#firewallresult), `FirewallError`\>

---

### ReputationCache

Defined in: [packages/nexus-agents/src/security/reputation-model.ts:108](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/reputation-model.ts#L108)

In-memory reputation cache with TTL and max size.
Reduces redundant assessments for the same user within a short window.
Evicts oldest entries when max size is exceeded.

#### Constructors

##### Constructor

```ts
new ReputationCache(ttlMs?, maxSize?): ReputationCache;
```

Defined in: [packages/nexus-agents/src/security/reputation-model.ts:113](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/reputation-model.ts#L113)

###### Parameters

###### ttlMs?

`number` = `DEFAULT_TTL_MS`

###### maxSize?

`number` = `DEFAULT_MAX_SIZE`

###### Returns

[`ReputationCache`](#reputationcache)

#### Accessors

##### size

###### Get Signature

```ts
get size(): number;
```

Defined in: [packages/nexus-agents/src/security/reputation-model.ts:153](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/reputation-model.ts#L153)

###### Returns

`number`

#### Methods

##### clear()

```ts
clear(): void;
```

Defined in: [packages/nexus-agents/src/security/reputation-model.ts:149](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/reputation-model.ts#L149)

###### Returns

`void`

##### get()

```ts
get(username): ReputationAssessment | undefined;
```

Defined in: [packages/nexus-agents/src/security/reputation-model.ts:118](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/reputation-model.ts#L118)

###### Parameters

###### username

`string`

###### Returns

[`ReputationAssessment`](#reputationassessment) \| `undefined`

##### set()

```ts
set(username, assessment): void;
```

Defined in: [packages/nexus-agents/src/security/reputation-model.ts:128](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/reputation-model.ts#L128)

###### Parameters

###### username

`string`

###### assessment

[`ReputationAssessment`](#reputationassessment)

###### Returns

`void`

## Interfaces

### ActionContext

Defined in: [packages/nexus-agents/src/security/policy-gate.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/policy-gate.ts#L58)

Context for evaluating a policy decision.

#### Properties

##### existingLabels?

```ts
readonly optional existingLabels?: ReadonlySet<string>;
```

Defined in: [packages/nexus-agents/src/security/policy-gate.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/policy-gate.ts#L66)

Set of labels that exist on the repository (for ProposeLabels validation).

##### hasSecretAccess

```ts
readonly hasSecretAccess: boolean;
```

Defined in: [packages/nexus-agents/src/security/policy-gate.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/policy-gate.ts#L64)

Whether the agent currently has access to secrets/tokens.

##### hasWriteAccess

```ts
readonly hasWriteAccess: boolean;
```

Defined in: [packages/nexus-agents/src/security/policy-gate.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/policy-gate.ts#L62)

Whether the agent currently has write access to the repository.

##### inputTrustTier

```ts
readonly inputTrustTier: "1" | "2" | "3" | "4";
```

Defined in: [packages/nexus-agents/src/security/policy-gate.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/policy-gate.ts#L60)

Trust tier of the primary input source.

---

### ClassifyInput

Defined in: [packages/nexus-agents/src/security/trust-classifier.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/trust-classifier.ts#L52)

Input for trust classification.

#### Properties

##### authorAssociation

```ts
readonly authorAssociation: string;
```

Defined in: [packages/nexus-agents/src/security/trust-classifier.ts:56](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/trust-classifier.ts#L56)

GitHub API author_association value.

##### config?

```ts
readonly optional config?: Partial<{
  allowlistedMaintainers: string[];
  failOpen: boolean;
  maxInputLength: number;
}>;
```

Defined in: [packages/nexus-agents/src/security/trust-classifier.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/trust-classifier.ts#L60)

Sanitizer config (for allowlist check).

##### sanitizedInput?

```ts
readonly optional sanitizedInput?: {
  content: string;
  injectionFlags: (
     | "authority_claim"
     | "instruction_pattern"
     | "system_prompt_manipulation"
     | "hidden_content"
     | "urgency_manipulation"
     | "fake_conversation"
     | "base64_encoded"
    | "external_link_instruction")[];
  originalLength: number;
  sanitizedAt: string;
  strippedElements: {
     length: number;
     reason: string;
     startIndex: number;
     tag: string;
  }[];
  trustTier: "1" | "2" | "3" | "4";
  userRole:   | "unknown"
     | "owner"
     | "maintainer"
     | "collaborator"
     | "contributor"
     | "member";
  wasModified: boolean;
};
```

Defined in: [packages/nexus-agents/src/security/trust-classifier.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/trust-classifier.ts#L58)

Sanitized input (if content has already been through the sanitizer).

###### content

```ts
content: string;
```

Sanitized content with dangerous elements removed.

###### injectionFlags

```ts
injectionFlags: (
  | "authority_claim"
  | "instruction_pattern"
  | "system_prompt_manipulation"
  | "hidden_content"
  | "urgency_manipulation"
  | "fake_conversation"
  | "base64_encoded"
  | "external_link_instruction")[];
```

Injection patterns detected in content.

###### originalLength

```ts
originalLength: number;
```

Original content before sanitization (for audit).

###### sanitizedAt

```ts
sanitizedAt: string;
```

Timestamp of sanitization (ISO 8601).

###### strippedElements

```ts
strippedElements: {
  length: number;
  reason: string;
  startIndex: number;
  tag: string;
}
[];
```

Elements stripped during sanitization (audit trail).

###### trustTier

```ts
trustTier: "1" | "2" | "3" | "4" = TrustTierSchema;
```

Assigned trust tier based on user role and content analysis.

###### userRole

```ts
userRole:
  | "unknown"
  | "owner"
  | "maintainer"
  | "collaborator"
  | "contributor"
  | "member" = GitHubUserRoleSchema;
```

GitHub user role of the input source.

###### wasModified

```ts
wasModified: boolean;
```

Whether any dangerous content was detected and stripped.

##### username

```ts
readonly username: string;
```

Defined in: [packages/nexus-agents/src/security/trust-classifier.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/trust-classifier.ts#L54)

GitHub username.

---

### ClassifyResult

Defined in: [packages/nexus-agents/src/security/trust-classifier.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/trust-classifier.ts#L66)

Result of trust classification.

#### Properties

##### isAllowlisted

```ts
readonly isAllowlisted: boolean;
```

Defined in: [packages/nexus-agents/src/security/trust-classifier.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/trust-classifier.ts#L72)

Whether the user is on the maintainer allowlist.

##### reason

```ts
readonly reason: string;
```

Defined in: [packages/nexus-agents/src/security/trust-classifier.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/trust-classifier.ts#L76)

Reason for the assigned tier.

##### trustTier

```ts
readonly trustTier: "1" | "2" | "3" | "4";
```

Defined in: [packages/nexus-agents/src/security/trust-classifier.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/trust-classifier.ts#L68)

Assigned trust tier.

##### userRole

```ts
readonly userRole:
  | "unknown"
  | "owner"
  | "maintainer"
  | "collaborator"
  | "contributor"
  | "member";
```

Defined in: [packages/nexus-agents/src/security/trust-classifier.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/trust-classifier.ts#L70)

GitHub user role.

##### wasDowngraded

```ts
readonly wasDowngraded: boolean;
```

Defined in: [packages/nexus-agents/src/security/trust-classifier.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/trust-classifier.ts#L74)

Whether content triggered a trust downgrade.

---

### CorroborationEvent

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L98)

Corroboration validation result.

#### Extends

- `AuditEventBase`

#### Properties

##### actionType

```ts
readonly actionType:
  | "GeneratePatchPlan"
  | "DraftReply"
  | "ProposeLabels"
  | "SummarizeIssue"
  | "ClassifyIssue"
  | "IdentifyDuplicates"
  | "RequestHumanApproval"
  | "RefuseAction"
  | "HandoffMessage";
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L100)

##### component

```ts
readonly component: string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L42)

###### Inherited from

```ts
AuditEventBase.component;
```

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L40)

###### Inherited from

```ts
AuditEventBase.id;
```

##### missingRequirements

```ts
readonly missingRequirements: readonly string[];
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:103](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L103)

##### satisfied

```ts
readonly satisfied: boolean;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:101](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L101)

##### sourceCount

```ts
readonly sourceCount: number;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:102](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L102)

##### timestamp

```ts
readonly timestamp: string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L41)

###### Inherited from

```ts
AuditEventBase.timestamp;
```

##### type

```ts
readonly type: "corroboration";
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:99](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L99)

---

### CorroborationResult

Defined in: [packages/nexus-agents/src/security/corroboration-validator.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/corroboration-validator.ts#L26)

Result of corroboration validation.

#### Properties

##### actionType

```ts
readonly actionType:
  | "GeneratePatchPlan"
  | "DraftReply"
  | "ProposeLabels"
  | "SummarizeIssue"
  | "ClassifyIssue"
  | "IdentifyDuplicates"
  | "RequestHumanApproval"
  | "RefuseAction"
  | "HandoffMessage";
```

Defined in: [packages/nexus-agents/src/security/corroboration-validator.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/corroboration-validator.ts#L34)

Action type that was validated.

##### corroboratingSources

```ts
readonly corroboratingSources: readonly (
  | {
  commit?: string;
  line?: number;
  path: string;
  type: "repoFile";
}
  | {
  author: string;
  authorTrustTier: "1" | "2" | "3" | "4";
  commentId: number;
  issueNumber: number;
  type: "issueComment";
}
  | {
  job: string;
  runId: number;
  status: "pass" | "fail";
  type: "ciResult";
}
  | {
  path: string;
  section: string;
  type: "policyDoc";
}
  | {
  commentId: number;
  type: "maintainerCommand";
  username: string;
})[];
```

Defined in: [packages/nexus-agents/src/security/corroboration-validator.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/corroboration-validator.ts#L30)

Sources that contributed to corroboration.

##### missing

```ts
readonly missing: readonly string[];
```

Defined in: [packages/nexus-agents/src/security/corroboration-validator.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/corroboration-validator.ts#L32)

Missing corroboration requirements (empty when satisfied).

##### satisfied

```ts
readonly satisfied: boolean;
```

Defined in: [packages/nexus-agents/src/security/corroboration-validator.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/corroboration-validator.ts#L28)

Whether corroboration requirements are satisfied.

---

### CorroborationRule

Defined in: [packages/nexus-agents/src/security/corroboration-validator.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/corroboration-validator.ts#L40)

Rule defining what corroboration an action requires.

#### Properties

##### description

```ts
readonly description: string;
```

Defined in: [packages/nexus-agents/src/security/corroboration-validator.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/corroboration-validator.ts#L42)

Human-readable description of what's required.

##### isSatisfied

```ts
readonly isSatisfied: (sources) => boolean;
```

Defined in: [packages/nexus-agents/src/security/corroboration-validator.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/corroboration-validator.ts#L44)

Predicate: does this set of sources satisfy the requirement?

###### Parameters

###### sources

readonly (
\| \{
`commit?`: `string`;
`line?`: `number`;
`path`: `string`;
`type`: `"repoFile"`;
\}
\| \{
`author`: `string`;
`authorTrustTier`: `"1"` \| `"2"` \| `"3"` \| `"4"`;
`commentId`: `number`;
`issueNumber`: `number`;
`type`: `"issueComment"`;
\}
\| \{
`job`: `string`;
`runId`: `number`;
`status`: `"pass"` \| `"fail"`;
`type`: `"ciResult"`;
\}
\| \{
`path`: `string`;
`section`: `string`;
`type`: `"policyDoc"`;
\}
\| \{
`commentId`: `number`;
`type`: `"maintainerCommand"`;
`username`: `string`;
\})[]

###### Returns

`boolean`

---

### EvaluationCriterion

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L67)

Definition of an evaluation criterion for safety assessment.

#### Properties

##### categories?

```ts
readonly optional categories?: readonly string[];
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L81)

Categories for categorical type.

##### description

```ts
readonly description: string;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L73)

Detailed description of what the criterion measures.

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L69)

Unique criterion identifier.

##### name

```ts
readonly name: string;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L71)

Human-readable criterion name.

##### passThreshold?

```ts
readonly optional passThreshold?: number;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L79)

Threshold value for pass (for threshold type).

##### type

```ts
readonly type: CriterionTypeType;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L75)

Type of evaluation (binary, scaled, threshold, categorical).

##### weight

```ts
readonly weight: number;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L77)

Weight factor for scoring (0.0-1.0).

---

### FirewallResult

Defined in: [packages/nexus-agents/src/security/firewall/firewall-pipeline.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/firewall/firewall-pipeline.ts#L54)

Output of the firewall pipeline. Aggregates results from each stage.

#### Properties

##### atl

```ts
readonly atl: string;
```

Defined in: [packages/nexus-agents/src/security/firewall/firewall-pipeline.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/firewall/firewall-pipeline.ts#L66)

##### auditEvents

```ts
readonly auditEvents: readonly {
  id: string;
  type: string;
}[];
```

Defined in: [packages/nexus-agents/src/security/firewall/firewall-pipeline.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/firewall/firewall-pipeline.ts#L75)

##### durationMs

```ts
readonly durationMs: number;
```

Defined in: [packages/nexus-agents/src/security/firewall/firewall-pipeline.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/firewall/firewall-pipeline.ts#L76)

##### effectiveTrustTier

```ts
readonly effectiveTrustTier: "1" | "2" | "3" | "4";
```

Defined in: [packages/nexus-agents/src/security/firewall/firewall-pipeline.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/firewall/firewall-pipeline.ts#L65)

The tier consumers should ENFORCE on (#3106): the classifier tier
reconciled with the reputation assessment (demotion-only; Tier-1/allowlist
wins; equals `trust.trustTier` when reputation is absent). Previously the
reputation tier was computed but dropped — `trust.trustTier` alone left
reputation unenforced.

##### reputation?

```ts
readonly optional reputation?: ReputationAssessment;
```

Defined in: [packages/nexus-agents/src/security/firewall/firewall-pipeline.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/firewall/firewall-pipeline.ts#L57)

##### ruleOfTwoViolation?

```ts
readonly optional ruleOfTwoViolation?: {
  message: string;
  rule: string;
  severity: "warn" | "block";
};
```

Defined in: [packages/nexus-agents/src/security/firewall/firewall-pipeline.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/firewall/firewall-pipeline.ts#L74)

Rule-of-Two assessment surfaced by the `policyEnforcement` stage (#3198):
present (with `severity: 'block'`) when the effective tier is untrusted AND
the configured context has both write and secret access. The firewall is a
signal provider — it SURFACES this for the consumer to enforce; it does not
hard-block. `undefined` when the stage is disabled or the rule holds.

###### message

```ts
message: string;
```

Human-readable description of the violation.

###### rule

```ts
rule: string;
```

Machine-readable rule identifier.

###### severity

```ts
severity: 'warn' | 'block';
```

Severity: 'block' prevents execution, 'warn' logs only.

##### sanitized

```ts
readonly sanitized: {
  content: string;
  injectionFlags: (
     | "authority_claim"
     | "instruction_pattern"
     | "system_prompt_manipulation"
     | "hidden_content"
     | "urgency_manipulation"
     | "fake_conversation"
     | "base64_encoded"
    | "external_link_instruction")[];
  originalLength: number;
  sanitizedAt: string;
  strippedElements: {
     length: number;
     reason: string;
     startIndex: number;
     tag: string;
  }[];
  trustTier: "1" | "2" | "3" | "4";
  userRole:   | "unknown"
     | "owner"
     | "maintainer"
     | "collaborator"
     | "contributor"
     | "member";
  wasModified: boolean;
};
```

Defined in: [packages/nexus-agents/src/security/firewall/firewall-pipeline.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/firewall/firewall-pipeline.ts#L55)

###### content

```ts
content: string;
```

Sanitized content with dangerous elements removed.

###### injectionFlags

```ts
injectionFlags: (
  | "authority_claim"
  | "instruction_pattern"
  | "system_prompt_manipulation"
  | "hidden_content"
  | "urgency_manipulation"
  | "fake_conversation"
  | "base64_encoded"
  | "external_link_instruction")[];
```

Injection patterns detected in content.

###### originalLength

```ts
originalLength: number;
```

Original content before sanitization (for audit).

###### sanitizedAt

```ts
sanitizedAt: string;
```

Timestamp of sanitization (ISO 8601).

###### strippedElements

```ts
strippedElements: {
  length: number;
  reason: string;
  startIndex: number;
  tag: string;
}
[];
```

Elements stripped during sanitization (audit trail).

###### trustTier

```ts
trustTier: "1" | "2" | "3" | "4" = TrustTierSchema;
```

Assigned trust tier based on user role and content analysis.

###### userRole

```ts
userRole:
  | "unknown"
  | "owner"
  | "maintainer"
  | "collaborator"
  | "contributor"
  | "member" = GitHubUserRoleSchema;
```

GitHub user role of the input source.

###### wasModified

```ts
wasModified: boolean;
```

Whether any dangerous content was detected and stripped.

##### trust

```ts
readonly trust: ClassifyResult;
```

Defined in: [packages/nexus-agents/src/security/firewall/firewall-pipeline.ts:56](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/firewall/firewall-pipeline.ts#L56)

---

### GitHubUserMetadata

Defined in: [packages/nexus-agents/src/security/reputation-model.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/reputation-model.ts#L38)

GitHub user metadata for reputation assessment.

#### Properties

##### accountAgeDays?

```ts
readonly optional accountAgeDays?: number;
```

Defined in: [packages/nexus-agents/src/security/reputation-model.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/reputation-model.ts#L47)

Account/activity fields are OPTIONAL (#3106). When a field is absent (the
caller couldn't fetch it — e.g. the firewall before Phase 3 wiring), its
signal is SKIPPED rather than fabricated: an unknown value must never be
treated as benign (the old hardcoded `365`/`0`) nor as hostile. Only the
`authorAssociation` + `injectionFlags` signals fire on absent activity data.

##### authorAssociation

```ts
readonly authorAssociation: string;
```

Defined in: [packages/nexus-agents/src/security/reputation-model.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/reputation-model.ts#L51)

##### injectionFlags

```ts
readonly injectionFlags: readonly (
  | "authority_claim"
  | "instruction_pattern"
  | "system_prompt_manipulation"
  | "hidden_content"
  | "urgency_manipulation"
  | "fake_conversation"
  | "base64_encoded"
  | "external_link_instruction")[];
```

Defined in: [packages/nexus-agents/src/security/reputation-model.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/reputation-model.ts#L52)

##### priorContributions?

```ts
readonly optional priorContributions?: number;
```

Defined in: [packages/nexus-agents/src/security/reputation-model.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/reputation-model.ts#L48)

##### recentCommentCount?

```ts
readonly optional recentCommentCount?: number;
```

Defined in: [packages/nexus-agents/src/security/reputation-model.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/reputation-model.ts#L49)

##### recentCommentWindowMinutes?

```ts
readonly optional recentCommentWindowMinutes?: number;
```

Defined in: [packages/nexus-agents/src/security/reputation-model.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/reputation-model.ts#L50)

##### username

```ts
readonly username: string;
```

Defined in: [packages/nexus-agents/src/security/reputation-model.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/reputation-model.ts#L39)

---

### GraphExecutionAuditEvent

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:143](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L143)

Graph execution lifecycle event (Issue #839).

#### Extends

- `AuditEventBase`

#### Properties

##### component

```ts
readonly component: string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L42)

###### Inherited from

```ts
AuditEventBase.component;
```

##### detail

```ts
readonly detail: string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:148](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L148)

##### graphEvent

```ts
readonly graphEvent: string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:145](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L145)

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L40)

###### Inherited from

```ts
AuditEventBase.id;
```

##### nodeId?

```ts
readonly optional nodeId?: string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:146](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L146)

##### stepNumber

```ts
readonly stepNumber: number;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:147](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L147)

##### timestamp

```ts
readonly timestamp: string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L41)

###### Inherited from

```ts
AuditEventBase.timestamp;
```

##### type

```ts
readonly type: "graph_execution";
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:144](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L144)

---

### ISandboxExecutor

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:166](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L166)

Interface for sandbox executors.

#### Properties

##### name

```ts
readonly name: string;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:168](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L168)

Executor name for logging.

#### Methods

##### execute()

```ts
execute(
   command,
   args,
options): Promise<SandboxResult>;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:170](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L170)

Execute a command in the sandbox.

###### Parameters

###### command

`string`

###### args

readonly `string`[]

###### options

[`SandboxExecutionOptions`](#sandboxexecutionoptions)

###### Returns

`Promise`\<[`SandboxResult`](#sandboxresult)\>

##### validate()

```ts
validate(
   command,
   args,
   options): PolicyEvaluation;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:176](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L176)

Validate a command without executing.

###### Parameters

###### command

`string`

###### args

readonly `string`[]

###### options

[`SandboxExecutionOptions`](#sandboxexecutionoptions)

###### Returns

[`PolicyEvaluation`](#policyevaluation)

---

### PathAccessRule

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L65)

Path access rule for filesystem sandboxing.

#### Properties

##### access

```ts
readonly access: "none" | "write" | "read";
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L69)

Access mode: 'read' | 'write' | 'none'.

##### path

```ts
readonly path: string;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L67)

Path pattern (supports glob).

---

### PolicyEvaluation

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L97)

Result of sandbox policy evaluation.

#### Properties

##### allowed

```ts
readonly allowed: boolean;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:99](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L99)

Whether the operation is allowed.

##### configurationWarnings?

```ts
readonly optional configurationWarnings?: readonly string[];
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:112](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L112)

Configuration mismatches the executor surfaces to operators — capabilities
declared in the policy but unenforceable because the corresponding
allowlist is empty (e.g. `process_spawn` set but `allowedCommands: []`).
Source: #2428 ask 1. Not security violations; informational only.

##### policyId

```ts
readonly policyId: string;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:103](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L103)

Policy that was applied.

##### reason?

```ts
readonly optional reason?: string;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:101](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L101)

Denial reason if not allowed.

##### violations

```ts
readonly violations: readonly PolicyViolation[];
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L105)

Violations found.

---

### PolicyGateEvent

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L57)

Policy gate evaluation result.

#### Extends

- `AuditEventBase`

#### Properties

##### actionType?

```ts
readonly optional actionType?:
  | "GeneratePatchPlan"
  | "DraftReply"
  | "ProposeLabels"
  | "SummarizeIssue"
  | "ClassifyIssue"
  | "IdentifyDuplicates"
  | "RequestHumanApproval"
  | "RefuseAction"
  | "HandoffMessage";
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L66)

The agent action evaluated, for the security policy-gate path
(security/policy-gate.ts). Optional because the PIPELINE policy path
(pipeline/policy-evaluator.ts → #3710) records stage-boundary policy
decisions that have no `AgentAction` — they carry [stageType](#stagetype) +
[mode](#mode) + [ruleIds](#ruleids) instead. Security emitters always set it.

##### allowed

```ts
readonly allowed: boolean;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L67)

##### component

```ts
readonly component: string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L42)

###### Inherited from

```ts
AuditEventBase.component;
```

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L40)

###### Inherited from

```ts
AuditEventBase.id;
```

##### inputTrustTier

```ts
readonly inputTrustTier: "1" | "2" | "3" | "4";
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L69)

##### mode?

```ts
readonly optional mode?: "warn" | "off" | "block";
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L79)

Enforcement mode the decision was made under: `warn` (soak) or `block` (enforce).

##### recordKind?

```ts
readonly optional recordKind?: "summary" | "violation";
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:92](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L92)

#3727: discriminates a per-EVALUATION SUMMARY record (`'summary'` — emitted
once per pipeline policy evaluation INCLUDING clean ones, the DENOMINATOR for
the would-block rate) from a per-VIOLATION record (`'violation'` — the
existing #3710 per-violation records). Absent for the security policy-gate
path. Denominator = count(recordKind==='summary'); numerator = summaries with
`violationCount > 0`. Scope the #3710 count-parity assertion to `'violation'`.

##### requiresApproval

```ts
readonly requiresApproval: boolean;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L68)

##### ruleIds?

```ts
readonly optional ruleIds?: readonly string[];
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L81)

IDs of the policy rules that fired (mirrors `violationRules` for the pipeline path).

##### stageType?

```ts
readonly optional stageType?: string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:83](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L83)

Type of the stage the gate guarded (e.g. `execute`).

##### timestamp

```ts
readonly timestamp: string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L41)

###### Inherited from

```ts
AuditEventBase.timestamp;
```

##### type

```ts
readonly type: "policy_gate";
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L58)

##### violationCount?

```ts
readonly optional violationCount?: number;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L94)

#3727: number of violations in THIS evaluation (set on the summary record).

##### violationRules

```ts
readonly violationRules: readonly string[];
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L70)

---

### PolicyViolation

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:118](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L118)

A specific policy violation.

#### Properties

##### denied

```ts
readonly denied: string;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:122](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L122)

What was denied.

##### reason

```ts
readonly reason: string;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:124](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L124)

Explanation.

##### type

```ts
readonly type: "resource" | "path" | "env" | "capability" | "command";
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:120](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L120)

Type of violation.

---

### ReputationAssessment

Defined in: [packages/nexus-agents/src/security/reputation-model.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/reputation-model.ts#L58)

Result of a reputation assessment.

#### Properties

##### assessedAt

```ts
readonly assessedAt: string;
```

Defined in: [packages/nexus-agents/src/security/reputation-model.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/reputation-model.ts#L66)

##### effectiveTrustTier

```ts
readonly effectiveTrustTier: "1" | "2" | "3" | "4";
```

Defined in: [packages/nexus-agents/src/security/reputation-model.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/reputation-model.ts#L63)

##### isSuspicious

```ts
readonly isSuspicious: boolean;
```

Defined in: [packages/nexus-agents/src/security/reputation-model.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/reputation-model.ts#L62)

##### reason

```ts
readonly reason: string;
```

Defined in: [packages/nexus-agents/src/security/reputation-model.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/reputation-model.ts#L65)

##### reputationScore

```ts
readonly reputationScore: number;
```

Defined in: [packages/nexus-agents/src/security/reputation-model.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/reputation-model.ts#L64)

##### suspiciousSignals

```ts
readonly suspiciousSignals: readonly (
  | "new_account"
  | "no_prior_contributions"
  | "injection_patterns_detected"
  | "rapid_comments"
  | "mismatched_authority_claim")[];
```

Defined in: [packages/nexus-agents/src/security/reputation-model.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/reputation-model.ts#L61)

##### username

```ts
readonly username: string;
```

Defined in: [packages/nexus-agents/src/security/reputation-model.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/reputation-model.ts#L59)

##### userRole

```ts
readonly userRole:
  | "unknown"
  | "owner"
  | "maintainer"
  | "collaborator"
  | "contributor"
  | "member";
```

Defined in: [packages/nexus-agents/src/security/reputation-model.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/reputation-model.ts#L60)

---

### ReputationEvent

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:107](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L107)

Reputation assessment result.

#### Extends

- `AuditEventBase`

#### Properties

##### component

```ts
readonly component: string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L42)

###### Inherited from

```ts
AuditEventBase.component;
```

##### effectiveTier

```ts
readonly effectiveTier: "1" | "2" | "3" | "4";
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:112](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L112)

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L40)

###### Inherited from

```ts
AuditEventBase.id;
```

##### isSuspicious

```ts
readonly isSuspicious: boolean;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:111](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L111)

##### reputationScore

```ts
readonly reputationScore: number;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:110](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L110)

##### signalCount

```ts
readonly signalCount: number;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:113](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L113)

##### timestamp

```ts
readonly timestamp: string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L41)

###### Inherited from

```ts
AuditEventBase.timestamp;
```

##### type

```ts
readonly type: "reputation";
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:108](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L108)

##### username

```ts
readonly username: string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:109](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L109)

---

### ResourceLimits

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L38)

Resource limits for sandboxed execution.

#### Properties

##### maxCpuTimeMs?

```ts
readonly optional maxCpuTimeMs?: number;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L42)

Maximum CPU time in milliseconds.

##### maxMemoryBytes?

```ts
readonly optional maxMemoryBytes?: number;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L40)

Maximum memory in bytes (default: 512MB).

##### maxOutputBytes?

```ts
readonly optional maxOutputBytes?: number;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L46)

Maximum output buffer size in bytes.

##### maxProcesses?

```ts
readonly optional maxProcesses?: number;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L44)

Maximum number of child processes.

##### maxWallTimeMs?

```ts
readonly optional maxWallTimeMs?: number;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L48)

Maximum execution time in milliseconds.

---

### ResourceUsage

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:150](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L150)

Resource usage metrics from sandboxed execution.

#### Properties

##### cpuTimeMs

```ts
readonly cpuTimeMs: number;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:154](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L154)

CPU time used in milliseconds.

##### memoryBytes

```ts
readonly memoryBytes: number;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:152](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L152)

Memory used in bytes.

##### outputBytes

```ts
readonly outputBytes: number;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:158](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L158)

Output bytes generated.

##### processCount

```ts
readonly processCount: number;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:156](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L156)

Number of processes spawned.

##### wallTimeMs

```ts
readonly wallTimeMs: number;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:160](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L160)

Wall time in milliseconds.

---

### SafetyCategory

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:109](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L109)

Complete definition of a safety category.

#### Properties

##### criteria

```ts
readonly criteria: readonly EvaluationCriterion[];
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:121](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L121)

Evaluation criteria for this category.

##### defaultRiskLevel

```ts
readonly defaultRiskLevel: RiskLevelType;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:117](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L117)

Default risk level for violations in this category.

##### description

```ts
readonly description: string;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:115](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L115)

Detailed description of the category.

##### exampleTestCases

```ts
readonly exampleTestCases: readonly SafetyTestCase[];
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:123](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L123)

Example test cases demonstrating the category.

##### failureModes

```ts
readonly failureModes: readonly string[];
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:125](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L125)

Failure modes commonly seen in this category.

##### id

```ts
readonly id: SafetyCategoryIdType;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:111](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L111)

Unique category identifier.

##### mitigationStrategies

```ts
readonly mitigationStrategies: readonly string[];
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:127](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L127)

Mitigation strategies for this category.

##### name

```ts
readonly name: string;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:113](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L113)

Human-readable category name.

##### parentId?

```ts
readonly optional parentId?: SafetyCategoryIdType;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:119](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L119)

Parent category ID (for subcategories).

---

### SafetyTaxonomySummary

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:183](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L183)

Summary statistics for the safety category taxonomy.

#### Properties

##### categoriesByRiskLevel

```ts
readonly categoriesByRiskLevel: Readonly<Record<RiskLevelType, number>>;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:191](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L191)

Categories by risk level.

##### testCasesByOutcome

```ts
readonly testCasesByOutcome: Readonly<Record<ExpectedOutcomeType, number>>;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:193](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L193)

Test cases by expected outcome.

##### totalCategories

```ts
readonly totalCategories: number;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:185](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L185)

Total number of categories.

##### totalCriteria

```ts
readonly totalCriteria: number;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:187](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L187)

Total number of evaluation criteria.

##### totalTestCases

```ts
readonly totalTestCases: number;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:189](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L189)

Total number of example test cases.

---

### SafetyTestCase

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:87](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L87)

Example test case for safety evaluation.

#### Properties

##### context?

```ts
readonly optional context?: string;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:103](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L103)

Additional context or environment setup.

##### description

```ts
readonly description: string;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L93)

Detailed description of the test scenario.

##### expectedOutcome

```ts
readonly expectedOutcome: ExpectedOutcomeType;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L97)

Expected safe behavior outcome.

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:89](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L89)

Unique test case identifier.

##### input

```ts
readonly input: string;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L95)

Input prompt or scenario for the agent.

##### name

```ts
readonly name: string;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:91](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L91)

Test case name.

##### riskLevel

```ts
readonly riskLevel: RiskLevelType;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:99](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L99)

Risk level of the scenario.

##### tags

```ts
readonly tags: readonly string[];
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:101](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L101)

Tags for filtering and grouping.

---

### SandboxConfig

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:200](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L200)

Sandbox executor configuration.

#### Properties

##### defaultPolicy

```ts
readonly defaultPolicy: SandboxPolicy;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:202](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L202)

Default policy to use.

##### enforce

```ts
readonly enforce: boolean;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:206](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L206)

Whether to enforce policies (false = warn only).

##### logViolations

```ts
readonly logViolations: boolean;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:204](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L204)

Whether to log policy violations.

---

### SandboxExecutionOptions

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:186](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L186)

Options for sandboxed execution.

#### Properties

##### cwd?

```ts
readonly optional cwd?: string;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:188](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L188)

Working directory.

##### env?

```ts
readonly optional env?: Record<string, string>;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:190](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L190)

Environment variables (will be filtered by policy).

##### limits?

```ts
readonly optional limits?: Partial<ResourceLimits>;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:194](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L194)

Override resource limits.

##### policy

```ts
readonly policy: SandboxPolicy;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:192](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L192)

Policy to apply.

---

### SandboxPolicy

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L75)

Sandbox execution policy.

#### Properties

##### allowedCommands

```ts
readonly allowedCommands: readonly string[];
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:83](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L83)

Allowed commands (empty = all denied).

##### allowedEnvVars

```ts
readonly allowedEnvVars: readonly string[];
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:85](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L85)

Allowed environment variables to pass through.

##### capabilities

```ts
readonly capabilities: readonly SecurityCapability[];
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:89](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L89)

Enabled capabilities.

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L77)

Unique policy identifier.

##### limits

```ts
readonly limits: ResourceLimits;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:91](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L91)

Resource limits.

##### mode

```ts
readonly mode: SandboxMode;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L81)

Sandbox execution mode.

##### name

```ts
readonly name: string;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L79)

Human-readable policy name.

##### pathRules

```ts
readonly pathRules: readonly PathAccessRule[];
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:87](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L87)

Path access rules.

---

### SandboxResult

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:130](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L130)

Sandbox execution result.

#### Properties

##### durationMs

```ts
readonly durationMs: number;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:140](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L140)

Execution duration in milliseconds.

##### exitCode

```ts
readonly exitCode: number;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:134](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L134)

Exit code from the command.

##### policyEvaluation

```ts
readonly policyEvaluation: PolicyEvaluation;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:144](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L144)

Policy evaluation result.

##### resourceUsage

```ts
readonly resourceUsage: ResourceUsage;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:142](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L142)

Resource usage metrics.

##### stderr

```ts
readonly stderr: string;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:138](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L138)

Standard error.

##### stdout

```ts
readonly stdout: string;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:136](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L136)

Standard output.

##### success

```ts
readonly success: boolean;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:132](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L132)

Whether execution succeeded.

---

### SanitizationEvent

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:128](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L128)

Input sanitization result.

#### Extends

- `AuditEventBase`

#### Properties

##### component

```ts
readonly component: string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L42)

###### Inherited from

```ts
AuditEventBase.component;
```

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L40)

###### Inherited from

```ts
AuditEventBase.id;
```

##### injectionFlagCount

```ts
readonly injectionFlagCount: number;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:133](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L133)

##### source

```ts
readonly source: string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:130](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L130)

##### strippedCount

```ts
readonly strippedCount: number;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:132](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L132)

##### strippedElements

```ts
readonly strippedElements: readonly StrippedElementSummary[];
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:139](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L139)

Per-element tag/reason details, truncated to at most
MAX_STRIPPED_ELEMENTS_PER_EVENT entries. Required by CLAUDE.md's
Untrusted Input Policy: "Log stripped elements for audit trail."

##### timestamp

```ts
readonly timestamp: string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L41)

###### Inherited from

```ts
AuditEventBase.timestamp;
```

##### type

```ts
readonly type: "sanitization";
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:129](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L129)

##### wasModified

```ts
readonly wasModified: boolean;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:131](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L131)

---

### SecurityAuditQuery

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:163](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L163)

Query filter for retrieving audit events.

The post-mortem dimensions (#3197) — `actionType`, `actor`, `violationRule`
— NARROW to events that actually carry the field (events lacking it are
excluded), unlike `trustTier`'s legacy keep-non-applicable behavior. Only
dimensions backed by a real event field are offered: `resource` and
`policyName` from the original ask were dropped because no AuditEvent
records them (a filter with no backing field would be dead config); the
policy-rule intent is served by `violationRule` (PolicyGateEvent's
`violationRules`).

#### Properties

##### actionType?

```ts
readonly optional actionType?:
  | "GeneratePatchPlan"
  | "DraftReply"
  | "ProposeLabels"
  | "SummarizeIssue"
  | "ClassifyIssue"
  | "IdentifyDuplicates"
  | "RequestHumanApproval"
  | "RefuseAction"
  | "HandoffMessage";
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:169](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L169)

Match PolicyGate/Corroboration events by their `actionType`.

##### actor?

```ts
readonly optional actor?: string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:171](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L171)

Match Trust/Reputation events by `username` (the acting/assessed user).

##### limit?

```ts
readonly optional limit?: number;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:174](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L174)

##### since?

```ts
readonly optional since?: string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:165](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L165)

##### trustTier?

```ts
readonly optional trustTier?: "1" | "2" | "3" | "4";
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:167](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L167)

##### type?

```ts
readonly optional type?:
  | "trust_classification"
  | "policy_gate"
  | "corroboration"
  | "reputation"
  | "sanitization"
  | "graph_execution";
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:164](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L164)

##### until?

```ts
readonly optional until?: string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:166](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L166)

##### violationRule?

```ts
readonly optional violationRule?: string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:173](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L173)

Match PolicyGate events whose `violationRules` include this rule name.

---

### SecurityPolicyDecision

Defined in: [packages/nexus-agents/src/security/policy-gate.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/policy-gate.ts#L44)

Decision returned by the policy gate.

#### Properties

##### allowed

```ts
readonly allowed: boolean;
```

Defined in: [packages/nexus-agents/src/security/policy-gate.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/policy-gate.ts#L46)

Whether the action is allowed to proceed.

##### evaluatedAt

```ts
readonly evaluatedAt: string;
```

Defined in: [packages/nexus-agents/src/security/policy-gate.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/policy-gate.ts#L52)

Timestamp of the evaluation (ISO 8601).

##### requiresApproval

```ts
readonly requiresApproval: boolean;
```

Defined in: [packages/nexus-agents/src/security/policy-gate.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/policy-gate.ts#L48)

Whether human approval is required before execution.

##### violations

```ts
readonly violations: readonly {
  message: string;
  rule: string;
  severity: "warn" | "block";
}[];
```

Defined in: [packages/nexus-agents/src/security/policy-gate.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/policy-gate.ts#L50)

All detected violations (blocking and warnings).

---

### TrustClassificationEvent

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L46)

Trust classification decision.

#### Extends

- `AuditEventBase`

#### Properties

##### assignedTier

```ts
readonly assignedTier: "1" | "2" | "3" | "4";
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L49)

##### component

```ts
readonly component: string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L42)

###### Inherited from

```ts
AuditEventBase.component;
```

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L40)

###### Inherited from

```ts
AuditEventBase.id;
```

##### isAllowlisted

```ts
readonly isAllowlisted: boolean;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L51)

##### reason

```ts
readonly reason: string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L53)

##### timestamp

```ts
readonly timestamp: string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L41)

###### Inherited from

```ts
AuditEventBase.timestamp;
```

##### type

```ts
readonly type: "trust_classification";
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L47)

##### username

```ts
readonly username: string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L48)

##### userRole

```ts
readonly userRole: string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L50)

##### wasDowngraded

```ts
readonly wasDowngraded: boolean;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L52)

## Type Aliases

### ActionValidationResult

```ts
type ActionValidationResult =
  | {
      ok: true;
      value: AgentAction;
    }
  | {
      error: string;
      ok: false;
    };
```

Defined in: [packages/nexus-agents/src/security/action-schema.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/action-schema.ts#L23)

Validation result using the project Result pattern.

---

### AgentAction

```ts
type AgentAction = z.infer<typeof AgentActionSchema>;
```

Defined in: [packages/nexus-agents/src/security/action-schema.ts:192](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/action-schema.ts#L192)

Inferred TypeScript type for an agent action.

---

### AgentActionType

```ts
type AgentActionType = AgentAction['type'];
```

Defined in: [packages/nexus-agents/src/security/action-schema.ts:195](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/action-schema.ts#L195)

All valid action type discriminator values.

---

### CriterionTypeType

```ts
type CriterionTypeType = (typeof CriterionType)[keyof typeof CriterionType];
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-enums.ts:80](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-enums.ts#L80)

---

### ExpectedOutcomeType

```ts
type ExpectedOutcomeType = (typeof ExpectedOutcome)[keyof typeof ExpectedOutcome];
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-enums.ts:104](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-enums.ts#L104)

---

### GitHubInput

```ts
type GitHubInput = z.infer<typeof GitHubInputSchema>;
```

Defined in: [packages/nexus-agents/src/security/firewall/github-adapter.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/firewall/github-adapter.ts#L51)

---

### GitHubUserRole

```ts
type GitHubUserRole = z.infer<typeof GitHubUserRoleSchema>;
```

Defined in: [packages/nexus-agents/src/security/trust-types.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/trust-types.ts#L53)

---

### InjectionFlag

```ts
type InjectionFlag = z.infer<typeof InjectionFlagSchema>;
```

Defined in: [packages/nexus-agents/src/security/trust-types.ts:85](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/trust-types.ts#L85)

---

### RiskLevelType

```ts
type RiskLevelType = (typeof RiskLevel)[keyof typeof RiskLevel];
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-enums.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-enums.ts#L28)

---

### SafetyCategoryIdType

```ts
type SafetyCategoryIdType = (typeof SafetyCategoryId)[keyof typeof SafetyCategoryId];
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-enums.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-enums.ts#L60)

---

### SandboxMode

```ts
type SandboxMode = 'none' | 'policy' | 'container' | 'deno';
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L23)

Sandbox execution mode.

- `none`: no isolation; for development only.
- `policy`: rule-based enforcement with no process isolation. Catches
  policy violations but a misbehaving process can still touch the host.
- `container`: Docker-based OS-level isolation. Strongest, but requires
  Docker on the host.
- `deno`: process-level permission gating via Deno's `--allow-*` flags
  (#1898). Weaker than container — same OS, just process permissions —
  but works without Docker (Mac without Docker Desktop, locked-down CI
  runners). No CPU/memory limits.

---

### SanitizedInput

```ts
type SanitizedInput = z.infer<typeof SanitizedInputSchema>;
```

Defined in: [packages/nexus-agents/src/security/trust-types.ts:128](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/trust-types.ts#L128)

---

### SanitizerConfig

```ts
type SanitizerConfig = z.infer<typeof SanitizerConfigSchema>;
```

Defined in: [packages/nexus-agents/src/security/trust-types.ts:145](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/trust-types.ts#L145)

---

### SecurityAuditEvent

```ts
type SecurityAuditEvent =
  | TrustClassificationEvent
  | PolicyGateEvent
  | CorroborationEvent
  | ReputationEvent
  | SanitizationEvent
  | GraphExecutionAuditEvent;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L30)

Discriminated union of audit event types.
Each event captures a single security pipeline decision.

---

### SecurityCapability

```ts
type SecurityCapability =
  | 'network'
  | 'filesystem_read'
  | 'filesystem_write'
  | 'process_spawn'
  | 'env_access';
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L28)

Security capability that can be restricted.

---

### SourceCitation

```ts
type SourceCitation = z.infer<typeof SourceCitationSchema>;
```

Defined in: [packages/nexus-agents/src/security/action-schema.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/action-schema.ts#L86)

Inferred TypeScript type for a source citation.

---

### StrippedElement

```ts
type StrippedElement = z.infer<typeof StrippedElementSchema>;
```

Defined in: [packages/nexus-agents/src/security/trust-types.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/trust-types.ts#L100)

---

### SuspiciousSignal

```ts
type SuspiciousSignal = z.infer<typeof SuspiciousSignalSchema>;
```

Defined in: [packages/nexus-agents/src/security/reputation-model.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/reputation-model.ts#L33)

---

### TrustTier

```ts
type TrustTier = z.infer<typeof TrustTierSchema>;
```

Defined in: [packages/nexus-agents/src/security/trust-types.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/trust-types.ts#L28)

---

### Violation

```ts
type Violation = z.infer<typeof ViolationSchema>;
```

Defined in: [packages/nexus-agents/src/security/policy-gate.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/policy-gate.ts#L39)

## Variables

### AgentActionSchema

```ts
const AgentActionSchema: ZodDiscriminatedUnion<[ZodObject<{
  sources: ZodArray<ZodDiscriminatedUnion<[ZodObject<{
     commit: ZodOptional<ZodString>;
     line: ZodOptional<ZodNumber>;
     path: ZodString;
     type: ZodLiteral<"repoFile">;
   }, $strip>, ZodObject<{
     author: ZodString;
     authorTrustTier: ZodEnum<{
        1: ...;
        2: ...;
        3: ...;
        4: ...;
     }>;
     commentId: ZodNumber;
     issueNumber: ZodNumber;
     type: ZodLiteral<"issueComment">;
   }, $strip>, ZodObject<{
     job: ZodString;
     runId: ZodNumber;
     status: ZodEnum<{
        fail: ...;
        pass: ...;
     }>;
     type: ZodLiteral<"ciResult">;
   }, $strip>, ZodObject<{
     path: ZodString;
     section: ZodString;
     type: ZodLiteral<"policyDoc">;
   }, $strip>, ZodObject<{
     commentId: ZodNumber;
     type: ZodLiteral<"maintainerCommand">;
     username: ZodString;
  }, $strip>], "type">>;
  summary: ZodString;
  type: ZodLiteral<"SummarizeIssue">;
}, $strip>, ZodObject<{
  labels: ZodArray<ZodString>;
  reason: ZodString;
  sources: ZodArray<ZodDiscriminatedUnion<[ZodObject<{
     commit: ZodOptional<ZodString>;
     line: ZodOptional<ZodNumber>;
     path: ZodString;
     type: ZodLiteral<"repoFile">;
   }, $strip>, ZodObject<{
     author: ZodString;
     authorTrustTier: ZodEnum<{
        1: ...;
        2: ...;
        3: ...;
        4: ...;
     }>;
     commentId: ZodNumber;
     issueNumber: ZodNumber;
     type: ZodLiteral<"issueComment">;
   }, $strip>, ZodObject<{
     job: ZodString;
     runId: ZodNumber;
     status: ZodEnum<{
        fail: ...;
        pass: ...;
     }>;
     type: ZodLiteral<"ciResult">;
   }, $strip>, ZodObject<{
     path: ZodString;
     section: ZodString;
     type: ZodLiteral<"policyDoc">;
   }, $strip>, ZodObject<{
     commentId: ZodNumber;
     type: ZodLiteral<"maintainerCommand">;
     username: ZodString;
  }, $strip>], "type">>;
  type: ZodLiteral<"ProposeLabels">;
}, $strip>, ZodObject<{
  body: ZodString;
  requiresApproval: ZodLiteral<true>;
  sources: ZodArray<ZodDiscriminatedUnion<[ZodObject<{
     commit: ZodOptional<ZodString>;
     line: ZodOptional<ZodNumber>;
     path: ZodString;
     type: ZodLiteral<"repoFile">;
   }, $strip>, ZodObject<{
     author: ZodString;
     authorTrustTier: ZodEnum<{
        1: ...;
        2: ...;
        3: ...;
        4: ...;
     }>;
     commentId: ZodNumber;
     issueNumber: ZodNumber;
     type: ZodLiteral<"issueComment">;
   }, $strip>, ZodObject<{
     job: ZodString;
     runId: ZodNumber;
     status: ZodEnum<{
        fail: ...;
        pass: ...;
     }>;
     type: ZodLiteral<"ciResult">;
   }, $strip>, ZodObject<{
     path: ZodString;
     section: ZodString;
     type: ZodLiteral<"policyDoc">;
   }, $strip>, ZodObject<{
     commentId: ZodNumber;
     type: ZodLiteral<"maintainerCommand">;
     username: ZodString;
  }, $strip>], "type">>;
  type: ZodLiteral<"DraftReply">;
}, $strip>], "type">;
```

Defined in: [packages/nexus-agents/src/security/action-schema.ts:179](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/action-schema.ts#L179)

Discriminated union of all valid agent actions.
This is the ONLY schema agents may emit when processing untrusted input.

---

### ALLOWED_COMMANDS

```ts
const ALLOWED_COMMANDS: readonly string[];
```

Defined in: [packages/nexus-agents/src/security/sandbox/command-allowlist.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/command-allowlist.ts#L47)

Flat list of all allowed commands.

---

### BIAS_CATEGORY

```ts
const BIAS_CATEGORY: SafetyCategory;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-category-definitions.ts:327](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-category-definitions.ts#L327)

Bias Evaluation Category.

---

### CriterionType

```ts
const CriterionType: {
  BINARY: 'binary';
  CATEGORICAL: 'categorical';
  SCALED: 'scaled';
  THRESHOLD: 'threshold';
};
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-enums.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-enums.ts#L69)

Types of evaluation criteria for safety assessment.

#### Type Declaration

##### BINARY

```ts
readonly BINARY: "binary" = 'binary';
```

Binary pass/fail criterion.

##### CATEGORICAL

```ts
readonly CATEGORICAL: "categorical" = 'categorical';
```

Categorical classification criterion.

##### SCALED

```ts
readonly SCALED: "scaled" = 'scaled';
```

Scaled score criterion (0-100).

##### THRESHOLD

```ts
readonly THRESHOLD: "threshold" = 'threshold';
```

Threshold-based criterion.

---

### CriterionTypeSchema

```ts
const CriterionTypeSchema: ZodEnum<{
  binary: 'binary';
  categorical: 'categorical';
  scaled: 'scaled';
  threshold: 'threshold';
}>;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L46)

Zod schema for CriterionType validation.

---

### DECEPTION_CATEGORY

```ts
const DECEPTION_CATEGORY: SafetyCategory;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-category-definitions.ts:250](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-category-definitions.ts#L250)

Deception Detection Category.

---

### DEFAULT_POLICIES

```ts
const DEFAULT_POLICIES: Record<string, SandboxPolicy>;
```

Defined in: [packages/nexus-agents/src/security/sandbox/default-policies.ts:139](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/default-policies.ts#L139)

All default policies keyed by ID.

---

### DEFAULT_RESOURCE_LIMITS

```ts
const DEFAULT_RESOURCE_LIMITS: Required<ResourceLimits>;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-types.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-types.ts#L54)

Default resource limits.

---

### EvaluationCriterionSchema

```ts
const EvaluationCriterionSchema: ZodObject<
  {
    categories: ZodOptional<ZodReadonly<ZodArray<ZodString>>>;
    description: ZodString;
    id: ZodString;
    name: ZodString;
    passThreshold: ZodOptional<ZodNumber>;
    type: ZodEnum<{
      binary: 'binary';
      categorical: 'categorical';
      scaled: 'scaled';
      threshold: 'threshold';
    }>;
    weight: ZodNumber;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:137](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L137)

Zod schema for EvaluationCriterion validation.

---

### ExpectedOutcome

```ts
const ExpectedOutcome: {
  CAUTION: 'caution';
  CLARIFY: 'clarify';
  DETECT: 'detect';
  ESCALATE: 'escalate';
  PROCEED: 'proceed';
  REFUSE: 'refuse';
};
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-enums.ts:89](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-enums.ts#L89)

Expected outcome for a safety test case.

#### Type Declaration

##### CAUTION

```ts
readonly CAUTION: "caution" = 'caution';
```

Agent should proceed with caution/warning.

##### CLARIFY

```ts
readonly CLARIFY: "clarify" = 'clarify';
```

Agent should request clarification.

##### DETECT

```ts
readonly DETECT: "detect" = 'detect';
```

Agent should detect and report the issue.

##### ESCALATE

```ts
readonly ESCALATE: "escalate" = 'escalate';
```

Agent should escalate to human.

##### PROCEED

```ts
readonly PROCEED: "proceed" = 'proceed';
```

Agent should proceed normally.

##### REFUSE

```ts
readonly REFUSE: "refuse" = 'refuse';
```

Agent should refuse the action.

---

### ExpectedOutcomeSchema

```ts
const ExpectedOutcomeSchema: ZodEnum<{
  caution: 'caution';
  clarify: 'clarify';
  detect: 'detect';
  escalate: 'escalate';
  proceed: 'proceed';
  refuse: 'refuse';
}>;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L51)

Zod schema for ExpectedOutcome validation.

---

### GitHubUserRoleSchema

```ts
const GitHubUserRoleSchema: ZodEnum<{
  collaborator: 'collaborator';
  contributor: 'contributor';
  maintainer: 'maintainer';
  member: 'member';
  owner: 'owner';
  unknown: 'unknown';
}>;
```

Defined in: [packages/nexus-agents/src/security/trust-types.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/trust-types.ts#L45)

GitHub user relationship to the repository.

---

### HARM_EMOTIONAL_CATEGORY

```ts
const HARM_EMOTIONAL_CATEGORY: SafetyCategory;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-category-definitions.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-category-definitions.ts#L94)

Emotional/Psychological Harm Prevention Category.

---

### HARM_FINANCIAL_CATEGORY

```ts
const HARM_FINANCIAL_CATEGORY: SafetyCategory;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-category-definitions.ts:172](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-category-definitions.ts#L172)

Financial Harm Prevention Category.

---

### HARM_PHYSICAL_CATEGORY

```ts
const HARM_PHYSICAL_CATEGORY: SafetyCategory;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-category-definitions.ts:17](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-category-definitions.ts#L17)

Physical Harm Prevention Category.
Evaluates agent's ability to avoid actions that could cause physical harm.

---

### InjectionFlagSchema

```ts
const InjectionFlagSchema: ZodEnum<{
  authority_claim: 'authority_claim';
  base64_encoded: 'base64_encoded';
  external_link_instruction: 'external_link_instruction';
  fake_conversation: 'fake_conversation';
  hidden_content: 'hidden_content';
  instruction_pattern: 'instruction_pattern';
  system_prompt_manipulation: 'system_prompt_manipulation';
  urgency_manipulation: 'urgency_manipulation';
}>;
```

Defined in: [packages/nexus-agents/src/security/trust-types.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/trust-types.ts#L75)

Categories of injection patterns detected in content.

---

### INSTRUCTION_SAFETY_CATEGORY

```ts
const INSTRUCTION_SAFETY_CATEGORY: SafetyCategory;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-category-instruction.ts:16](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-category-instruction.ts#L16)

Instruction Following Safety Category.

---

### MANIPULATION_CATEGORY

```ts
const MANIPULATION_CATEGORY: SafetyCategory;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-category-manipulation.ts:16](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-category-manipulation.ts#L16)

Manipulation Resistance Category.

---

### PRIVACY_CATEGORY

```ts
const PRIVACY_CATEGORY: SafetyCategory;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-category-privacy.ts:16](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-category-privacy.ts#L16)

Privacy Protection Category.

---

### RISK_AWARENESS_CATEGORY

```ts
const RISK_AWARENESS_CATEGORY: SafetyCategory;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-category-risk.ts:16](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-category-risk.ts#L16)

Risk Awareness Category.

---

### RiskLevel

```ts
const RiskLevel: {
  CRITICAL: 'critical';
  HIGH: 'high';
  LOW: 'low';
  MEDIUM: 'medium';
};
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-enums.ts:17](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-enums.ts#L17)

Risk severity levels for safety categories.

#### Type Declaration

##### CRITICAL

```ts
readonly CRITICAL: "critical" = 'critical';
```

Critical risk - severe potential for harm, requires immediate attention.

##### HIGH

```ts
readonly HIGH: "high" = 'high';
```

High risk - significant potential for harm.

##### LOW

```ts
readonly LOW: "low" = 'low';
```

Low risk - minimal potential for harm.

##### MEDIUM

```ts
readonly MEDIUM: "medium" = 'medium';
```

Medium risk - moderate potential for harm.

---

### RiskLevelSchema

```ts
const RiskLevelSchema: ZodEnum<{
  critical: 'critical';
  high: 'high';
  low: 'low';
  medium: 'medium';
}>;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L25)

Zod schema for RiskLevel validation.

---

### ROBUSTNESS_CATEGORY

```ts
const ROBUSTNESS_CATEGORY: SafetyCategory;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-category-robustness.ts:16](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-category-robustness.ts#L16)

Robustness Category.

---

### ROLE_DEFAULT_TRUST

```ts
const ROLE_DEFAULT_TRUST: Record<GitHubUserRole, TrustTier>;
```

Defined in: [packages/nexus-agents/src/security/trust-types.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/trust-types.ts#L59)

Default trust tier mapping for each GitHub role.
Can be overridden by injection pattern detection (downgrade only).

---

### SAFETY_CATEGORIES

```ts
const SAFETY_CATEGORIES: readonly SafetyCategory[];
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-categories.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-categories.ts#L69)

Complete registry of all safety categories.

---

### SAFETY_CATEGORY_MAP

```ts
const SAFETY_CATEGORY_MAP: ReadonlyMap<SafetyCategoryIdType, SafetyCategory>;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-categories.ts:85](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-categories.ts#L85)

Map of category IDs to category definitions.

---

### SafetyCategoryId

```ts
const SafetyCategoryId: {
  BIAS: 'bias';
  DECEPTION: 'deception';
  HARM_EMOTIONAL: 'harm_emotional';
  HARM_FINANCIAL: 'harm_financial';
  HARM_PHYSICAL: 'harm_physical';
  INSTRUCTION_SAFETY: 'instruction_safety';
  MANIPULATION: 'manipulation';
  PRIVACY: 'privacy';
  RISK_AWARENESS: 'risk_awareness';
  ROBUSTNESS: 'robustness';
};
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-enums.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-enums.ts#L37)

Unique identifiers for safety categories.

#### Type Declaration

##### BIAS

```ts
readonly BIAS: "bias" = 'bias';
```

Bias evaluation and mitigation category.

##### DECEPTION

```ts
readonly DECEPTION: "deception" = 'deception';
```

Deception detection and prevention category.

##### HARM_EMOTIONAL

```ts
readonly HARM_EMOTIONAL: "harm_emotional" = 'harm_emotional';
```

Emotional/psychological harm prevention category.

##### HARM_FINANCIAL

```ts
readonly HARM_FINANCIAL: "harm_financial" = 'harm_financial';
```

Financial harm prevention category.

##### HARM_PHYSICAL

```ts
readonly HARM_PHYSICAL: "harm_physical" = 'harm_physical';
```

Physical harm prevention category.

##### INSTRUCTION_SAFETY

```ts
readonly INSTRUCTION_SAFETY: "instruction_safety" = 'instruction_safety';
```

Instruction following safety category.

##### MANIPULATION

```ts
readonly MANIPULATION: "manipulation" = 'manipulation';
```

Manipulation resistance category.

##### PRIVACY

```ts
readonly PRIVACY: "privacy" = 'privacy';
```

Privacy protection category.

##### RISK_AWARENESS

```ts
readonly RISK_AWARENESS: "risk_awareness" = 'risk_awareness';
```

Risk awareness and hazard recognition category.

##### ROBUSTNESS

```ts
readonly ROBUSTNESS: "robustness" = 'robustness';
```

Robustness to adversarial inputs category.

---

### SafetyCategoryIdSchema

```ts
const SafetyCategoryIdSchema: ZodEnum<{
  bias: 'bias';
  deception: 'deception';
  harm_emotional: 'harm_emotional';
  harm_financial: 'harm_financial';
  harm_physical: 'harm_physical';
  instruction_safety: 'instruction_safety';
  manipulation: 'manipulation';
  privacy: 'privacy';
  risk_awareness: 'risk_awareness';
  robustness: 'robustness';
}>;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L30)

Zod schema for SafetyCategoryId validation.

---

### SafetyCategorySchema

```ts
const SafetyCategorySchema: ZodObject<
  {
    criteria: ZodReadonly<
      ZodArray<
        ZodObject<
          {
            categories: ZodOptional<ZodReadonly<ZodArray<ZodString>>>;
            description: ZodString;
            id: ZodString;
            name: ZodString;
            passThreshold: ZodOptional<ZodNumber>;
            type: ZodEnum<{
              binary: 'binary';
              categorical: 'categorical';
              scaled: 'scaled';
              threshold: 'threshold';
            }>;
            weight: ZodNumber;
          },
          $strip
        >
      >
    >;
    defaultRiskLevel: ZodEnum<{
      critical: 'critical';
      high: 'high';
      low: 'low';
      medium: 'medium';
    }>;
    description: ZodString;
    exampleTestCases: ZodReadonly<
      ZodArray<
        ZodObject<
          {
            context: ZodOptional<ZodString>;
            description: ZodString;
            expectedOutcome: ZodEnum<{
              caution: 'caution';
              clarify: 'clarify';
              detect: 'detect';
              escalate: 'escalate';
              proceed: 'proceed';
              refuse: 'refuse';
            }>;
            id: ZodString;
            input: ZodString;
            name: ZodString;
            riskLevel: ZodEnum<{
              critical: 'critical';
              high: 'high';
              low: 'low';
              medium: 'medium';
            }>;
            tags: ZodReadonly<ZodArray<ZodString>>;
          },
          $strip
        >
      >
    >;
    failureModes: ZodReadonly<ZodArray<ZodString>>;
    id: ZodEnum<{
      bias: 'bias';
      deception: 'deception';
      harm_emotional: 'harm_emotional';
      harm_financial: 'harm_financial';
      harm_physical: 'harm_physical';
      instruction_safety: 'instruction_safety';
      manipulation: 'manipulation';
      privacy: 'privacy';
      risk_awareness: 'risk_awareness';
      robustness: 'robustness';
    }>;
    mitigationStrategies: ZodReadonly<ZodArray<ZodString>>;
    name: ZodString;
    parentId: ZodOptional<
      ZodEnum<{
        bias: 'bias';
        deception: 'deception';
        harm_emotional: 'harm_emotional';
        harm_financial: 'harm_financial';
        harm_physical: 'harm_physical';
        instruction_safety: 'instruction_safety';
        manipulation: 'manipulation';
        privacy: 'privacy';
        risk_awareness: 'risk_awareness';
        robustness: 'robustness';
      }>
    >;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:164](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L164)

Zod schema for SafetyCategory validation.

---

### SafetyTestCaseSchema

```ts
const SafetyTestCaseSchema: ZodObject<
  {
    context: ZodOptional<ZodString>;
    description: ZodString;
    expectedOutcome: ZodEnum<{
      caution: 'caution';
      clarify: 'clarify';
      detect: 'detect';
      escalate: 'escalate';
      proceed: 'proceed';
      refuse: 'refuse';
    }>;
    id: ZodString;
    input: ZodString;
    name: ZodString;
    riskLevel: ZodEnum<{
      critical: 'critical';
      high: 'high';
      low: 'low';
      medium: 'medium';
    }>;
    tags: ZodReadonly<ZodArray<ZodString>>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-schemas.ts:150](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-schemas.ts#L150)

Zod schema for SafetyTestCase validation.

---

### SanitizedInputSchema

```ts
const SanitizedInputSchema: ZodObject<
  {
    content: ZodString;
    injectionFlags: ZodArray<
      ZodEnum<{
        authority_claim: 'authority_claim';
        base64_encoded: 'base64_encoded';
        external_link_instruction: 'external_link_instruction';
        fake_conversation: 'fake_conversation';
        hidden_content: 'hidden_content';
        instruction_pattern: 'instruction_pattern';
        system_prompt_manipulation: 'system_prompt_manipulation';
        urgency_manipulation: 'urgency_manipulation';
      }>
    >;
    originalLength: ZodNumber;
    sanitizedAt: ZodISODateTime;
    strippedElements: ZodArray<
      ZodObject<
        {
          length: ZodNumber;
          reason: ZodString;
          startIndex: ZodNumber;
          tag: ZodString;
        },
        $strip
      >
    >;
    trustTier: ZodEnum<{
      1: '1';
      2: '2';
      3: '3';
      4: '4';
    }>;
    userRole: ZodEnum<{
      collaborator: 'collaborator';
      contributor: 'contributor';
      maintainer: 'maintainer';
      member: 'member';
      owner: 'owner';
      unknown: 'unknown';
    }>;
    wasModified: ZodBoolean;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/security/trust-types.ts:110](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/trust-types.ts#L110)

The result of sanitizing untrusted input.
Contains cleaned content, trust classification, and audit data.

---

### SanitizerConfigSchema

```ts
const SanitizerConfigSchema: ZodObject<
  {
    allowlistedMaintainers: ZodDefault<ZodArray<ZodString>>;
    failOpen: ZodDefault<ZodBoolean>;
    maxInputLength: ZodDefault<ZodNumber>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/security/trust-types.ts:137](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/trust-types.ts#L137)

Configuration for the input sanitizer.

---

### SourceCitationSchema

```ts
const SourceCitationSchema: ZodDiscriminatedUnion<
  [
    ZodObject<
      {
        commit: ZodOptional<ZodString>;
        line: ZodOptional<ZodNumber>;
        path: ZodString;
        type: ZodLiteral<'repoFile'>;
      },
      $strip
    >,
    ZodObject<
      {
        author: ZodString;
        authorTrustTier: ZodEnum<{
          1: '1';
          2: '2';
          3: '3';
          4: '4';
        }>;
        commentId: ZodNumber;
        issueNumber: ZodNumber;
        type: ZodLiteral<'issueComment'>;
      },
      $strip
    >,
    ZodObject<
      {
        job: ZodString;
        runId: ZodNumber;
        status: ZodEnum<{
          fail: 'fail';
          pass: 'pass';
        }>;
        type: ZodLiteral<'ciResult'>;
      },
      $strip
    >,
    ZodObject<
      {
        path: ZodString;
        section: ZodString;
        type: ZodLiteral<'policyDoc'>;
      },
      $strip
    >,
    ZodObject<
      {
        commentId: ZodNumber;
        type: ZodLiteral<'maintainerCommand'>;
        username: ZodString;
      },
      $strip
    >,
  ],
  'type'
>;
```

Defined in: [packages/nexus-agents/src/security/action-schema.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/action-schema.ts#L77)

Discriminated union of all valid source citation types.
Every decision-making action MUST cite at least one source.

---

### StrippedElementSchema

```ts
const StrippedElementSchema: ZodObject<
  {
    length: ZodNumber;
    reason: ZodString;
    startIndex: ZodNumber;
    tag: ZodString;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/security/trust-types.ts:90](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/trust-types.ts#L90)

An element stripped during sanitization, preserved for audit trail.

---

### SuspiciousSignalSchema

```ts
const SuspiciousSignalSchema: ZodEnum<{
  injection_patterns_detected: 'injection_patterns_detected';
  mismatched_authority_claim: 'mismatched_authority_claim';
  new_account: 'new_account';
  no_prior_contributions: 'no_prior_contributions';
  rapid_comments: 'rapid_comments';
}>;
```

Defined in: [packages/nexus-agents/src/security/reputation-model.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/reputation-model.ts#L26)

Signals that indicate a suspicious actor.

---

### TRUST_TIER_NUMERIC

```ts
const TRUST_TIER_NUMERIC: Record<TrustTier, number>;
```

Defined in: [packages/nexus-agents/src/security/trust-types.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/trust-types.ts#L31)

Numeric trust tier for comparisons. Higher number = lower trust.

---

### TrustTierSchema

```ts
const TrustTierSchema: ZodEnum<{
  1: '1';
  2: '2';
  3: '3';
  4: '4';
}>;
```

Defined in: [packages/nexus-agents/src/security/trust-types.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/trust-types.ts#L27)

Trust tier classification for input sources.
Lower number = higher trust.

1 = Authoritative (repo files, CI, CLAUDE.md, allowlisted maintainers)
2 = Semi-trusted (collaborator issue body, contributor PR metadata)
3 = Untrusted (unknown user comments, non-collaborator issue body)
4 = Hostile (injection patterns, hidden HTML, instruction-like content)

---

### ViolationSchema

```ts
const ViolationSchema: ZodObject<
  {
    message: ZodString;
    rule: ZodString;
    severity: ZodEnum<{
      block: 'block';
      warn: 'warn';
    }>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/security/policy-gate.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/policy-gate.ts#L31)

Violation detected by the policy gate.

## Functions

### assessReputation()

```ts
function assessReputation(metadata, cache?): ReputationAssessment;
```

Defined in: [packages/nexus-agents/src/security/reputation-model.ts:310](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/reputation-model.ts#L310)

Assess a GitHub user's reputation for trust classification.

#### Parameters

##### metadata

[`GitHubUserMetadata`](#githubusermetadata)

User metadata from GitHub API or local context.

##### cache?

[`ReputationCache`](#reputationcache)

Optional cache instance for TTL-based deduplication.

#### Returns

[`ReputationAssessment`](#reputationassessment)

ReputationAssessment with trust tier and suspicious signals.

---

### canInfluenceDecisions()

```ts
function canInfluenceDecisions(tier): boolean;
```

Defined in: [packages/nexus-agents/src/security/trust-classifier.ts:142](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/trust-classifier.ts#L142)

Checks whether a trust tier can influence agent decisions.
Tiers 3-4 are informational only — they cannot drive actions.

#### Parameters

##### tier

`"1"` \| `"2"` \| `"3"` \| `"4"`

#### Returns

`boolean`

---

### canProceed()

```ts
function canProceed(actionType, inputTrustTier): boolean;
```

Defined in: [packages/nexus-agents/src/security/policy-gate.ts:250](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/policy-gate.ts#L250)

Quick check: can this action type proceed at all given the input trust tier?
Useful for early rejection before full policy evaluation.

#### Parameters

##### actionType

\| `"GeneratePatchPlan"`
\| `"DraftReply"`
\| `"ProposeLabels"`
\| `"SummarizeIssue"`
\| `"ClassifyIssue"`
\| `"IdentifyDuplicates"`
\| `"RequestHumanApproval"`
\| `"RefuseAction"`
\| `"HandoffMessage"`

##### inputTrustTier

`"1"` \| `"2"` \| `"3"` \| `"4"`

#### Returns

`boolean`

---

### classifyTrust()

```ts
function classifyTrust(input): ClassifyResult;
```

Defined in: [packages/nexus-agents/src/security/trust-classifier.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/trust-classifier.ts#L96)

Classifies a GitHub user and their content into a trust tier.

The trust tier is determined by:

1. Allowlist membership (always Tier 1)
2. GitHub author_association → role → default tier
3. Content injection analysis (can only downgrade, never upgrade)

⚠ **Use HostileInputFirewall.process() in agent code paths.** Calling
classifyTrust() directly skips the Rule-of-Two check in policy-gate
and does not emit audit-trail events. The firewall is the canonical
entry point for agent decisions; direct use is for unit tests and
non-decision analysis only.

#### Parameters

##### input

[`ClassifyInput`](#classifyinput)

#### Returns

[`ClassifyResult`](#classifyresult)

#### See

- packages/nexus-agents/src/security/firewall/firewall-pipeline.ts
- packages/nexus-agents/src/security/policy-gate.ts

---

### createAuditTrail()

```ts
function createAuditTrail(durableSink?): AuditTrail;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:520](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L520)

Creates a new AuditTrail instance. Pass a DurableAuditSink (e.g. from
`createDurableAuditSink(auditLogger)`) to mirror appended security decisions
to a durable, hash-chained store (#3291). Default: in-memory only.

#### Parameters

##### durableSink?

`DurableAuditSink`

#### Returns

[`AuditTrail`](#audittrail)

---

### createGitHubAdapter()

```ts
function createGitHubAdapter(): ISourceAdapter;
```

Defined in: [packages/nexus-agents/src/security/firewall/github-adapter.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/firewall/github-adapter.ts#L79)

Creates a GitHub source adapter.
Validates input with Zod and maps GitHub API fields to SourceMetadata.

#### Returns

`ISourceAdapter`

---

### createGraphAuditBridge()

```ts
function createGraphAuditBridge(trail): (event) => void;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:477](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L477)

Creates an onEvent callback that bridges graph events to the audit trail.
Pass the returned function as `onEvent` in GraphExecuteOptions.

#### Parameters

##### trail

[`AuditTrail`](#audittrail)

#### Returns

(`event`) => `void`

#### Example

```ts
const trail = createAuditTrail();
await executeGraph(graph, inputs, { onEvent: createGraphAuditBridge(trail) });
```

---

### createSandboxExecutor()

```ts
function createSandboxExecutor(config?): ISandboxExecutor;
```

Defined in: [packages/nexus-agents/src/security/sandbox/sandbox-executor.ts:385](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/sandbox-executor.ts#L385)

Create a sandbox executor with optional config.

Since #2551 this returns the single surviving in-process executor
(`PolicySandboxExecutor`). The Docker/Deno executors were deleted as
unused; real isolation is provided out-of-process by the OpenCode
sandbox bootstrap (#2500).

#### Parameters

##### config?

`Partial`\<[`SandboxConfig`](#sandboxconfig)\>

#### Returns

[`ISandboxExecutor`](#isandboxexecutor)

---

### emitCorroborationEvent()

```ts
function emitCorroborationEvent(trail, data): string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:416](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L416)

Records a corroboration validation.

#### Parameters

##### trail

[`AuditTrail`](#audittrail)

##### data

`Omit`\<[`CorroborationEvent`](#corroborationevent), `"id"` \| `"timestamp"` \| `"type"` \| `"component"`\>

#### Returns

`string`

---

### emitGraphExecutionEvent()

```ts
function emitGraphExecutionEvent(trail, data): string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:458](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L458)

Records a graph execution lifecycle event.

#### Parameters

##### trail

[`AuditTrail`](#audittrail)

##### data

`Omit`\<[`GraphExecutionAuditEvent`](#graphexecutionauditevent), `"id"` \| `"timestamp"` \| `"type"` \| `"component"`\>

#### Returns

`string`

---

### emitPolicyEvent()

```ts
function emitPolicyEvent(trail, data): string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:354](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L354)

Records a policy gate evaluation.

#### Parameters

##### trail

[`AuditTrail`](#audittrail)

##### data

`Omit`\<[`PolicyGateEvent`](#policygateevent), `"id"` \| `"timestamp"` \| `"type"` \| `"component"`\>

#### Returns

`string`

---

### emitReputationEvent()

```ts
function emitReputationEvent(trail, data): string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:430](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L430)

Records a reputation assessment.

#### Parameters

##### trail

[`AuditTrail`](#audittrail)

##### data

`Omit`\<[`ReputationEvent`](#reputationevent), `"id"` \| `"timestamp"` \| `"type"` \| `"component"`\>

#### Returns

`string`

---

### emitSanitizationEvent()

```ts
function emitSanitizationEvent(trail, data): string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:444](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L444)

Records an input sanitization result.

#### Parameters

##### trail

[`AuditTrail`](#audittrail)

##### data

`Omit`\<[`SanitizationEvent`](#sanitizationevent), `"id"` \| `"timestamp"` \| `"type"` \| `"component"`\>

#### Returns

`string`

---

### emitTrustEvent()

```ts
function emitTrustEvent(trail, data): string;
```

Defined in: [packages/nexus-agents/src/security/audit-trail.ts:340](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/audit-trail.ts#L340)

Records a trust classification decision.

#### Parameters

##### trail

[`AuditTrail`](#audittrail)

##### data

`Omit`\<[`TrustClassificationEvent`](#trustclassificationevent), `"id"` \| `"timestamp"` \| `"type"` \| `"component"`\>

#### Returns

`string`

---

### evaluateSecurityPolicy()

```ts
function evaluateSecurityPolicy(action, context, auditTrail?): SecurityPolicyDecision;
```

Defined in: [packages/nexus-agents/src/security/policy-gate.ts:198](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/policy-gate.ts#L198)

Evaluate an agent action against the policy gate.

This is a deterministic check — no LLM in the loop. Returns a
PolicyDecision indicating whether the action is allowed, requires
human approval, or is blocked.

#### Parameters

##### action

\| \{
`sources`: (
\| \{
`commit?`: `string`;
`line?`: `number`;
`path`: `string`;
`type`: `"repoFile"`;
\}
\| \{
`author`: `string`;
`authorTrustTier`: `"1"` \| `"2"` \| `"3"` \| `"4"`;
`commentId`: `number`;
`issueNumber`: `number`;
`type`: `"issueComment"`;
\}
\| \{
`job`: `string`;
`runId`: `number`;
`status`: `"pass"` \| `"fail"`;
`type`: `"ciResult"`;
\}
\| \{
`path`: `string`;
`section`: `string`;
`type`: `"policyDoc"`;
\}
\| \{
`commentId`: `number`;
`type`: `"maintainerCommand"`;
`username`: `string`;
\})[];
`summary`: `string`;
`type`: `"SummarizeIssue"`;
\}
\| \{
`labels`: `string`[];
`reason`: `string`;
`sources`: (
\| \{
`commit?`: `string`;
`line?`: `number`;
`path`: `string`;
`type`: `"repoFile"`;
\}
\| \{
`author`: `string`;
`authorTrustTier`: `"1"` \| `"2"` \| `"3"` \| `"4"`;
`commentId`: `number`;
`issueNumber`: `number`;
`type`: `"issueComment"`;
\}
\| \{
`job`: `string`;
`runId`: `number`;
`status`: `"pass"` \| `"fail"`;
`type`: `"ciResult"`;
\}
\| \{
`path`: `string`;
`section`: `string`;
`type`: `"policyDoc"`;
\}
\| \{
`commentId`: `number`;
`type`: `"maintainerCommand"`;
`username`: `string`;
\})[];
`type`: `"ProposeLabels"`;
\}
\| \{
`body`: `string`;
`requiresApproval`: `true`;
`sources`: (
\| \{
`commit?`: `string`;
`line?`: `number`;
`path`: `string`;
`type`: `"repoFile"`;
\}
\| \{
`author`: `string`;
`authorTrustTier`: `"1"` \| `"2"` \| `"3"` \| `"4"`;
`commentId`: `number`;
`issueNumber`: `number`;
`type`: `"issueComment"`;
\}
\| \{
`job`: `string`;
`runId`: `number`;
`status`: `"pass"` \| `"fail"`;
`type`: `"ciResult"`;
\}
\| \{
`path`: `string`;
`section`: `string`;
`type`: `"policyDoc"`;
\}
\| \{
`commentId`: `number`;
`type`: `"maintainerCommand"`;
`username`: `string`;
\})[];
`type`: `"DraftReply"`;
\}
\| \{
`context`: `string`;
`reason`: `string`;
`type`: `"RequestHumanApproval"`;
\}
\| \{
`files`: \{
`description`: `string`;
`operation`: `"create"` \| `"delete"` \| `"modify"`;
`path`: `string`;
\}[];
`rationale`: `string`;
`requiresApproval`: `true`;
`sources`: (
\| \{
`commit?`: `string`;
`line?`: `number`;
`path`: `string`;
`type`: `"repoFile"`;
\}
\| \{
`author`: `string`;
`authorTrustTier`: `"1"` \| `"2"` \| `"3"` \| `"4"`;
`commentId`: `number`;
`issueNumber`: `number`;
`type`: `"issueComment"`;
\}
\| \{
`job`: `string`;
`runId`: `number`;
`status`: `"pass"` \| `"fail"`;
`type`: `"ciResult"`;
\}
\| \{
`path`: `string`;
`section`: `string`;
`type`: `"policyDoc"`;
\}
\| \{
`commentId`: `number`;
`type`: `"maintainerCommand"`;
`username`: `string`;
\})[];
`type`: `"GeneratePatchPlan"`;
\}
\| \{
`category`: \| `"security"`
\| `"documentation"`
\| `"question"`
\| `"performance"`
\| `"bug"`
\| `"feature"`;
`confidence`: `number`;
`sources`: (
\| \{
`commit?`: `string`;
`line?`: `number`;
`path`: `string`;
`type`: `"repoFile"`;
\}
\| \{
`author`: `string`;
`authorTrustTier`: `"1"` \| `"2"` \| `"3"` \| `"4"`;
`commentId`: `number`;
`issueNumber`: `number`;
`type`: `"issueComment"`;
\}
\| \{
`job`: `string`;
`runId`: `number`;
`status`: `"pass"` \| `"fail"`;
`type`: `"ciResult"`;
\}
\| \{
`path`: `string`;
`section`: `string`;
`type`: `"policyDoc"`;
\}
\| \{
`commentId`: `number`;
`type`: `"maintainerCommand"`;
`username`: `string`;
\})[];
`type`: `"ClassifyIssue"`;
\}
\| \{
`candidates`: `number`[];
`similarity`: `number`[];
`sources`: (
\| \{
`commit?`: `string`;
`line?`: `number`;
`path`: `string`;
`type`: `"repoFile"`;
\}
\| \{
`author`: `string`;
`authorTrustTier`: `"1"` \| `"2"` \| `"3"` \| `"4"`;
`commentId`: `number`;
`issueNumber`: `number`;
`type`: `"issueComment"`;
\}
\| \{
`job`: `string`;
`runId`: `number`;
`status`: `"pass"` \| `"fail"`;
`type`: `"ciResult"`;
\}
\| \{
`path`: `string`;
`section`: `string`;
`type`: `"policyDoc"`;
\}
\| \{
`commentId`: `number`;
`type`: `"maintainerCommand"`;
`username`: `string`;
\})[];
`type`: `"IdentifyDuplicates"`;
\}
\| \{
`escalateTo`: `"security"` \| `"maintainer"`;
`reason`: `string`;
`type`: `"RefuseAction"`;
\}
\| \{
`inputTrustTier`: `"1"` \| `"2"` \| `"3"` \| `"4"`;
`reason`: `string`;
`sources`: (
\| \{
`commit?`: `string`;
`line?`: `number`;
`path`: `string`;
`type`: `"repoFile"`;
\}
\| \{
`author`: `string`;
`authorTrustTier`: `"1"` \| `"2"` \| `"3"` \| `"4"`;
`commentId`: `number`;
`issueNumber`: `number`;
`type`: `"issueComment"`;
\}
\| \{
`job`: `string`;
`runId`: `number`;
`status`: `"pass"` \| `"fail"`;
`type`: `"ciResult"`;
\}
\| \{
`path`: `string`;
`section`: `string`;
`type`: `"policyDoc"`;
\}
\| \{
`commentId`: `number`;
`type`: `"maintainerCommand"`;
`username`: `string`;
\})[];
`targetCapability`: `string`;
`type`: `"HandoffMessage"`;
\}

The validated AgentAction to evaluate.

##### context

[`ActionContext`](#actioncontext)

The current execution context.

##### auditTrail?

[`AuditTrail`](#audittrail)

#### Returns

[`SecurityPolicyDecision`](#securitypolicydecision)

PolicyDecision with violations and approval requirements.

---

### generateATL()

```ts
function generateATL(data): string;
```

Defined in: [packages/nexus-agents/src/security/firewall/agent-trust-labels.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/firewall/agent-trust-labels.ts#L29)

Generates an Agent Trust Label string from structured data.

#### Parameters

##### data

###### rep?

`number` = `...`

###### sanitized

`boolean` = `...`

###### source

`string` = `...`

###### tier

`"1"` \| `"2"` \| `"3"` \| `"4"` = `...`

###### user

`string` = `...`

#### Returns

`string`

#### Example

```ts
generateATL({ tier: '3', source: 'github-comment', user: 'octocat', sanitized: true });
// => "[ATL:tier=3,source=github-comment,user=octocat,sanitized=true]"
```

---

### getAllTestCases()

```ts
function getAllTestCases(): readonly SafetyTestCase &
  {
    categoryId: SafetyCategoryIdType;
  }[];
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-categories.ts:123](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-categories.ts#L123)

Get all test cases across all categories.

#### Returns

readonly [`SafetyTestCase`](#safetytestcase) & \{
`categoryId`: [`SafetyCategoryIdType`](#safetycategoryidtype);
\}[]

Array of all test cases with their category IDs

---

### getCategoriesByMinRiskLevel()

```ts
function getCategoriesByMinRiskLevel(minLevel): readonly SafetyCategory[];
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-categories.ts:107](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-categories.ts#L107)

Get all categories at or above a given risk level.

#### Parameters

##### minLevel

[`RiskLevelType`](#riskleveltype)

Minimum risk level to include

#### Returns

readonly [`SafetyCategory`](#safetycategory)[]

Array of categories matching the risk level criteria

---

### getCorroborationRules()

```ts
function getCorroborationRules(actionType): readonly CorroborationRule[];
```

Defined in: [packages/nexus-agents/src/security/corroboration-validator.ts:209](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/corroboration-validator.ts#L209)

Get the corroboration rules for an action type.
Useful for displaying requirements to users.

#### Parameters

##### actionType

\| `"GeneratePatchPlan"`
\| `"DraftReply"`
\| `"ProposeLabels"`
\| `"SummarizeIssue"`
\| `"ClassifyIssue"`
\| `"IdentifyDuplicates"`
\| `"RequestHumanApproval"`
\| `"RefuseAction"`
\| `"HandoffMessage"`

#### Returns

readonly [`CorroborationRule`](#corroborationrule)[]

---

### getPolicy()

```ts
function getPolicy(id): SandboxPolicy | undefined;
```

Defined in: [packages/nexus-agents/src/security/sandbox/default-policies.ts:150](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/default-policies.ts#L150)

Get a policy by ID.

#### Parameters

##### id

`string`

#### Returns

[`SandboxPolicy`](#sandboxpolicy) \| `undefined`

---

### getRequiredTrustTier()

```ts
function getRequiredTrustTier(actionType): '1' | '2' | '3' | '4';
```

Defined in: [packages/nexus-agents/src/security/trust-classifier.ts:158](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/trust-classifier.ts#L158)

Returns the minimum trust tier required for a given action type.
Actions that modify state require higher trust.

#### Parameters

##### actionType

`string`

#### Returns

`"1"` \| `"2"` \| `"3"` \| `"4"`

---

### getSafetyCategory()

```ts
function getSafetyCategory(id): SafetyCategory | undefined;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-categories.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-categories.ts#L98)

Get a safety category by ID.

#### Parameters

##### id

[`SafetyCategoryIdType`](#safetycategoryidtype)

Category identifier

#### Returns

[`SafetyCategory`](#safetycategory) \| `undefined`

The category definition or undefined if not found

---

### getSafetyTaxonomySummary()

```ts
function getSafetyTaxonomySummary(): SafetyTaxonomySummary;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-categories.ts:191](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-categories.ts#L191)

Get summary statistics for the safety taxonomy.

#### Returns

[`SafetyTaxonomySummary`](#safetytaxonomysummary)

Summary statistics object

---

### getTestCasesByTags()

```ts
function getTestCasesByTags(tags): readonly SafetyTestCase &
  {
    categoryId: SafetyCategoryIdType;
  }[];
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-categories.ts:139](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-categories.ts#L139)

Get test cases filtered by tags.

#### Parameters

##### tags

readonly `string`[]

Tags to filter by (any match)

#### Returns

readonly [`SafetyTestCase`](#safetytestcase) & \{
`categoryId`: [`SafetyCategoryIdType`](#safetycategoryidtype);
\}[]

Array of matching test cases

---

### isMutatingAction()

```ts
function isMutatingAction(actionType): boolean;
```

Defined in: [packages/nexus-agents/src/security/action-schema.ts:275](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/action-schema.ts#L275)

Check whether an action type can modify GitHub state.
Mutating actions always require human approval before execution.

#### Parameters

##### actionType

\| `"GeneratePatchPlan"`
\| `"DraftReply"`
\| `"ProposeLabels"`
\| `"SummarizeIssue"`
\| `"ClassifyIssue"`
\| `"IdentifyDuplicates"`
\| `"RequestHumanApproval"`
\| `"RefuseAction"`
\| `"HandoffMessage"`

The action type discriminator value.

#### Returns

`boolean`

True if the action can modify state.

---

### isReadOnlyAction()

```ts
function isReadOnlyAction(actionType): boolean;
```

Defined in: [packages/nexus-agents/src/security/action-schema.ts:264](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/action-schema.ts#L264)

Check whether an action type is read-only (does not modify GitHub state).

#### Parameters

##### actionType

\| `"GeneratePatchPlan"`
\| `"DraftReply"`
\| `"ProposeLabels"`
\| `"SummarizeIssue"`
\| `"ClassifyIssue"`
\| `"IdentifyDuplicates"`
\| `"RequestHumanApproval"`
\| `"RefuseAction"`
\| `"HandoffMessage"`

The action type discriminator value.

#### Returns

`boolean`

True if the action is read-only.

---

### mapAuthorAssociation()

```ts
function mapAuthorAssociation(
  association
): 'unknown' | 'owner' | 'maintainer' | 'collaborator' | 'contributor' | 'member';
```

Defined in: [packages/nexus-agents/src/security/trust-classifier.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/trust-classifier.ts#L24)

Maps GitHub API author_association values to our GitHubUserRole enum.
See: https://docs.github.com/en/graphql/reference/enums#commentauthorassociation

#### Parameters

##### association

`string`

#### Returns

\| `"unknown"`
\| `"owner"`
\| `"maintainer"`
\| `"collaborator"`
\| `"contributor"`
\| `"member"`

---

### parseATL()

```ts
function parseATL(atl):
  | {
      rep?: number;
      sanitized: boolean;
      source: string;
      tier: '1' | '2' | '3' | '4';
      user: string;
    }
  | undefined;
```

Defined in: [packages/nexus-agents/src/security/firewall/agent-trust-labels.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/firewall/agent-trust-labels.ts#L49)

Parses an ATL string back into structured data.
Returns undefined if the string is not a valid ATL.

#### Parameters

##### atl

`string`

#### Returns

\| \{
`rep?`: `number`;
`sanitized`: `boolean`;
`source`: `string`;
`tier`: `"1"` \| `"2"` \| `"3"` \| `"4"`;
`user`: `string`;
\}
\| `undefined`

---

### requiresCitation()

```ts
function requiresCitation(actionType): boolean;
```

Defined in: [packages/nexus-agents/src/security/action-schema.ts:286](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/action-schema.ts#L286)

Check whether an action type requires at least one source citation.
Escalation (RequestHumanApproval) and refusal (RefuseAction) are exempt.

#### Parameters

##### actionType

\| `"GeneratePatchPlan"`
\| `"DraftReply"`
\| `"ProposeLabels"`
\| `"SummarizeIssue"`
\| `"ClassifyIssue"`
\| `"IdentifyDuplicates"`
\| `"RequestHumanApproval"`
\| `"RefuseAction"`
\| `"HandoffMessage"`

The action type discriminator value.

#### Returns

`boolean`

True if the action must include source citations.

---

### requiresCorroboration()

```ts
function requiresCorroboration(tier): boolean;
```

Defined in: [packages/nexus-agents/src/security/trust-classifier.ts:150](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/trust-classifier.ts#L150)

Checks whether a trust tier requires corroboration with Tier 1 sources.
Tier 2 requires corroboration; Tier 1 is self-sufficient.

#### Parameters

##### tier

`"1"` \| `"2"` \| `"3"` \| `"4"`

#### Returns

`boolean`

---

### sanitizeInput()

```ts
function sanitizeInput(
  content,
  userRole,
  username,
  config?
): {
  content: string;
  injectionFlags: (
    | 'authority_claim'
    | 'instruction_pattern'
    | 'system_prompt_manipulation'
    | 'hidden_content'
    | 'urgency_manipulation'
    | 'fake_conversation'
    | 'base64_encoded'
    | 'external_link_instruction'
  )[];
  originalLength: number;
  sanitizedAt: string;
  strippedElements: {
    length: number;
    reason: string;
    startIndex: number;
    tag: string;
  }[];
  trustTier: '1' | '2' | '3' | '4';
  userRole: 'unknown' | 'owner' | 'maintainer' | 'collaborator' | 'contributor' | 'member';
  wasModified: boolean;
};
```

Defined in: [packages/nexus-agents/src/security/input-sanitizer.ts:396](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/input-sanitizer.ts#L396)

Sanitizes untrusted GitHub input through the full Layer 1 pipeline:

1. HTML stripping (picture/source/img tags)
2. XML tag stripping (system/human/assistant)
3. HTML comment stripping (instruction-bearing comments only)
4. Injection pattern detection
5. Trust tier assignment

⚠ **Use HostileInputFirewall.process() in agent code paths.** Calling
sanitizeInput() directly only runs Layer 1 — it does not evaluate the
Rule of Two (enforced in policy-gate.ts via evaluatePolicy) and does
not emit audit-trail events. An agent that processes untrusted input
while holding both write access and secrets violates the Rule of Two;
the policy gate is what catches this, and it only runs inside the
firewall pipeline. Direct use of this function is appropriate for
unit tests and pure content analysis, not for agent decision paths.

#### Parameters

##### content

`string`

Raw untrusted content from GitHub

##### userRole

\| `"unknown"`
\| `"owner"`
\| `"maintainer"`
\| `"collaborator"`
\| `"contributor"`
\| `"member"`

GitHub user's relationship to the repository

##### username

`string`

GitHub username (for allowlist check)

##### config?

`Partial`\<\{
`allowlistedMaintainers`: `string`[];
`failOpen`: `boolean`;
`maxInputLength`: `number`;
\}\>

Optional sanitizer configuration

#### Returns

SanitizedInput with cleaned content and audit data

##### content

```ts
content: string;
```

Sanitized content with dangerous elements removed.

##### injectionFlags

```ts
injectionFlags: (
  | "authority_claim"
  | "instruction_pattern"
  | "system_prompt_manipulation"
  | "hidden_content"
  | "urgency_manipulation"
  | "fake_conversation"
  | "base64_encoded"
  | "external_link_instruction")[];
```

Injection patterns detected in content.

##### originalLength

```ts
originalLength: number;
```

Original content before sanitization (for audit).

##### sanitizedAt

```ts
sanitizedAt: string;
```

Timestamp of sanitization (ISO 8601).

##### strippedElements

```ts
strippedElements: {
  length: number;
  reason: string;
  startIndex: number;
  tag: string;
}
[];
```

Elements stripped during sanitization (audit trail).

##### trustTier

```ts
trustTier: "1" | "2" | "3" | "4" = TrustTierSchema;
```

Assigned trust tier based on user role and content analysis.

##### userRole

```ts
userRole:
  | "unknown"
  | "owner"
  | "maintainer"
  | "collaborator"
  | "contributor"
  | "member" = GitHubUserRoleSchema;
```

GitHub user role of the input source.

##### wasModified

```ts
wasModified: boolean;
```

Whether any dangerous content was detected and stripped.

#### See

- packages/nexus-agents/src/security/firewall/firewall-pipeline.ts
- packages/nexus-agents/src/security/policy-gate.ts

---

### validateAgentAction()

```ts
function validateAgentAction(input): ActionValidationResult;
```

Defined in: [packages/nexus-agents/src/security/action-schema.ts:249](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/action-schema.ts#L249)

Validate an unknown value against the AgentActionSchema.
Returns a Result: `{ ok: true; value }` on success or `{ ok: false; error }` on failure.

#### Parameters

##### input

`unknown`

The value to validate (typically parsed JSON from an agent).

#### Returns

[`ActionValidationResult`](#actionvalidationresult)

Validation result following the project Result pattern.

---

### validateCommand()

```ts
function validateCommand(command, allowedCommands): PolicyViolation | null;
```

Defined in: [packages/nexus-agents/src/security/sandbox/command-allowlist.ts:104](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/sandbox/command-allowlist.ts#L104)

Validates a command name against the allowlist.

#### Parameters

##### command

`string`

##### allowedCommands

readonly `string`[]

#### Returns

[`PolicyViolation`](#policyviolation) \| `null`

---

### validateCorroboration()

```ts
function validateCorroboration(action): CorroborationResult;
```

Defined in: [packages/nexus-agents/src/security/corroboration-validator.ts:169](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/corroboration-validator.ts#L169)

Validate that an agent action has sufficient corroboration from
authoritative sources.

#### Parameters

##### action

\| \{
`sources`: (
\| \{
`commit?`: `string`;
`line?`: `number`;
`path`: `string`;
`type`: `"repoFile"`;
\}
\| \{
`author`: `string`;
`authorTrustTier`: `"1"` \| `"2"` \| `"3"` \| `"4"`;
`commentId`: `number`;
`issueNumber`: `number`;
`type`: `"issueComment"`;
\}
\| \{
`job`: `string`;
`runId`: `number`;
`status`: `"pass"` \| `"fail"`;
`type`: `"ciResult"`;
\}
\| \{
`path`: `string`;
`section`: `string`;
`type`: `"policyDoc"`;
\}
\| \{
`commentId`: `number`;
`type`: `"maintainerCommand"`;
`username`: `string`;
\})[];
`summary`: `string`;
`type`: `"SummarizeIssue"`;
\}
\| \{
`labels`: `string`[];
`reason`: `string`;
`sources`: (
\| \{
`commit?`: `string`;
`line?`: `number`;
`path`: `string`;
`type`: `"repoFile"`;
\}
\| \{
`author`: `string`;
`authorTrustTier`: `"1"` \| `"2"` \| `"3"` \| `"4"`;
`commentId`: `number`;
`issueNumber`: `number`;
`type`: `"issueComment"`;
\}
\| \{
`job`: `string`;
`runId`: `number`;
`status`: `"pass"` \| `"fail"`;
`type`: `"ciResult"`;
\}
\| \{
`path`: `string`;
`section`: `string`;
`type`: `"policyDoc"`;
\}
\| \{
`commentId`: `number`;
`type`: `"maintainerCommand"`;
`username`: `string`;
\})[];
`type`: `"ProposeLabels"`;
\}
\| \{
`body`: `string`;
`requiresApproval`: `true`;
`sources`: (
\| \{
`commit?`: `string`;
`line?`: `number`;
`path`: `string`;
`type`: `"repoFile"`;
\}
\| \{
`author`: `string`;
`authorTrustTier`: `"1"` \| `"2"` \| `"3"` \| `"4"`;
`commentId`: `number`;
`issueNumber`: `number`;
`type`: `"issueComment"`;
\}
\| \{
`job`: `string`;
`runId`: `number`;
`status`: `"pass"` \| `"fail"`;
`type`: `"ciResult"`;
\}
\| \{
`path`: `string`;
`section`: `string`;
`type`: `"policyDoc"`;
\}
\| \{
`commentId`: `number`;
`type`: `"maintainerCommand"`;
`username`: `string`;
\})[];
`type`: `"DraftReply"`;
\}
\| \{
`context`: `string`;
`reason`: `string`;
`type`: `"RequestHumanApproval"`;
\}
\| \{
`files`: \{
`description`: `string`;
`operation`: `"create"` \| `"delete"` \| `"modify"`;
`path`: `string`;
\}[];
`rationale`: `string`;
`requiresApproval`: `true`;
`sources`: (
\| \{
`commit?`: `string`;
`line?`: `number`;
`path`: `string`;
`type`: `"repoFile"`;
\}
\| \{
`author`: `string`;
`authorTrustTier`: `"1"` \| `"2"` \| `"3"` \| `"4"`;
`commentId`: `number`;
`issueNumber`: `number`;
`type`: `"issueComment"`;
\}
\| \{
`job`: `string`;
`runId`: `number`;
`status`: `"pass"` \| `"fail"`;
`type`: `"ciResult"`;
\}
\| \{
`path`: `string`;
`section`: `string`;
`type`: `"policyDoc"`;
\}
\| \{
`commentId`: `number`;
`type`: `"maintainerCommand"`;
`username`: `string`;
\})[];
`type`: `"GeneratePatchPlan"`;
\}
\| \{
`category`: \| `"security"`
\| `"documentation"`
\| `"question"`
\| `"performance"`
\| `"bug"`
\| `"feature"`;
`confidence`: `number`;
`sources`: (
\| \{
`commit?`: `string`;
`line?`: `number`;
`path`: `string`;
`type`: `"repoFile"`;
\}
\| \{
`author`: `string`;
`authorTrustTier`: `"1"` \| `"2"` \| `"3"` \| `"4"`;
`commentId`: `number`;
`issueNumber`: `number`;
`type`: `"issueComment"`;
\}
\| \{
`job`: `string`;
`runId`: `number`;
`status`: `"pass"` \| `"fail"`;
`type`: `"ciResult"`;
\}
\| \{
`path`: `string`;
`section`: `string`;
`type`: `"policyDoc"`;
\}
\| \{
`commentId`: `number`;
`type`: `"maintainerCommand"`;
`username`: `string`;
\})[];
`type`: `"ClassifyIssue"`;
\}
\| \{
`candidates`: `number`[];
`similarity`: `number`[];
`sources`: (
\| \{
`commit?`: `string`;
`line?`: `number`;
`path`: `string`;
`type`: `"repoFile"`;
\}
\| \{
`author`: `string`;
`authorTrustTier`: `"1"` \| `"2"` \| `"3"` \| `"4"`;
`commentId`: `number`;
`issueNumber`: `number`;
`type`: `"issueComment"`;
\}
\| \{
`job`: `string`;
`runId`: `number`;
`status`: `"pass"` \| `"fail"`;
`type`: `"ciResult"`;
\}
\| \{
`path`: `string`;
`section`: `string`;
`type`: `"policyDoc"`;
\}
\| \{
`commentId`: `number`;
`type`: `"maintainerCommand"`;
`username`: `string`;
\})[];
`type`: `"IdentifyDuplicates"`;
\}
\| \{
`escalateTo`: `"security"` \| `"maintainer"`;
`reason`: `string`;
`type`: `"RefuseAction"`;
\}
\| \{
`inputTrustTier`: `"1"` \| `"2"` \| `"3"` \| `"4"`;
`reason`: `string`;
`sources`: (
\| \{
`commit?`: `string`;
`line?`: `number`;
`path`: `string`;
`type`: `"repoFile"`;
\}
\| \{
`author`: `string`;
`authorTrustTier`: `"1"` \| `"2"` \| `"3"` \| `"4"`;
`commentId`: `number`;
`issueNumber`: `number`;
`type`: `"issueComment"`;
\}
\| \{
`job`: `string`;
`runId`: `number`;
`status`: `"pass"` \| `"fail"`;
`type`: `"ciResult"`;
\}
\| \{
`path`: `string`;
`section`: `string`;
`type`: `"policyDoc"`;
\}
\| \{
`commentId`: `number`;
`type`: `"maintainerCommand"`;
`username`: `string`;
\})[];
`targetCapability`: `string`;
`type`: `"HandoffMessage"`;
\}

The validated AgentAction to check.

#### Returns

[`CorroborationResult`](#corroborationresult)

CorroborationResult indicating whether requirements are met.

---

### validateEvaluationCriterion()

```ts
function validateEvaluationCriterion(criterion): ZodSafeParseResult<{
  categories?: readonly string[];
  description: string;
  id: string;
  name: string;
  passThreshold?: number;
  type: 'binary' | 'threshold' | 'scaled' | 'categorical';
  weight: number;
}>;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-categories.ts:177](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-categories.ts#L177)

Validate an evaluation criterion definition.

#### Parameters

##### criterion

`unknown`

Criterion to validate

#### Returns

`ZodSafeParseResult`\<\{
`categories?`: readonly `string`[];
`description`: `string`;
`id`: `string`;
`name`: `string`;
`passThreshold?`: `number`;
`type`: `"binary"` \| `"threshold"` \| `"scaled"` \| `"categorical"`;
`weight`: `number`;
\}\>

Validation result with inferred schema type

---

### validateSafetyCategory()

```ts
function validateSafetyCategory(category): ZodSafeParseResult<{
  criteria: readonly {
    categories?: readonly string[];
    description: string;
    id: string;
    name: string;
    passThreshold?: number;
    type: 'binary' | 'threshold' | 'scaled' | 'categorical';
    weight: number;
  }[];
  defaultRiskLevel: 'critical' | 'high' | 'low' | 'medium';
  description: string;
  exampleTestCases: readonly {
    context?: string;
    description: string;
    expectedOutcome: 'escalate' | 'refuse' | 'caution' | 'clarify' | 'proceed' | 'detect';
    id: string;
    input: string;
    name: string;
    riskLevel: 'critical' | 'high' | 'low' | 'medium';
    tags: readonly string[];
  }[];
  failureModes: readonly string[];
  id:
    | 'harm_physical'
    | 'harm_emotional'
    | 'harm_financial'
    | 'deception'
    | 'bias'
    | 'privacy'
    | 'manipulation'
    | 'instruction_safety'
    | 'robustness'
    | 'risk_awareness';
  mitigationStrategies: readonly string[];
  name: string;
  parentId?:
    | 'harm_physical'
    | 'harm_emotional'
    | 'harm_financial'
    | 'deception'
    | 'bias'
    | 'privacy'
    | 'manipulation'
    | 'instruction_safety'
    | 'robustness'
    | 'risk_awareness';
}>;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-categories.ts:155](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-categories.ts#L155)

Validate a safety category definition.

#### Parameters

##### category

`unknown`

Category to validate

#### Returns

`ZodSafeParseResult`\<\{
`criteria`: readonly \{
`categories?`: readonly `string`[];
`description`: `string`;
`id`: `string`;
`name`: `string`;
`passThreshold?`: `number`;
`type`: `"binary"` \| `"threshold"` \| `"scaled"` \| `"categorical"`;
`weight`: `number`;
\}[];
`defaultRiskLevel`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`description`: `string`;
`exampleTestCases`: readonly \{
`context?`: `string`;
`description`: `string`;
`expectedOutcome`: `"escalate"` \| `"refuse"` \| `"caution"` \| `"clarify"` \| `"proceed"` \| `"detect"`;
`id`: `string`;
`input`: `string`;
`name`: `string`;
`riskLevel`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`tags`: readonly `string`[];
\}[];
`failureModes`: readonly `string`[];
`id`: \| `"harm_physical"`
\| `"harm_emotional"`
\| `"harm_financial"`
\| `"deception"`
\| `"bias"`
\| `"privacy"`
\| `"manipulation"`
\| `"instruction_safety"`
\| `"robustness"`
\| `"risk_awareness"`;
`mitigationStrategies`: readonly `string`[];
`name`: `string`;
`parentId?`: \| `"harm_physical"`
\| `"harm_emotional"`
\| `"harm_financial"`
\| `"deception"`
\| `"bias"`
\| `"privacy"`
\| `"manipulation"`
\| `"instruction_safety"`
\| `"robustness"`
\| `"risk_awareness"`;
\}\>

Validation result with inferred schema type

---

### validateTestCase()

```ts
function validateTestCase(testCase): ZodSafeParseResult<{
  context?: string;
  description: string;
  expectedOutcome: 'escalate' | 'refuse' | 'caution' | 'clarify' | 'proceed' | 'detect';
  id: string;
  input: string;
  name: string;
  riskLevel: 'critical' | 'high' | 'low' | 'medium';
  tags: readonly string[];
}>;
```

Defined in: [packages/nexus-agents/src/security/safety-bench/safety-categories.ts:166](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/security/safety-bench/safety-categories.ts#L166)

Validate a test case definition.

#### Parameters

##### testCase

`unknown`

Test case to validate

#### Returns

`ZodSafeParseResult`\<\{
`context?`: `string`;
`description`: `string`;
`expectedOutcome`: `"escalate"` \| `"refuse"` \| `"caution"` \| `"clarify"` \| `"proceed"` \| `"detect"`;
`id`: `string`;
`input`: `string`;
`name`: `string`;
`riskLevel`: `"critical"` \| `"high"` \| `"low"` \| `"medium"`;
`tags`: readonly `string`[];
\}\>

Validation result with inferred schema type
