---
title: 'API: scm'
description: Generated API reference for scm.
tier: 2
---

# scm

SCM (Source Control Management) exports — Centralized SCM provider module.
Replaces dual-path GitHub clients with unified IScmProvider interface.

## Classes

### GitHubProvider

Defined in: [packages/nexus-agents/src/scm/github-provider.ts:202](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/github-provider.ts#L202)

GitHub provider using the gh CLI.

Requires: gh CLI installed and authenticated.

#### Implements

- [`IScmProvider`](#iscmprovider)

#### Constructors

##### Constructor

```ts
new GitHubProvider(repo): GitHubProvider;
```

Defined in: [packages/nexus-agents/src/scm/github-provider.ts:205](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/github-provider.ts#L205)

###### Parameters

###### repo

`string`

###### Returns

[`GitHubProvider`](#githubprovider)

#### Properties

##### platform

```ts
readonly platform: "github";
```

Defined in: [packages/nexus-agents/src/scm/github-provider.ts:203](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/github-provider.ts#L203)

Platform identifier.

###### Implementation of

[`IScmProvider`](#iscmprovider).[`platform`](#platform-3)

##### repo

```ts
readonly repo: string;
```

Defined in: [packages/nexus-agents/src/scm/github-provider.ts:205](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/github-provider.ts#L205)

Repository in owner/repo format.

###### Implementation of

[`IScmProvider`](#iscmprovider).[`repo`](#repo-2)

#### Methods

##### addComment()

```ts
addComment(issueNumber, body): Promise<Result<void, ScmError>>;
```

Defined in: [packages/nexus-agents/src/scm/github-provider.ts:335](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/github-provider.ts#L335)

###### Parameters

###### issueNumber

`number`

###### body

`string`

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`ScmError`](#scmerror)\>\>

###### Implementation of

[`IScmProvider`](#iscmprovider).[`addComment`](#addcomment-1)

##### addLabels()

```ts
addLabels(issueNumber, labels): Promise<Result<void, ScmError>>;
```

Defined in: [packages/nexus-agents/src/scm/github-provider.ts:241](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/github-provider.ts#L241)

###### Parameters

###### issueNumber

`number`

###### labels

readonly `string`[]

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`ScmError`](#scmerror)\>\>

###### Implementation of

[`IScmProvider`](#iscmprovider).[`addLabels`](#addlabels-1)

##### createIssue()

```ts
createIssue(
   title,
   body,
labels?): Promise<Result<ScmIssue, ScmError>>;
```

Defined in: [packages/nexus-agents/src/scm/github-provider.ts:312](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/github-provider.ts#L312)

###### Parameters

###### title

`string`

###### body

`string`

###### labels?

readonly `string`[]

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`ScmIssue`](#scmissue), [`ScmError`](#scmerror)\>\>

###### Implementation of

[`IScmProvider`](#iscmprovider).[`createIssue`](#createissue-1)

##### createPR()

```ts
createPR(options): Promise<Result<ScmPullRequest, ScmError>>;
```

Defined in: [packages/nexus-agents/src/scm/github-provider.ts:250](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/github-provider.ts#L250)

###### Parameters

###### options

[`CreatePROptions`](#createproptions)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`ScmPullRequest`](#scmpullrequest), [`ScmError`](#scmerror)\>\>

###### Implementation of

[`IScmProvider`](#iscmprovider).[`createPR`](#createpr-1)

##### getIssue()

```ts
getIssue(number): Promise<Result<ScmIssue, ScmError>>;
```

Defined in: [packages/nexus-agents/src/scm/github-provider.ts:207](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/github-provider.ts#L207)

###### Parameters

###### number

`number`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`ScmIssue`](#scmissue), [`ScmError`](#scmerror)\>\>

###### Implementation of

[`IScmProvider`](#iscmprovider).[`getIssue`](#getissue-1)

##### getPRStatus()

```ts
getPRStatus(prNumber): Promise<Result<ScmPRStatus, ScmError>>;
```

Defined in: [packages/nexus-agents/src/scm/github-provider.ts:299](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/github-provider.ts#L299)

###### Parameters

###### prNumber

`number`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`ScmPRStatus`](#scmprstatus), [`ScmError`](#scmerror)\>\>

###### Implementation of

[`IScmProvider`](#iscmprovider).[`getPRStatus`](#getprstatus-1)

##### listComments()

```ts
listComments(issueNumber): Promise<Result<readonly ScmComment[], ScmError>>;
```

Defined in: [packages/nexus-agents/src/scm/github-provider.ts:344](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/github-provider.ts#L344)

###### Parameters

###### issueNumber

`number`

###### Returns

`Promise`\<[`Result`](core.md#result)\<readonly [`ScmComment`](#scmcomment)[], [`ScmError`](#scmerror)\>\>

###### Implementation of

[`IScmProvider`](#iscmprovider).[`listComments`](#listcomments-1)

##### listIssues()

```ts
listIssues(filters?): Promise<Result<readonly ScmIssue[], ScmError>>;
```

Defined in: [packages/nexus-agents/src/scm/github-provider.ts:220](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/github-provider.ts#L220)

###### Parameters

###### filters?

[`IssueFilters`](#issuefilters)

###### Returns

`Promise`\<[`Result`](core.md#result)\<readonly [`ScmIssue`](#scmissue)[], [`ScmError`](#scmerror)\>\>

###### Implementation of

[`IScmProvider`](#iscmprovider).[`listIssues`](#listissues-1)

##### mergePR()

```ts
mergePR(prNumber, options?): Promise<Result<void, ScmError>>;
```

Defined in: [packages/nexus-agents/src/scm/github-provider.ts:285](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/github-provider.ts#L285)

###### Parameters

###### prNumber

`number`

###### options?

[`MergePROptions`](#mergeproptions)

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`ScmError`](#scmerror)\>\>

###### Implementation of

[`IScmProvider`](#iscmprovider).[`mergePR`](#mergepr-1)

---

### GitHubReviewer

Defined in: [packages/nexus-agents/src/scm/github-provider-traits.ts:200](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/github-provider-traits.ts#L200)

GitHub-specific reviewer that adds PR detail and review capabilities
to a GitHubProvider. Implements IScmReviewer trait.

#### Example

```typescript
const provider = createGitHubProvider('owner/repo');
const reviewer = new GitHubReviewer(provider);
const detail = await reviewer.getPullRequestDetail(42);
```

#### Implements

- [`IScmReviewer`](#iscmreviewer)

#### Constructors

##### Constructor

```ts
new GitHubReviewer(provider): GitHubReviewer;
```

Defined in: [packages/nexus-agents/src/scm/github-provider-traits.ts:201](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/github-provider-traits.ts#L201)

###### Parameters

###### provider

[`GitHubProvider`](#githubprovider)

###### Returns

[`GitHubReviewer`](#githubreviewer)

#### Methods

##### createReview()

```ts
createReview(
   prNumber,
   body,
decision): Promise<Result<void, ScmError>>;
```

Defined in: [packages/nexus-agents/src/scm/github-provider-traits.ts:238](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/github-provider-traits.ts#L238)

Post a review on a pull request.

###### Parameters

###### prNumber

`number`

###### body

`string`

###### decision

[`ScmReviewDecision`](#scmreviewdecision)

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`ScmError`](#scmerror)\>\>

###### Implementation of

[`IScmReviewer`](#iscmreviewer).[`createReview`](#createreview-1)

##### getIssueDetail()

```ts
getIssueDetail(issueNumber): Promise<Result<ScmIssueDetail, ScmError>>;
```

Defined in: [packages/nexus-agents/src/scm/github-provider-traits.ts:278](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/github-provider-traits.ts#L278)

Fetch issue with author association and state.

###### Parameters

###### issueNumber

`number`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`ScmIssueDetail`](#scmissuedetail), [`ScmError`](#scmerror)\>\>

###### Implementation of

[`IScmReviewer`](#iscmreviewer).[`getIssueDetail`](#getissuedetail-1)

##### getPullRequestDetail()

```ts
getPullRequestDetail(prNumber): Promise<Result<ScmPullRequestDetail, ScmError>>;
```

Defined in: [packages/nexus-agents/src/scm/github-provider-traits.ts:203](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/github-provider-traits.ts#L203)

Fetch PR with full file diffs and stats.

###### Parameters

###### prNumber

`number`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`ScmPullRequestDetail`](#scmpullrequestdetail), [`ScmError`](#scmerror)\>\>

###### Implementation of

[`IScmReviewer`](#iscmreviewer).[`getPullRequestDetail`](#getpullrequestdetail-1)

##### listCommentDetails()

```ts
listCommentDetails(issueNumber): Promise<Result<readonly ScmCommentDetail[], ScmError>>;
```

Defined in: [packages/nexus-agents/src/scm/github-provider-traits.ts:303](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/github-provider-traits.ts#L303)

List comments with author associations.

###### Parameters

###### issueNumber

`number`

###### Returns

`Promise`\<[`Result`](core.md#result)\<readonly [`ScmCommentDetail`](#scmcommentdetail)[], [`ScmError`](#scmerror)\>\>

###### Implementation of

[`IScmReviewer`](#iscmreviewer).[`listCommentDetails`](#listcommentdetails-1)

---

### GitHubUserInfo

Defined in: [packages/nexus-agents/src/scm/github-provider-traits.ts:336](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/github-provider-traits.ts#L336)

GitHub-specific user info provider. Implements IScmUserInfo trait.

#### Implements

- [`IScmUserInfo`](#iscmuserinfo)

#### Constructors

##### Constructor

```ts
new GitHubUserInfo(): GitHubUserInfo;
```

###### Returns

[`GitHubUserInfo`](#githubuserinfo)

#### Methods

##### fetchUserMetadata()

```ts
fetchUserMetadata(username): Promise<Result<ScmUserMetadata, ScmError>>;
```

Defined in: [packages/nexus-agents/src/scm/github-provider-traits.ts:337](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/github-provider-traits.ts#L337)

Fetch user metadata for reputation assessment.

###### Parameters

###### username

`string`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`ScmUserMetadata`](#scmusermetadata), [`ScmError`](#scmerror)\>\>

###### Implementation of

[`IScmUserInfo`](#iscmuserinfo).[`fetchUserMetadata`](#fetchusermetadata-1)

---

### ScmError

Defined in: [packages/nexus-agents/src/scm/types.ts:111](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L111)

Unified SCM error with platform-aware context.

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new ScmError(
   message,
   platform,
   statusCode?,
   context?): ScmError;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:112](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L112)

###### Parameters

###### message

`string`

###### platform

[`ScmPlatform`](#scmplatform)

###### statusCode?

`number`

###### context?

`Record`\<`string`, `unknown`\>

###### Returns

[`ScmError`](#scmerror)

###### Overrides

```ts
Error.constructor;
```

#### Properties

##### cause?

```ts
optional cause?: unknown;
```

Defined in: node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/lib/lib.es2022.error.d.ts:24

###### Inherited from

```ts
Error.cause;
```

##### context?

```ts
readonly optional context?: Record<string, unknown>;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:116](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L116)

##### message

```ts
message: string;
```

Defined in: node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/lib/lib.es5.d.ts:1075

###### Inherited from

```ts
Error.message;
```

##### name

```ts
name: string;
```

Defined in: node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/lib/lib.es5.d.ts:1074

###### Inherited from

```ts
Error.name;
```

##### platform

```ts
readonly platform: ScmPlatform;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:114](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L114)

##### stack?

```ts
optional stack?: string;
```

Defined in: node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

```ts
Error.stack;
```

##### statusCode?

```ts
readonly optional statusCode?: number;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:115](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L115)

##### stackTraceLimit

```ts
static stackTraceLimit: number;
```

Defined in: node_modules/.pnpm/@types+node@25.9.3/node_modules/@types/node/globals.d.ts:67

The `Error.stackTraceLimit` property specifies the number of stack frames
collected by a stack trace (whether generated by `new Error().stack` or
`Error.captureStackTrace(obj)`).

The default value is `10` but may be set to any valid JavaScript number. Changes
will affect any stack trace captured _after_ the value has been changed.

If set to a non-number value, or set to a negative number, stack traces will
not capture any frames.

###### Inherited from

```ts
Error.stackTraceLimit;
```

#### Methods

##### captureStackTrace()

```ts
static captureStackTrace(targetObject, constructorOpt?): void;
```

Defined in: node_modules/.pnpm/@types+node@25.9.3/node_modules/@types/node/globals.d.ts:51

Creates a `.stack` property on `targetObject`, which when accessed returns
a string representing the location in the code at which
`Error.captureStackTrace()` was called.

```js
const myObject = {};
Error.captureStackTrace(myObject);
myObject.stack; // Similar to `new Error().stack`
```

The first line of the trace will be prefixed with
`${myObject.name}: ${myObject.message}`.

The optional `constructorOpt` argument accepts a function. If given, all frames
above `constructorOpt`, including `constructorOpt`, will be omitted from the
generated stack trace.

The `constructorOpt` argument is useful for hiding implementation
details of error generation from the user. For instance:

```js
function a() {
  b();
}

function b() {
  c();
}

function c() {
  // Create an error without stack trace to avoid calculating the stack trace twice.
  const { stackTraceLimit } = Error;
  Error.stackTraceLimit = 0;
  const error = new Error();
  Error.stackTraceLimit = stackTraceLimit;

  // Capture the stack trace above function b
  Error.captureStackTrace(error, b); // Neither function c, nor b is included in the stack trace
  throw error;
}

a();
```

###### Parameters

###### targetObject

`object`

###### constructorOpt?

`Function`

###### Returns

`void`

###### Inherited from

```ts
Error.captureStackTrace;
```

##### prepareStackTrace()

```ts
static prepareStackTrace(err, stackTraces): any;
```

Defined in: node_modules/.pnpm/@types+node@25.9.3/node_modules/@types/node/globals.d.ts:55

###### Parameters

###### err

`Error`

###### stackTraces

`CallSite`[]

###### Returns

`any`

###### See

https://v8.dev/docs/stack-trace-api#customizing-stack-traces

###### Inherited from

```ts
Error.prepareStackTrace;
```

## Interfaces

### CreatePROptions

Defined in: [packages/nexus-agents/src/scm/types.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L77)

PR creation options.

#### Properties

##### base

```ts
readonly base: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L81)

##### body

```ts
readonly body: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L79)

##### head

```ts
readonly head: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:80](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L80)

##### title

```ts
readonly title: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:78](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L78)

---

### CreateScmProviderConfig

Defined in: [packages/nexus-agents/src/scm/factory.ts:19](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/factory.ts#L19)

Configuration for creating an SCM provider.

#### Properties

##### platform?

```ts
readonly optional platform?: ScmPlatform;
```

Defined in: [packages/nexus-agents/src/scm/factory.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/factory.ts#L23)

SCM platform (default: github)

##### repo

```ts
readonly repo: string;
```

Defined in: [packages/nexus-agents/src/scm/factory.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/factory.ts#L21)

Repository in owner/repo format

##### token?

```ts
readonly optional token?: TokenResolverConfig;
```

Defined in: [packages/nexus-agents/src/scm/factory.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/factory.ts#L25)

Token configuration (env vars checked automatically if omitted)

---

### IScmProvider

Defined in: [packages/nexus-agents/src/scm/types.ts:184](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L184)

Core SCM provider interface.

All methods return `Result<T, ScmError>` for consistent error handling
across GitHub REST API, gh CLI, and future GitLab/Gitea backends.

#### Properties

##### platform

```ts
readonly platform: ScmPlatform;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:186](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L186)

Platform identifier.

##### repo

```ts
readonly repo: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:189](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L189)

Repository in owner/repo format.

#### Methods

##### addComment()

```ts
addComment(issueNumber, body): Promise<Result<void, ScmError>>;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:207](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L207)

###### Parameters

###### issueNumber

`number`

###### body

`string`

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`ScmError`](#scmerror)\>\>

##### addLabels()

```ts
addLabels(issueNumber, labels): Promise<Result<void, ScmError>>;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:199](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L199)

###### Parameters

###### issueNumber

`number`

###### labels

readonly `string`[]

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`ScmError`](#scmerror)\>\>

##### createIssue()

```ts
createIssue(
   title,
   body,
labels?): Promise<Result<ScmIssue, ScmError>>;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:194](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L194)

###### Parameters

###### title

`string`

###### body

`string`

###### labels?

readonly `string`[]

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`ScmIssue`](#scmissue), [`ScmError`](#scmerror)\>\>

##### createPR()

```ts
createPR(options): Promise<Result<ScmPullRequest, ScmError>>;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:202](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L202)

###### Parameters

###### options

[`CreatePROptions`](#createproptions)

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`ScmPullRequest`](#scmpullrequest), [`ScmError`](#scmerror)\>\>

##### getIssue()

```ts
getIssue(number): Promise<Result<ScmIssue, ScmError>>;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:192](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L192)

###### Parameters

###### number

`number`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`ScmIssue`](#scmissue), [`ScmError`](#scmerror)\>\>

##### getPRStatus()

```ts
getPRStatus(prNumber): Promise<Result<ScmPRStatus, ScmError>>;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:204](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L204)

###### Parameters

###### prNumber

`number`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`ScmPRStatus`](#scmprstatus), [`ScmError`](#scmerror)\>\>

##### listComments()

```ts
listComments(issueNumber): Promise<Result<readonly ScmComment[], ScmError>>;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:208](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L208)

###### Parameters

###### issueNumber

`number`

###### Returns

`Promise`\<[`Result`](core.md#result)\<readonly [`ScmComment`](#scmcomment)[], [`ScmError`](#scmerror)\>\>

##### listIssues()

```ts
listIssues(filters?): Promise<Result<readonly ScmIssue[], ScmError>>;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:193](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L193)

###### Parameters

###### filters?

[`IssueFilters`](#issuefilters)

###### Returns

`Promise`\<[`Result`](core.md#result)\<readonly [`ScmIssue`](#scmissue)[], [`ScmError`](#scmerror)\>\>

##### mergePR()

```ts
mergePR(prNumber, options?): Promise<Result<void, ScmError>>;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:203](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L203)

###### Parameters

###### prNumber

`number`

###### options?

[`MergePROptions`](#mergeproptions)

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`ScmError`](#scmerror)\>\>

---

### IScmReviewer

Defined in: [packages/nexus-agents/src/scm/types.ts:221](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L221)

Review trait — PR review capabilities.

Implemented by platforms supporting code review workflows.
Consumers declare this trait when they need PR file diffs or review posting.

#### Methods

##### createReview()

```ts
createReview(
   prNumber,
   body,
decision): Promise<Result<void, ScmError>>;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:226](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L226)

Post a review on a pull request.

###### Parameters

###### prNumber

`number`

###### body

`string`

###### decision

[`ScmReviewDecision`](#scmreviewdecision)

###### Returns

`Promise`\<[`Result`](core.md#result)\<`void`, [`ScmError`](#scmerror)\>\>

##### getIssueDetail()

```ts
getIssueDetail(issueNumber): Promise<Result<ScmIssueDetail, ScmError>>;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:233](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L233)

Fetch issue with author association and state.

###### Parameters

###### issueNumber

`number`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`ScmIssueDetail`](#scmissuedetail), [`ScmError`](#scmerror)\>\>

##### getPullRequestDetail()

```ts
getPullRequestDetail(prNumber): Promise<Result<ScmPullRequestDetail, ScmError>>;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:223](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L223)

Fetch PR with full file diffs and stats.

###### Parameters

###### prNumber

`number`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`ScmPullRequestDetail`](#scmpullrequestdetail), [`ScmError`](#scmerror)\>\>

##### listCommentDetails()

```ts
listCommentDetails(issueNumber): Promise<Result<readonly ScmCommentDetail[], ScmError>>;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:236](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L236)

List comments with author associations.

###### Parameters

###### issueNumber

`number`

###### Returns

`Promise`\<[`Result`](core.md#result)\<readonly [`ScmCommentDetail`](#scmcommentdetail)[], [`ScmError`](#scmerror)\>\>

---

### IScmUserInfo

Defined in: [packages/nexus-agents/src/scm/types.ts:245](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L245)

User info trait — user metadata for reputation assessment.

Implemented by platforms supporting user profile queries.
Consumers declare this trait when they need author reputation data.

#### Methods

##### fetchUserMetadata()

```ts
fetchUserMetadata(username): Promise<Result<ScmUserMetadata, ScmError>>;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:247](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L247)

Fetch user metadata for reputation assessment.

###### Parameters

###### username

`string`

###### Returns

`Promise`\<[`Result`](core.md#result)\<[`ScmUserMetadata`](#scmusermetadata), [`ScmError`](#scmerror)\>\>

---

### IssueFilters

Defined in: [packages/nexus-agents/src/scm/types.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L100)

Issue filter options.

#### Properties

##### labels?

```ts
readonly optional labels?: readonly string[];
```

Defined in: [packages/nexus-agents/src/scm/types.ts:101](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L101)

##### limit?

```ts
readonly optional limit?: number;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:103](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L103)

##### state?

```ts
readonly optional state?: "open" | "closed" | "all";
```

Defined in: [packages/nexus-agents/src/scm/types.ts:102](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L102)

---

### MergePROptions

Defined in: [packages/nexus-agents/src/scm/types.ts:85](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L85)

PR merge options.

#### Properties

##### commitMessage?

```ts
readonly optional commitMessage?: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:88](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L88)

##### commitTitle?

```ts
readonly optional commitTitle?: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:87](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L87)

##### deleteBranch?

```ts
readonly optional deleteBranch?: boolean;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:89](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L89)

##### method?

```ts
readonly optional method?: "merge" | "squash" | "rebase";
```

Defined in: [packages/nexus-agents/src/scm/types.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L86)

---

### ScmComment

Defined in: [packages/nexus-agents/src/scm/types.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L69)

SCM comment representation.

#### Extended by

- [`ScmCommentDetail`](#scmcommentdetail)

#### Properties

##### author

```ts
readonly author: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L72)

##### body

```ts
readonly body: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L71)

##### createdAt

```ts
readonly createdAt: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L73)

##### id

```ts
readonly id: number;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L70)

---

### ScmCommentDetail

Defined in: [packages/nexus-agents/src/scm/types.ts:156](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L156)

Extended comment with author association.

#### Extends

- [`ScmComment`](#scmcomment)

#### Properties

##### author

```ts
readonly author: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L72)

###### Inherited from

[`ScmComment`](#scmcomment).[`author`](#author)

##### authorAssociation

```ts
readonly authorAssociation: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:157](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L157)

##### body

```ts
readonly body: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L71)

###### Inherited from

[`ScmComment`](#scmcomment).[`body`](#body-1)

##### createdAt

```ts
readonly createdAt: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L73)

###### Inherited from

[`ScmComment`](#scmcomment).[`createdAt`](#createdat)

##### id

```ts
readonly id: number;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L70)

###### Inherited from

[`ScmComment`](#scmcomment).[`id`](#id)

---

### ScmFileChange

Defined in: [packages/nexus-agents/src/scm/types.ts:128](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L128)

File change in a pull request.

#### Properties

##### additions

```ts
readonly additions: number;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:131](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L131)

##### deletions

```ts
readonly deletions: number;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:132](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L132)

##### filename

```ts
readonly filename: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:129](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L129)

##### patch?

```ts
readonly optional patch?: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:133](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L133)

##### previousFilename?

```ts
readonly optional previousFilename?: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:134](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L134)

##### status

```ts
readonly status: "added" | "modified" | "removed" | "renamed" | "copied";
```

Defined in: [packages/nexus-agents/src/scm/types.ts:130](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L130)

---

### ScmIssue

Defined in: [packages/nexus-agents/src/scm/types.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L48)

SCM issue representation.

#### Extended by

- [`ScmIssueDetail`](#scmissuedetail)

#### Properties

##### author

```ts
readonly author: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L53)

##### body

```ts
readonly body: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L51)

##### createdAt

```ts
readonly createdAt: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L54)

##### labels

```ts
readonly labels: readonly string[];
```

Defined in: [packages/nexus-agents/src/scm/types.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L52)

##### number

```ts
readonly number: number;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L49)

##### title

```ts
readonly title: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L50)

---

### ScmIssueDetail

Defined in: [packages/nexus-agents/src/scm/types.ts:149](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L149)

Extended issue with association and state. Used by IScmReviewer.

#### Extends

- [`ScmIssue`](#scmissue)

#### Properties

##### author

```ts
readonly author: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L53)

###### Inherited from

[`ScmIssue`](#scmissue).[`author`](#author-2)

##### authorAssociation

```ts
readonly authorAssociation: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:150](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L150)

##### body

```ts
readonly body: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L51)

###### Inherited from

[`ScmIssue`](#scmissue).[`body`](#body-3)

##### createdAt

```ts
readonly createdAt: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L54)

###### Inherited from

[`ScmIssue`](#scmissue).[`createdAt`](#createdat-2)

##### labels

```ts
readonly labels: readonly string[];
```

Defined in: [packages/nexus-agents/src/scm/types.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L52)

###### Inherited from

[`ScmIssue`](#scmissue).[`labels`](#labels-1)

##### number

```ts
readonly number: number;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L49)

###### Inherited from

[`ScmIssue`](#scmissue).[`number`](#number)

##### state

```ts
readonly state: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:151](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L151)

##### title

```ts
readonly title: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L50)

###### Inherited from

[`ScmIssue`](#scmissue).[`title`](#title-1)

##### url

```ts
readonly url: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:152](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L152)

---

### ScmPRStatus

Defined in: [packages/nexus-agents/src/scm/types.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L93)

PR status for merge eligibility.

#### Properties

##### checksStatus

```ts
readonly checksStatus: "success" | "failure" | "pending";
```

Defined in: [packages/nexus-agents/src/scm/types.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L95)

##### mergeable

```ts
readonly mergeable: boolean;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L94)

##### reviewStatus

```ts
readonly reviewStatus: "pending" | "approved" | "changes_requested";
```

Defined in: [packages/nexus-agents/src/scm/types.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L96)

---

### ScmPullRequest

Defined in: [packages/nexus-agents/src/scm/types.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L58)

SCM pull/merge request representation.

#### Extended by

- [`ScmPullRequestDetail`](#scmpullrequestdetail)

#### Properties

##### author

```ts
readonly author: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L62)

##### base

```ts
readonly base: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L63)

##### body

```ts
readonly body: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L61)

##### head

```ts
readonly head: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L64)

##### number

```ts
readonly number: number;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L59)

##### title

```ts
readonly title: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L60)

##### url

```ts
readonly url: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L65)

---

### ScmPullRequestDetail

Defined in: [packages/nexus-agents/src/scm/types.ts:138](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L138)

Extended PR with file diffs and stats. Used by IScmReviewer.

#### Extends

- [`ScmPullRequest`](#scmpullrequest)

#### Properties

##### additions

```ts
readonly additions: number;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:143](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L143)

##### author

```ts
readonly author: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L62)

###### Inherited from

[`ScmPullRequest`](#scmpullrequest).[`author`](#author-4)

##### authorAssociation

```ts
readonly authorAssociation: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:140](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L140)

##### base

```ts
readonly base: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L63)

###### Inherited from

[`ScmPullRequest`](#scmpullrequest).[`base`](#base-1)

##### body

```ts
readonly body: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L61)

###### Inherited from

[`ScmPullRequest`](#scmpullrequest).[`body`](#body-5)

##### deletions

```ts
readonly deletions: number;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:144](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L144)

##### draft

```ts
readonly draft: boolean;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:139](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L139)

##### files

```ts
readonly files: readonly ScmFileChange[];
```

Defined in: [packages/nexus-agents/src/scm/types.ts:142](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L142)

##### head

```ts
readonly head: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L64)

###### Inherited from

[`ScmPullRequest`](#scmpullrequest).[`head`](#head-1)

##### headSha

```ts
readonly headSha: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:145](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L145)

##### labels

```ts
readonly labels: readonly string[];
```

Defined in: [packages/nexus-agents/src/scm/types.ts:141](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L141)

##### number

```ts
readonly number: number;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L59)

###### Inherited from

[`ScmPullRequest`](#scmpullrequest).[`number`](#number-2)

##### title

```ts
readonly title: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L60)

###### Inherited from

[`ScmPullRequest`](#scmpullrequest).[`title`](#title-3)

##### url

```ts
readonly url: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L65)

###### Inherited from

[`ScmPullRequest`](#scmpullrequest).[`url`](#url-1)

---

### ScmToken

Defined in: [packages/nexus-agents/src/scm/types.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L24)

Resolved SCM token with metadata.

#### Properties

##### platform

```ts
readonly platform: ScmPlatform;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L30)

SCM platform this token is for

##### strategy

```ts
readonly strategy: TokenStrategy;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L28)

How the token was resolved

##### value

```ts
readonly value: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L26)

The raw token value

---

### ScmUserMetadata

Defined in: [packages/nexus-agents/src/scm/types.ts:164](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L164)

User metadata for reputation assessment.

#### Properties

##### company

```ts
readonly company: string | null;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:167](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L167)

##### createdAt

```ts
readonly createdAt: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:171](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L171)

##### followers

```ts
readonly followers: number;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:168](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L168)

##### following

```ts
readonly following: number;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:169](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L169)

##### login

```ts
readonly login: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:165](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L165)

##### name

```ts
readonly name: string | null;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:166](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L166)

##### publicRepos

```ts
readonly publicRepos: number;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:170](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L170)

---

### TokenResolverConfig

Defined in: [packages/nexus-agents/src/scm/types.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L34)

Token resolution configuration.

#### Properties

##### envVar?

```ts
readonly optional envVar?: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L40)

Custom env var name override

##### platform?

```ts
readonly optional platform?: ScmPlatform;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L38)

SCM platform to resolve for

##### token?

```ts
readonly optional token?: string;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L36)

Explicit token (highest priority)

## Type Aliases

### FullCapableProvider

```ts
type FullCapableProvider = IScmProvider & IScmReviewer & IScmUserInfo;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:260](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L260)

Convenience type: provider with all capabilities.
Used by full triage workflows that need review + user info.

---

### ReviewCapableProvider

```ts
type ReviewCapableProvider = IScmProvider & IScmReviewer;
```

Defined in: [packages/nexus-agents/src/scm/types.ts:254](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L254)

Convenience type: provider with review capabilities.
Used by PR review workflows.

---

### ScmPlatform

```ts
type ScmPlatform = 'github' | 'gitlab' | 'gitea';
```

Defined in: [packages/nexus-agents/src/scm/types.ts:18](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L18)

Supported SCM platforms.

---

### ScmReviewDecision

```ts
type ScmReviewDecision = 'approve' | 'request_changes' | 'comment';
```

Defined in: [packages/nexus-agents/src/scm/types.ts:161](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L161)

Review decision for a pull request.

---

### TokenStrategy

```ts
type TokenStrategy = 'env' | 'cli' | 'config';
```

Defined in: [packages/nexus-agents/src/scm/types.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/types.ts#L21)

Token resolution strategy.

## Functions

### createFullGitHubProvider()

```ts
function createFullGitHubProvider(repo): GitHubProvider & IScmReviewer & IScmUserInfo;
```

Defined in: [packages/nexus-agents/src/scm/github-provider-traits.ts:379](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/github-provider-traits.ts#L379)

Creates a full-capability GitHub provider with all traits.

Returns an object that implements IScmProvider & IScmReviewer & IScmUserInfo.
Consumers can narrow the type to only the traits they need.

#### Parameters

##### repo

`string`

#### Returns

[`GitHubProvider`](#githubprovider) & [`IScmReviewer`](#iscmreviewer) & [`IScmUserInfo`](#iscmuserinfo)

#### Example

```typescript
const provider = createFullGitHubProvider('owner/repo');
// Use as ReviewCapableProvider
const detail = await provider.getPullRequestDetail(42);
// Use as IScmUserInfo
const user = await provider.fetchUserMetadata('octocat');
```

---

### createGitHubProvider()

```ts
function createGitHubProvider(repo): IScmProvider;
```

Defined in: [packages/nexus-agents/src/scm/factory.ts:82](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/factory.ts#L82)

Creates a GitHub provider directly (convenience shortcut).

#### Parameters

##### repo

`string`

Repository in owner/repo format

#### Returns

[`IScmProvider`](#iscmprovider)

GitHub provider instance

---

### createScmProvider()

```ts
function createScmProvider(config): Promise<Result<IScmProvider, ScmError>>;
```

Defined in: [packages/nexus-agents/src/scm/factory.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/factory.ts#L44)

Creates an SCM provider for the specified repository.

Token resolution is automatic — checks env vars and CLI auth.
Currently supports GitHub (gh CLI). GitLab/Gitea planned.

#### Parameters

##### config

[`CreateScmProviderConfig`](#createscmproviderconfig)

Provider configuration

#### Returns

`Promise`\<[`Result`](core.md#result)\<[`IScmProvider`](#iscmprovider), [`ScmError`](#scmerror)\>\>

SCM provider instance or error

#### Example

```typescript
const result = await createScmProvider({ repo: 'owner/repo' });
if (!result.ok) {
  console.error(result.error);
  return;
}
const issues = await result.value.listIssues();
```

---

### getTokenEnvVars()

```ts
function getTokenEnvVars(platform?): readonly string[];
```

Defined in: [packages/nexus-agents/src/scm/token-resolver.ts:139](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/token-resolver.ts#L139)

Returns the list of environment variable names for a platform.
Useful for documentation and error messages.

#### Parameters

##### platform?

[`ScmPlatform`](#scmplatform) = `'github'`

#### Returns

readonly `string`[]

---

### hasToken()

```ts
function hasToken(platform?): boolean;
```

Defined in: [packages/nexus-agents/src/scm/token-resolver.ts:131](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/token-resolver.ts#L131)

Synchronous check: is any token available for the given platform?
Only checks environment variables (no CLI auth, which is async).

#### Parameters

##### platform?

[`ScmPlatform`](#scmplatform) = `'github'`

#### Returns

`boolean`

---

### resolveToken()

```ts
function resolveToken(config?): Promise<Result<ScmToken, Error>>;
```

Defined in: [packages/nexus-agents/src/scm/token-resolver.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/scm/token-resolver.ts#L96)

Resolves an SCM token using the priority chain:

1. Explicit config
2. Environment variables
3. CLI auth

#### Parameters

##### config?

[`TokenResolverConfig`](#tokenresolverconfig)

Token resolution configuration

#### Returns

`Promise`\<[`Result`](core.md#result)\<[`ScmToken`](#scmtoken), `Error`\>\>

Resolved token or error
