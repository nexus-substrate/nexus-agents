---
title: 'API: observability'
description: Generated API reference for observability.
tier: 2
---

# observability

## Classes

### CompactDashboardRenderer

Defined in: [packages/nexus-agents/src/observability/dashboard-renderer.ts:283](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-renderer.ts#L283)

Compact single-line renderer for logging.

#### Implements

- [`IDashboardRenderer`](#idashboardrenderer)

#### Constructors

##### Constructor

```ts
new CompactDashboardRenderer(): CompactDashboardRenderer;
```

###### Returns

[`CompactDashboardRenderer`](#compactdashboardrenderer)

#### Methods

##### render()

```ts
render(snapshot): string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-renderer.ts:284](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-renderer.ts#L284)

Render the dashboard snapshot to the configured format.

###### Parameters

###### snapshot

[`DashboardSnapshot`](#dashboardsnapshot)

###### Returns

`string`

###### Implementation of

[`IDashboardRenderer`](#idashboardrenderer).[`render`](#render-5)

##### renderActivity()

```ts
renderActivity(activity): string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-renderer.ts:309](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-renderer.ts#L309)

Render the activity feed.

###### Parameters

###### activity

[`ActivityItem`](#activityitem)[]

###### Returns

`string`

###### Implementation of

[`IDashboardRenderer`](#idashboardrenderer).[`renderActivity`](#renderactivity-3)

##### renderAgents()

```ts
renderAgents(agents): string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-renderer.ts:301](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-renderer.ts#L301)

Render the agent status table.

###### Parameters

###### agents

[`AgentStatus`](#agentstatus)[]

###### Returns

`string`

###### Implementation of

[`IDashboardRenderer`](#idashboardrenderer).[`renderAgents`](#renderagents-3)

##### renderBottlenecks()

```ts
renderBottlenecks(bottlenecks): string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-renderer.ts:313](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-renderer.ts#L313)

Render bottleneck warnings.

###### Parameters

###### bottlenecks

[`BottleneckInfo`](#bottleneckinfo)[]

###### Returns

`string`

###### Implementation of

[`IDashboardRenderer`](#idashboardrenderer).[`renderBottlenecks`](#renderbottlenecks-3)

##### renderClusters()

```ts
renderClusters(clusters): string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-renderer.ts:317](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-renderer.ts#L317)

Render cluster analysis.

###### Parameters

###### clusters

[`AgentCluster`](#agentcluster)[]

###### Returns

`string`

###### Implementation of

[`IDashboardRenderer`](#idashboardrenderer).[`renderClusters`](#renderclusters-3)

##### renderGraph()

```ts
renderGraph(graph): string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-renderer.ts:305](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-renderer.ts#L305)

Render the interaction graph.

###### Parameters

###### graph

[`GraphSummary`](#graphsummary)

###### Returns

`string`

###### Implementation of

[`IDashboardRenderer`](#idashboardrenderer).[`renderGraph`](#rendergraph-3)

##### renderHealth()

```ts
renderHealth(health): string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-renderer.ts:297](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-renderer.ts#L297)

Render just the health section.

###### Parameters

###### health

[`SwarmHealthMetrics`](#swarmhealthmetrics)

###### Returns

`string`

###### Implementation of

[`IDashboardRenderer`](#idashboardrenderer).[`renderHealth`](#renderhealth-3)

---

### Dashboard

Defined in: [packages/nexus-agents/src/observability/dashboard.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard.ts#L62)

Dashboard implementation that consumes SwarmObserver data.

#### Implements

- [`IDashboard`](#idashboard)

#### Constructors

##### Constructor

```ts
new Dashboard(observer, config?): Dashboard;
```

Defined in: [packages/nexus-agents/src/observability/dashboard.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard.ts#L68)

###### Parameters

###### observer

[`IInteractionObserver`](#iinteractionobserver)

###### config?

`Partial`\<[`DashboardConfig`](#dashboardconfig)\>

###### Returns

[`Dashboard`](#dashboard)

#### Methods

##### getConfig()

```ts
getConfig(): DashboardConfig;
```

Defined in: [packages/nexus-agents/src/observability/dashboard.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard.ts#L98)

Get dashboard configuration.

###### Returns

[`DashboardConfig`](#dashboardconfig)

###### Implementation of

[`IDashboard`](#idashboard).[`getConfig`](#getconfig-1)

##### getSnapshot()

```ts
getSnapshot(options?): DashboardSnapshot;
```

Defined in: [packages/nexus-agents/src/observability/dashboard.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard.ts#L74)

Get current dashboard snapshot.

###### Parameters

###### options?

[`DashboardUpdateOptions`](#dashboardupdateoptions)

###### Returns

[`DashboardSnapshot`](#dashboardsnapshot)

###### Implementation of

[`IDashboard`](#idashboard).[`getSnapshot`](#getsnapshot-1)

##### notifySubscribers()

```ts
notifySubscribers(): void;
```

Defined in: [packages/nexus-agents/src/observability/dashboard.ts:117](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard.ts#L117)

Notify all subscribers of an update.

###### Returns

`void`

##### render()

```ts
render(options?): string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard.ts#L93)

Render dashboard to string in configured format.

###### Parameters

###### options?

[`DashboardUpdateOptions`](#dashboardupdateoptions)

###### Returns

`string`

###### Implementation of

[`IDashboard`](#idashboard).[`render`](#render-4)

##### subscribe()

```ts
subscribe(callback): () => void;
```

Defined in: [packages/nexus-agents/src/observability/dashboard.ts:107](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard.ts#L107)

Subscribe to dashboard updates.

###### Parameters

###### callback

(`snapshot`) => `void`

###### Returns

() => `void`

###### Implementation of

[`IDashboard`](#idashboard).[`subscribe`](#subscribe-1)

##### updateConfig()

```ts
updateConfig(config): void;
```

Defined in: [packages/nexus-agents/src/observability/dashboard.ts:102](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard.ts#L102)

Update dashboard configuration.

###### Parameters

###### config

`Partial`\<[`DashboardConfig`](#dashboardconfig)\>

###### Returns

`void`

###### Implementation of

[`IDashboard`](#idashboard).[`updateConfig`](#updateconfig-1)

---

### DirectedInteractionGraph

Defined in: [packages/nexus-agents/src/observability/interaction-graph.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/interaction-graph.ts#L27)

Directed graph implementation for agent interactions.

#### Implements

- [`InteractionGraph`](#interactiongraph)

#### Constructors

##### Constructor

```ts
new DirectedInteractionGraph(): DirectedInteractionGraph;
```

###### Returns

[`DirectedInteractionGraph`](#directedinteractiongraph)

#### Methods

##### addEdge()

```ts
addEdge(edge): void;
```

Defined in: [packages/nexus-agents/src/observability/interaction-graph.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/interaction-graph.ts#L45)

Add an edge (interaction) to the graph.

###### Parameters

###### edge

[`InteractionEdge`](#interactionedge)

###### Returns

`void`

###### Implementation of

[`InteractionGraph`](#interactiongraph).[`addEdge`](#addedge-1)

##### addNode()

```ts
addNode(agentId): void;
```

Defined in: [packages/nexus-agents/src/observability/interaction-graph.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/interaction-graph.ts#L35)

Add a node (agent) to the graph.

###### Parameters

###### agentId

`string`

###### Returns

`void`

###### Implementation of

[`InteractionGraph`](#interactiongraph).[`addNode`](#addnode-1)

##### clear()

```ts
clear(): void;
```

Defined in: [packages/nexus-agents/src/observability/interaction-graph.ts:250](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/interaction-graph.ts#L250)

Clear the graph.

###### Returns

`void`

###### Implementation of

[`InteractionGraph`](#interactiongraph).[`clear`](#clear-4)

##### getClusteringCoefficient()

```ts
getClusteringCoefficient(agentId): number;
```

Defined in: [packages/nexus-agents/src/observability/interaction-graph.ts:197](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/interaction-graph.ts#L197)

Calculate clustering coefficient for a node.
Measures how interconnected a node's neighbors are.

###### Parameters

###### agentId

`string`

###### Returns

`number`

##### getDegreeCentrality()

```ts
getDegreeCentrality(): Map<string, number>;
```

Defined in: [packages/nexus-agents/src/observability/interaction-graph.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/interaction-graph.ts#L96)

Calculate degree centrality for all nodes.
Returns normalized centrality (0-1).

###### Returns

`Map`\<`string`, `number`\>

###### Implementation of

[`InteractionGraph`](#interactiongraph).[`getDegreeCentrality`](#getdegreecentrality-1)

##### getEdgeCount()

```ts
getEdgeCount(from, to): number;
```

Defined in: [packages/nexus-agents/src/observability/interaction-graph.ts:172](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/interaction-graph.ts#L172)

Get edge count between two agents.

###### Parameters

###### from

`string`

###### to

`string`

###### Returns

`number`

###### Implementation of

[`InteractionGraph`](#interactiongraph).[`getEdgeCount`](#getedgecount-1)

##### getEdges()

```ts
getEdges(): InteractionEdge[];
```

Defined in: [packages/nexus-agents/src/observability/interaction-graph.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/interaction-graph.ts#L70)

Get all edges in the graph.

###### Returns

[`InteractionEdge`](#interactionedge)[]

###### Implementation of

[`InteractionGraph`](#interactiongraph).[`getEdges`](#getedges-1)

##### getIncomingEdges()

```ts
getIncomingEdges(agentId): InteractionEdge[];
```

Defined in: [packages/nexus-agents/src/observability/interaction-graph.ts:88](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/interaction-graph.ts#L88)

Get edges to a specific agent.

###### Parameters

###### agentId

`string`

###### Returns

[`InteractionEdge`](#interactionedge)[]

###### Implementation of

[`InteractionGraph`](#interactiongraph).[`getIncomingEdges`](#getincomingedges-1)

##### getNeighbors()

```ts
getNeighbors(agentId): string[];
```

Defined in: [packages/nexus-agents/src/observability/interaction-graph.ts:180](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/interaction-graph.ts#L180)

Get unique interaction partners for an agent.

###### Parameters

###### agentId

`string`

###### Returns

`string`[]

##### getNodes()

```ts
getNodes(): string[];
```

Defined in: [packages/nexus-agents/src/observability/interaction-graph.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/interaction-graph.ts#L63)

Get all nodes in the graph.

###### Returns

`string`[]

###### Implementation of

[`InteractionGraph`](#interactiongraph).[`getNodes`](#getnodes-1)

##### getOutgoingEdges()

```ts
getOutgoingEdges(agentId): InteractionEdge[];
```

Defined in: [packages/nexus-agents/src/observability/interaction-graph.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/interaction-graph.ts#L81)

Get edges from a specific agent.

###### Parameters

###### agentId

`string`

###### Returns

[`InteractionEdge`](#interactionedge)[]

###### Implementation of

[`InteractionGraph`](#interactiongraph).[`getOutgoingEdges`](#getoutgoingedges-1)

##### getStats()

```ts
getStats(): GraphStats;
```

Defined in: [packages/nexus-agents/src/observability/interaction-graph.ts:219](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/interaction-graph.ts#L219)

Get statistics about the graph.

###### Returns

[`GraphStats`](#graphstats)

##### getStronglyConnectedComponents()

```ts
getStronglyConnectedComponents(): string[][];
```

Defined in: [packages/nexus-agents/src/observability/interaction-graph.ts:122](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/interaction-graph.ts#L122)

Find strongly connected components using Kosaraju's algorithm.

###### Returns

`string`[][]

###### Implementation of

[`InteractionGraph`](#interactiongraph).[`getStronglyConnectedComponents`](#getstronglyconnectedcomponents-1)

---

### InteractionSwarmObserver

Defined in: [packages/nexus-agents/src/observability/swarm-observer.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer.ts#L53)

SwarmObserver implementation.

#### Implements

- [`IInteractionObserver`](#iinteractionobserver)

#### Constructors

##### Constructor

```ts
new InteractionSwarmObserver(config?): InteractionSwarmObserver;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer.ts#L61)

###### Parameters

###### config?

`Partial`\<[`InteractionObserverConfig`](#interactionobserverconfig)\>

###### Returns

[`InteractionSwarmObserver`](#interactionswarmobserver)

#### Methods

##### attributeSuccess()

```ts
attributeSuccess(taskId): Map<string, ContributionScore>;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer.ts:180](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer.ts#L180)

Attribute success of a task to contributing agents.

###### Parameters

###### taskId

`string`

###### Returns

`Map`\<`string`, [`ContributionScore`](#contributionscore)\>

###### Implementation of

[`IInteractionObserver`](#iinteractionobserver).[`attributeSuccess`](#attributesuccess-1)

##### clear()

```ts
clear(): void;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer.ts:256](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer.ts#L256)

Clear all recorded data.

###### Returns

`void`

###### Implementation of

[`IInteractionObserver`](#iinteractionobserver).[`clear`](#clear-3)

##### getBottlenecks()

```ts
getBottlenecks(): BottleneckInfo[];
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer.ts:125](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer.ts#L125)

Identify bottleneck agents.

###### Returns

[`BottleneckInfo`](#bottleneckinfo)[]

###### Implementation of

[`IInteractionObserver`](#iinteractionobserver).[`getBottlenecks`](#getbottlenecks-1)

##### getCollaborationGraph()

```ts
getCollaborationGraph(): InteractionGraph;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer.ts:118](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer.ts#L118)

Get the collaboration graph.

###### Returns

[`InteractionGraph`](#interactiongraph)

###### Implementation of

[`IInteractionObserver`](#iinteractionobserver).[`getCollaborationGraph`](#getcollaborationgraph-1)

##### getEmergentClusters()

```ts
getEmergentClusters(): AgentCluster[];
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer.ts:152](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer.ts#L152)

Detect emergent clusters of collaborating agents.
Uses strongly connected components + cohesion analysis.

###### Returns

[`AgentCluster`](#agentcluster)[]

###### Implementation of

[`IInteractionObserver`](#iinteractionobserver).[`getEmergentClusters`](#getemergentclusters-1)

##### getEventsByAgent()

```ts
getEventsByAgent(agentId): AgentEvent[];
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer.ts:237](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer.ts#L237)

Get events for a specific agent.

###### Parameters

###### agentId

`string`

###### Returns

[`AgentEvent`](#agentevent)[]

###### Implementation of

[`IInteractionObserver`](#iinteractionobserver).[`getEventsByAgent`](#geteventsbyagent-1)

##### getEventsByTrace()

```ts
getEventsByTrace(traceId): AgentEvent[];
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer.ts:230](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer.ts#L230)

Get events for a specific trace.

###### Parameters

###### traceId

`string`

###### Returns

[`AgentEvent`](#agentevent)[]

###### Implementation of

[`IInteractionObserver`](#iinteractionobserver).[`getEventsByTrace`](#geteventsbytrace-1)

##### getHealthMetrics()

```ts
getHealthMetrics(): SwarmHealthMetrics;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer.ts:201](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer.ts#L201)

Get swarm health metrics.

###### Returns

[`SwarmHealthMetrics`](#swarmhealthmetrics)

###### Implementation of

[`IInteractionObserver`](#iinteractionobserver).[`getHealthMetrics`](#gethealthmetrics-1)

##### recordEvent()

```ts
recordEvent(event): void;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer.ts#L86)

Record an agent event.

###### Parameters

###### event

[`AgentEvent`](#agentevent)

###### Returns

`void`

###### Implementation of

[`IInteractionObserver`](#iinteractionobserver).[`recordEvent`](#recordevent-1)

##### recordInteraction()

```ts
recordInteraction(options): void;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer.ts#L97)

Record an interaction between two agents.

###### Parameters

###### options

[`RecordInteractionOptions`](#recordinteractionoptions)

###### Returns

`void`

###### Implementation of

[`IInteractionObserver`](#iinteractionobserver).[`recordInteraction`](#recordinteraction-1)

##### registerAgentForTask()

```ts
registerAgentForTask(taskId, agentId): void;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer.ts:244](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer.ts#L244)

Associate an agent with a task for attribution.

###### Parameters

###### taskId

`string`

###### agentId

`string`

###### Returns

`void`

##### generateSpanId()

```ts
static generateSpanId(): string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer.ts#L79)

Generate OpenTelemetry-compatible span ID (16 hex chars).

###### Returns

`string`

##### generateTraceId()

```ts
static generateTraceId(): string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer.ts#L72)

Generate OpenTelemetry-compatible trace ID (32 hex chars).

###### Returns

`string`

---

### JsonDashboardRenderer

Defined in: [packages/nexus-agents/src/observability/dashboard-renderer.ts:250](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-renderer.ts#L250)

JSON dashboard renderer for programmatic consumption.

#### Implements

- [`IDashboardRenderer`](#idashboardrenderer)

#### Constructors

##### Constructor

```ts
new JsonDashboardRenderer(): JsonDashboardRenderer;
```

###### Returns

[`JsonDashboardRenderer`](#jsondashboardrenderer)

#### Methods

##### render()

```ts
render(snapshot): string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-renderer.ts:251](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-renderer.ts#L251)

Render the dashboard snapshot to the configured format.

###### Parameters

###### snapshot

[`DashboardSnapshot`](#dashboardsnapshot)

###### Returns

`string`

###### Implementation of

[`IDashboardRenderer`](#idashboardrenderer).[`render`](#render-5)

##### renderActivity()

```ts
renderActivity(activity): string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-renderer.ts:267](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-renderer.ts#L267)

Render the activity feed.

###### Parameters

###### activity

[`ActivityItem`](#activityitem)[]

###### Returns

`string`

###### Implementation of

[`IDashboardRenderer`](#idashboardrenderer).[`renderActivity`](#renderactivity-3)

##### renderAgents()

```ts
renderAgents(agents): string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-renderer.ts:259](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-renderer.ts#L259)

Render the agent status table.

###### Parameters

###### agents

[`AgentStatus`](#agentstatus)[]

###### Returns

`string`

###### Implementation of

[`IDashboardRenderer`](#idashboardrenderer).[`renderAgents`](#renderagents-3)

##### renderBottlenecks()

```ts
renderBottlenecks(bottlenecks): string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-renderer.ts:271](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-renderer.ts#L271)

Render bottleneck warnings.

###### Parameters

###### bottlenecks

[`BottleneckInfo`](#bottleneckinfo)[]

###### Returns

`string`

###### Implementation of

[`IDashboardRenderer`](#idashboardrenderer).[`renderBottlenecks`](#renderbottlenecks-3)

##### renderClusters()

```ts
renderClusters(clusters): string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-renderer.ts:275](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-renderer.ts#L275)

Render cluster analysis.

###### Parameters

###### clusters

[`AgentCluster`](#agentcluster)[]

###### Returns

`string`

###### Implementation of

[`IDashboardRenderer`](#idashboardrenderer).[`renderClusters`](#renderclusters-3)

##### renderGraph()

```ts
renderGraph(graph): string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-renderer.ts:263](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-renderer.ts#L263)

Render the interaction graph.

###### Parameters

###### graph

[`GraphSummary`](#graphsummary)

###### Returns

`string`

###### Implementation of

[`IDashboardRenderer`](#idashboardrenderer).[`renderGraph`](#rendergraph-3)

##### renderHealth()

```ts
renderHealth(health): string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-renderer.ts:255](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-renderer.ts#L255)

Render just the health section.

###### Parameters

###### health

[`SwarmHealthMetrics`](#swarmhealthmetrics)

###### Returns

`string`

###### Implementation of

[`IDashboardRenderer`](#idashboardrenderer).[`renderHealth`](#renderhealth-3)

---

### RoutingMetricsCollector

Defined in: [packages/nexus-agents/src/observability/routing-metrics.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics.ts#L60)

Collects routing decisions and outcomes to compute effectiveness metrics.

#### Constructors

##### Constructor

```ts
new RoutingMetricsCollector(config?): RoutingMetricsCollector;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics.ts#L65)

###### Parameters

###### config?

`Partial`\<[`RoutingMetricsConfig`](#routingmetricsconfig)\>

###### Returns

[`RoutingMetricsCollector`](#routingmetricscollector)

#### Methods

##### getMetrics()

```ts
getMetrics(periodHours?): RoutingMetrics;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics.ts:104](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics.ts#L104)

Get routing metrics for a time period.

###### Parameters

###### periodHours?

`number` = `24`

###### Returns

[`RoutingMetrics`](#routingmetrics)

##### recordDecision()

```ts
recordDecision(record): void;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics.ts#L76)

Record a routing decision.

###### Parameters

###### record

[`RoutingRecord`](#routingrecord)

###### Returns

`void`

##### recordOutcome()

```ts
recordOutcome(record): void;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics.ts:90](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics.ts#L90)

Record an outcome for a routing decision.

###### Parameters

###### record

[`OutcomeRecord`](#outcomerecord)

###### Returns

`void`

##### renderDashboard()

```ts
renderDashboard(config?): string;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics.ts:152](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics.ts#L152)

Generate ASCII dashboard output.

###### Parameters

###### config?

`Partial`\<[`RoutingDashboardConfig`](#routingdashboardconfig)\>

###### Returns

`string`

##### reset()

```ts
reset(): void;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics.ts:182](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics.ts#L182)

Clear all collected data.

###### Returns

`void`

##### toJSON()

```ts
toJSON(periodHours?): string;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics.ts:175](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics.ts#L175)

Get metrics as JSON for machine-readable output.

###### Parameters

###### periodHours?

`number` = `24`

###### Returns

`string`

---

### TextDashboardRenderer

Defined in: [packages/nexus-agents/src/observability/dashboard-renderer.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-renderer.ts#L24)

Text-based dashboard renderer for terminal output.

#### Implements

- [`IDashboardRenderer`](#idashboardrenderer)

#### Constructors

##### Constructor

```ts
new TextDashboardRenderer(config): TextDashboardRenderer;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-renderer.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-renderer.ts#L27)

###### Parameters

###### config

[`DashboardConfig`](#dashboardconfig)

###### Returns

[`TextDashboardRenderer`](#textdashboardrenderer)

#### Methods

##### render()

```ts
render(snapshot): string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-renderer.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-renderer.ts#L31)

Render the dashboard snapshot to the configured format.

###### Parameters

###### snapshot

[`DashboardSnapshot`](#dashboardsnapshot)

###### Returns

`string`

###### Implementation of

[`IDashboardRenderer`](#idashboardrenderer).[`render`](#render-5)

##### renderActivity()

```ts
renderActivity(activity): string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-renderer.ts:146](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-renderer.ts#L146)

Render the activity feed.

###### Parameters

###### activity

[`ActivityItem`](#activityitem)[]

###### Returns

`string`

###### Implementation of

[`IDashboardRenderer`](#idashboardrenderer).[`renderActivity`](#renderactivity-3)

##### renderAgents()

```ts
renderAgents(agents): string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-renderer.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-renderer.ts#L79)

Render the agent status table.

###### Parameters

###### agents

[`AgentStatus`](#agentstatus)[]

###### Returns

`string`

###### Implementation of

[`IDashboardRenderer`](#idashboardrenderer).[`renderAgents`](#renderagents-3)

##### renderBottlenecks()

```ts
renderBottlenecks(bottlenecks): string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-renderer.ts:172](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-renderer.ts#L172)

Render bottleneck warnings.

###### Parameters

###### bottlenecks

[`BottleneckInfo`](#bottleneckinfo)[]

###### Returns

`string`

###### Implementation of

[`IDashboardRenderer`](#idashboardrenderer).[`renderBottlenecks`](#renderbottlenecks-3)

##### renderClusters()

```ts
renderClusters(clusters): string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-renderer.ts:189](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-renderer.ts#L189)

Render cluster analysis.

###### Parameters

###### clusters

[`AgentCluster`](#agentcluster)[]

###### Returns

`string`

###### Implementation of

[`IDashboardRenderer`](#idashboardrenderer).[`renderClusters`](#renderclusters-3)

##### renderGraph()

```ts
renderGraph(graph): string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-renderer.ts:112](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-renderer.ts#L112)

Render the interaction graph.

###### Parameters

###### graph

[`GraphSummary`](#graphsummary)

###### Returns

`string`

###### Implementation of

[`IDashboardRenderer`](#idashboardrenderer).[`renderGraph`](#rendergraph-3)

##### renderHealth()

```ts
renderHealth(health): string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-renderer.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-renderer.ts#L61)

Render just the health section.

###### Parameters

###### health

[`SwarmHealthMetrics`](#swarmhealthmetrics)

###### Returns

`string`

###### Implementation of

[`IDashboardRenderer`](#idashboardrenderer).[`renderHealth`](#renderhealth-3)

---

### ValidationDashboard

Defined in: [packages/nexus-agents/src/observability/validation-dashboard.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard.ts#L75)

Validation Dashboard implementation.

#### Constructors

##### Constructor

```ts
new ValidationDashboard(): ValidationDashboard;
```

###### Returns

[`ValidationDashboard`](#validationdashboard)

#### Methods

##### clear()

```ts
clear(): void;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard.ts:190](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard.ts#L190)

Clear all recorded data.

###### Returns

`void`

##### getSummary()

```ts
getSummary(filter?): DashboardSummary;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard.ts:112](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard.ts#L112)

Get dashboard summary with all metrics.

###### Parameters

###### filter?

[`DashboardFilter`](#dashboardfilter) = `{}`

###### Returns

[`DashboardSummary`](#dashboardsummary)

##### recordExplorationRate()

```ts
recordExplorationRate(rate): void;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard.ts:89](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard.ts#L89)

Record exploration rate snapshot.

###### Parameters

###### rate

`number`

###### Returns

`void`

##### recordFeatureWeights()

```ts
recordFeatureWeights(weights): void;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard.ts#L97)

Record feature weights for importance tracking.

###### Parameters

###### weights

`Record`\<`string`, `number`\>

###### Returns

`void`

##### recordOutcome()

```ts
recordOutcome(outcome): void;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard.ts#L81)

Record an outcome for dashboard aggregation. Evicts oldest when cap reached.

###### Parameters

###### outcome

[`DashboardOutcome`](#dashboardoutcome)

###### Returns

`void`

##### renderDashboard()

```ts
renderDashboard(filter?, options?): string;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard.ts:162](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard.ts#L162)

Render dashboard as ASCII text.

###### Parameters

###### filter?

[`DashboardFilter`](#dashboardfilter) = `{}`

###### options?

[`DashboardRenderOptions`](#dashboardrenderoptions) = `{}`

###### Returns

`string`

## Interfaces

### ActivityItem

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:118](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L118)

Activity feed item.

#### Properties

##### agentId

```ts
readonly agentId: string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:120](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L120)

##### eventType

```ts
readonly eventType: EventType;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:121](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L121)

##### severity

```ts
readonly severity: "error" | "info" | "warning";
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:123](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L123)

##### summary

```ts
readonly summary: string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:122](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L122)

##### timestamp

```ts
readonly timestamp: string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:119](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L119)

##### traceId

```ts
readonly traceId: string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:124](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L124)

---

### AgentCluster

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:156](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L156)

Cluster of agents that work together frequently.

#### Properties

##### agents

```ts
readonly agents: string[];
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:160](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L160)

Agents in this cluster

##### clusterId

```ts
readonly clusterId: string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:158](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L158)

Cluster identifier

##### cohesion

```ts
readonly cohesion: number;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:162](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L162)

Cohesion score (0-1, higher = tighter cluster)

##### dominantPattern?

```ts
readonly optional dominantPattern?: string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:168](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L168)

Dominant interaction pattern

##### externalInteractions

```ts
readonly externalInteractions: number;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:166](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L166)

Number of interactions with external agents

##### internalInteractions

```ts
readonly internalInteractions: number;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:164](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L164)

Number of interactions within cluster

---

### AgentEvent

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L58)

Core event emitted by agents for observation.

#### Properties

##### agentId

```ts
readonly agentId: string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L64)

Agent that emitted the event

##### durationMs?

```ts
readonly optional durationMs?: number;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L76)

Duration in milliseconds (for completed events)

##### eventId

```ts
readonly eventId: string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L60)

Event ID for deduplication

##### eventType

```ts
readonly eventType: EventType;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L66)

Type of event

##### parentSpanId?

```ts
readonly optional parentSpanId?: string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L72)

Parent span ID for hierarchical tracing

##### payload

```ts
readonly payload: EventPayload;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L74)

Event-specific payload

##### spanId

```ts
readonly spanId: string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L70)

OpenTelemetry span ID

##### timestamp

```ts
readonly timestamp: string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L62)

ISO timestamp when event occurred

##### traceId

```ts
readonly traceId: string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L68)

OpenTelemetry trace ID for correlation

---

### AgentStatus

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L81)

Agent status for dashboard display.

#### Properties

##### agentId

```ts
readonly agentId: string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:82](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L82)

##### errorCount

```ts
readonly errorCount: number;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:88](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L88)

##### isBottleneck

```ts
readonly isBottleneck: boolean;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:89](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L89)

##### lastActivity

```ts
readonly lastActivity: string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:84](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L84)

##### messagesReceived

```ts
readonly messagesReceived: number;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L86)

##### messagesSent

```ts
readonly messagesSent: number;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:85](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L85)

##### state

```ts
readonly state: SwarmAgentState;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:83](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L83)

##### toolsInvoked

```ts
readonly toolsInvoked: number;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:87](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L87)

---

### BottleneckInfo

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:141](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L141)

Bottleneck information for an agent.

#### Properties

##### agentId

```ts
readonly agentId: string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:142](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L142)

##### avgWaitTimeMs

```ts
readonly avgWaitTimeMs: number;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:146](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L146)

Average time messages wait

##### blockedAgents

```ts
readonly blockedAgents: number;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:148](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L148)

Number of agents blocked waiting

##### queuedMessages

```ts
readonly queuedMessages: number;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:144](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L144)

Messages waiting to be processed

##### severity

```ts
readonly severity: "critical" | "high" | "low" | "medium";
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:150](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L150)

Severity level

---

### ConsensusStats

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:136](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L136)

Consensus voting statistics tracked by observer.
(Source: Issue #552 - Wire up consensus event handlers)

#### Properties

##### consensusReached

```ts
consensusReached: number;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:142](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L142)

Consensus decisions reached

##### decisions

```ts
decisions: {
  abstained: number;
  approved: number;
  rejected: number;
}
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:144](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L144)

Approvals vs rejections

###### abstained

```ts
abstained: number;
```

###### approved

```ts
approved: number;
```

###### rejected

```ts
rejected: number;
```

##### unanimityRate

```ts
unanimityRate: number;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:150](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L150)

Unanimity rate (0-1)

##### votesCast

```ts
votesCast: number;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:140](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L140)

Total votes cast

##### votesRequested

```ts
votesRequested: number;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:138](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L138)

Total votes requested

---

### ContributionScore

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:122](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L122)

Contribution score for a single agent to a task.

#### Properties

##### activeTimeMs

```ts
readonly activeTimeMs: number;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:131](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L131)

Time spent actively working (ms)

##### agentId

```ts
readonly agentId: string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:123](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L123)

##### errorCount

```ts
readonly errorCount: number;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:135](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L135)

Number of errors encountered

##### messagesReceived

```ts
readonly messagesReceived: number;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:129](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L129)

Number of messages received

##### messagesSent

```ts
readonly messagesSent: number;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:127](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L127)

Number of messages sent

##### score

```ts
readonly score: number;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:125](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L125)

Overall contribution score (0-1)

##### successfulTools

```ts
readonly successfulTools: number;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:133](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L133)

Number of successful tool invocations

---

### DashboardConfig

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L31)

Dashboard configuration options.

#### Properties

##### format

```ts
readonly format: DashboardFormat;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L33)

Output format

##### maxAgentsShown

```ts
readonly maxAgentsShown: number;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L35)

Maximum agents to show in summary

##### maxEventsShown

```ts
readonly maxEventsShown: number;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L37)

Maximum events to show in activity feed

##### showBottlenecks

```ts
readonly showBottlenecks: boolean;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L41)

Whether to show bottleneck warnings

##### showClusters

```ts
readonly showClusters: boolean;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L43)

Whether to show cluster analysis

##### showContributions

```ts
readonly showContributions: boolean;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L45)

Whether to show contribution scores

##### showGraph

```ts
readonly showGraph: boolean;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L39)

Whether to show interaction graph

##### timeWindowMs

```ts
readonly timeWindowMs: number;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L47)

Time window for recent activity (ms)

---

### DashboardFilter

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:123](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L123)

Dashboard filter options.

#### Properties

##### minSampleSize?

```ts
readonly optional minSampleSize?: number;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:131](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L131)

Minimum sample size for inclusion

##### models?

```ts
readonly optional models?: readonly string[];
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:127](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L127)

Filter to specific models

##### period?

```ts
readonly optional period?: TimePeriod;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:125](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L125)

Time period

##### taskTypes?

```ts
readonly optional taskTypes?: readonly string[];
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:129](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L129)

Filter to specific task types

---

### DashboardHealthIndicators

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:105](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L105)

Dashboard health indicators.

#### Properties

##### hasMinimumData

```ts
readonly hasMinimumData: boolean;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:107](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L107)

Whether we have enough data for statistical inference

##### healthScore

```ts
readonly healthScore: number;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:115](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L115)

Overall health score (0-1)

##### healthyExploration

```ts
readonly healthyExploration: boolean;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:111](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L111)

Whether exploration rate is in healthy range (10-20%)

##### isLearning

```ts
readonly isLearning: boolean;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:109](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L109)

Whether learning is progressing (regret decreasing)

##### noUnderperformers

```ts
readonly noUnderperformers: boolean;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:113](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L113)

Whether any model is significantly underperforming

##### warnings

```ts
readonly warnings: readonly string[];
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:117](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L117)

Warning messages

---

### DashboardOutcome

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:164](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L164)

Outcome record for dashboard aggregation.

#### Properties

##### allModelRewards?

```ts
readonly optional allModelRewards?: Record<string, number>;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:172](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L172)

##### latencyMs

```ts
readonly latencyMs: number;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:169](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L169)

##### model

```ts
readonly model: string;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:165](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L165)

##### reward

```ts
readonly reward: number;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:168](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L168)

##### success

```ts
readonly success: boolean;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:167](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L167)

##### taskType

```ts
readonly taskType: string;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:166](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L166)

##### timestamp

```ts
readonly timestamp: number;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:171](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L171)

##### tokensUsed

```ts
readonly tokensUsed: number;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:170](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L170)

---

### DashboardRenderOptions

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:137](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L137)

ASCII dashboard render options.

#### Properties

##### maxWidth?

```ts
readonly optional maxWidth?: number;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:147](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L147)

Maximum width in characters

##### showConfidenceIntervals?

```ts
readonly optional showConfidenceIntervals?: boolean;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:139](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L139)

Show confidence intervals

##### showFeatureImportance?

```ts
readonly optional showFeatureImportance?: boolean;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:145](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L145)

Show feature importance

##### showLearningProgress?

```ts
readonly optional showLearningProgress?: boolean;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:143](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L143)

Show learning progress

##### showTaskTypes?

```ts
readonly optional showTaskTypes?: boolean;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:141](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L141)

Show task type breakdown

---

### DashboardSnapshot

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:130](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L130)

Complete dashboard snapshot.

#### Properties

##### activeTraces

```ts
readonly activeTraces: string[];
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:148](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L148)

Active traces

##### activity

```ts
readonly activity: ActivityItem[];
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:140](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L140)

Recent activity feed

##### agents

```ts
readonly agents: AgentStatus[];
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:136](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L136)

Individual agent statuses

##### bottlenecks

```ts
readonly bottlenecks: BottleneckInfo[];
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:142](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L142)

Current bottlenecks

##### clusters

```ts
readonly clusters: AgentCluster[];
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:144](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L144)

Detected clusters

##### contributions

```ts
readonly contributions: ContributionScore[];
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:146](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L146)

Top contributors (if task context)

##### graph

```ts
readonly graph: GraphSummary;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:138](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L138)

Interaction graph summary

##### health

```ts
readonly health: SwarmHealthMetrics;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:134](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L134)

Swarm health summary

##### timestamp

```ts
readonly timestamp: string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:132](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L132)

Snapshot timestamp

---

### DashboardSummary

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:78](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L78)

Dashboard summary.

#### Properties

##### healthIndicators

```ts
readonly healthIndicators: DashboardHealthIndicators;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:99](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L99)

Health indicators

##### learningProgress

```ts
readonly learningProgress: LearningProgress;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L97)

Learning progress metrics

##### modelPerformance

```ts
readonly modelPerformance: readonly ModelPerformanceSummary[];
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L93)

Model performance summaries

##### overallAvgReward

```ts
readonly overallAvgReward: number;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:91](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L91)

Overall average reward

##### overallSuccessRate

```ts
readonly overallSuccessRate: number;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:88](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L88)

Overall success rate

##### overallSuccessRateCI

```ts
readonly overallSuccessRateCI: ConfidenceInterval;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:89](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L89)

##### period

```ts
readonly period: TimePeriod;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:80](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L80)

Period covered

##### periodEnd

```ts
readonly periodEnd: string;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:82](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L82)

##### periodStart

```ts
readonly periodStart: string;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:81](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L81)

##### taskTypePerformance

```ts
readonly taskTypePerformance: readonly TaskTypePerformance[];
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L95)

Task type breakdown

##### totalDecisions

```ts
readonly totalDecisions: number;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:84](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L84)

Total decisions in period

##### totalOutcomes

```ts
readonly totalOutcomes: number;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L86)

Total outcomes recorded

---

### DashboardUpdateOptions

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:154](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L154)

Partial dashboard options for selective updates.

#### Properties

##### includeActivity?

```ts
readonly optional includeActivity?: boolean;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:158](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L158)

##### includeAgents?

```ts
readonly optional includeAgents?: boolean;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:156](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L156)

##### includeBottlenecks?

```ts
readonly optional includeBottlenecks?: boolean;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:159](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L159)

##### includeClusters?

```ts
readonly optional includeClusters?: boolean;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:160](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L160)

##### includeContributions?

```ts
readonly optional includeContributions?: boolean;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:161](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L161)

##### includeGraph?

```ts
readonly optional includeGraph?: boolean;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:157](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L157)

##### includeHealth?

```ts
readonly optional includeHealth?: boolean;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:155](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L155)

---

### ErrorPayload

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:83](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L83)

Payload for error events.

#### Properties

##### errorCode

```ts
readonly errorCode: string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:85](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L85)

##### errorMessage

```ts
readonly errorMessage: string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L86)

##### recoverable

```ts
readonly recoverable: boolean;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:88](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L88)

##### stack?

```ts
readonly optional stack?: string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:87](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L87)

##### type

```ts
readonly type: "error";
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:84](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L84)

---

### GraphEdgeDisplay

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L95)

Simplified edge for graph display.

#### Properties

##### avgLatencyMs

```ts
readonly avgLatencyMs: number;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:100](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L100)

##### count

```ts
readonly count: number;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L98)

##### from

```ts
readonly from: string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L96)

##### successRate

```ts
readonly successRate: number;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:99](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L99)

##### to

```ts
readonly to: string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L97)

---

### GraphStats

Defined in: [packages/nexus-agents/src/observability/interaction-graph.ts:260](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/interaction-graph.ts#L260)

Graph statistics.

#### Properties

##### avgLatencyMs

```ts
readonly avgLatencyMs: number;
```

Defined in: [packages/nexus-agents/src/observability/interaction-graph.ts:263](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/interaction-graph.ts#L263)

##### density

```ts
readonly density: number;
```

Defined in: [packages/nexus-agents/src/observability/interaction-graph.ts:265](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/interaction-graph.ts#L265)

##### edgeCount

```ts
readonly edgeCount: number;
```

Defined in: [packages/nexus-agents/src/observability/interaction-graph.ts:262](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/interaction-graph.ts#L262)

##### nodeCount

```ts
readonly nodeCount: number;
```

Defined in: [packages/nexus-agents/src/observability/interaction-graph.ts:261](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/interaction-graph.ts#L261)

##### successRate

```ts
readonly successRate: number;
```

Defined in: [packages/nexus-agents/src/observability/interaction-graph.ts:264](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/interaction-graph.ts#L264)

---

### GraphSummary

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:106](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L106)

Graph summary for dashboard display.

#### Properties

##### centralAgents

```ts
readonly centralAgents: {
  agentId: string;
  centrality: number;
}[];
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:112](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L112)

###### agentId

```ts
agentId: string;
```

###### centrality

```ts
centrality: number;
```

##### density

```ts
readonly density: number;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:109](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L109)

##### edgeCount

```ts
readonly edgeCount: number;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:108](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L108)

##### nodeCount

```ts
readonly nodeCount: number;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:107](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L107)

##### stronglyConnectedComponents

```ts
readonly stronglyConnectedComponents: number;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:110](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L110)

##### topEdges

```ts
readonly topEdges: GraphEdgeDisplay[];
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:111](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L111)

---

### IDashboard

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:207](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L207)

Dashboard service interface.

#### Methods

##### getConfig()

```ts
getConfig(): DashboardConfig;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:221](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L221)

Get dashboard configuration.

###### Returns

[`DashboardConfig`](#dashboardconfig)

##### getSnapshot()

```ts
getSnapshot(options?): DashboardSnapshot;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:211](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L211)

Get current dashboard snapshot.

###### Parameters

###### options?

[`DashboardUpdateOptions`](#dashboardupdateoptions)

###### Returns

[`DashboardSnapshot`](#dashboardsnapshot)

##### render()

```ts
render(options?): string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:216](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L216)

Render dashboard to string in configured format.

###### Parameters

###### options?

[`DashboardUpdateOptions`](#dashboardupdateoptions)

###### Returns

`string`

##### subscribe()

```ts
subscribe(callback): () => void;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:231](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L231)

Subscribe to dashboard updates.

###### Parameters

###### callback

(`snapshot`) => `void`

###### Returns

() => `void`

##### updateConfig()

```ts
updateConfig(config): void;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:226](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L226)

Update dashboard configuration.

###### Parameters

###### config

`Partial`\<[`DashboardConfig`](#dashboardconfig)\>

###### Returns

`void`

---

### IDashboardRenderer

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:167](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L167)

Dashboard renderer interface.

#### Methods

##### render()

```ts
render(snapshot): string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:171](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L171)

Render the dashboard snapshot to the configured format.

###### Parameters

###### snapshot

[`DashboardSnapshot`](#dashboardsnapshot)

###### Returns

`string`

##### renderActivity()

```ts
renderActivity(activity): string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:191](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L191)

Render the activity feed.

###### Parameters

###### activity

[`ActivityItem`](#activityitem)[]

###### Returns

`string`

##### renderAgents()

```ts
renderAgents(agents): string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:181](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L181)

Render the agent status table.

###### Parameters

###### agents

[`AgentStatus`](#agentstatus)[]

###### Returns

`string`

##### renderBottlenecks()

```ts
renderBottlenecks(bottlenecks): string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:196](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L196)

Render bottleneck warnings.

###### Parameters

###### bottlenecks

[`BottleneckInfo`](#bottleneckinfo)[]

###### Returns

`string`

##### renderClusters()

```ts
renderClusters(clusters): string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:201](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L201)

Render cluster analysis.

###### Parameters

###### clusters

[`AgentCluster`](#agentcluster)[]

###### Returns

`string`

##### renderGraph()

```ts
renderGraph(graph): string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:186](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L186)

Render the interaction graph.

###### Parameters

###### graph

[`GraphSummary`](#graphsummary)

###### Returns

`string`

##### renderHealth()

```ts
renderHealth(health): string;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:176](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L176)

Render just the health section.

###### Parameters

###### health

[`SwarmHealthMetrics`](#swarmhealthmetrics)

###### Returns

`string`

---

### IInteractionObserver

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:198](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L198)

Interface for the SwarmObserver.

#### Methods

##### attributeSuccess()

```ts
attributeSuccess(taskId): Map<string, ContributionScore>;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:227](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L227)

Attribute success of a task to contributing agents.

###### Parameters

###### taskId

`string`

###### Returns

`Map`\<`string`, [`ContributionScore`](#contributionscore)\>

##### clear()

```ts
clear(): void;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:247](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L247)

Clear all recorded data.

###### Returns

`void`

##### getBottlenecks()

```ts
getBottlenecks(): BottleneckInfo[];
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:217](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L217)

Identify bottleneck agents.

###### Returns

[`BottleneckInfo`](#bottleneckinfo)[]

##### getCollaborationGraph()

```ts
getCollaborationGraph(): InteractionGraph;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:212](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L212)

Get the collaboration graph.

###### Returns

[`InteractionGraph`](#interactiongraph)

##### getEmergentClusters()

```ts
getEmergentClusters(): AgentCluster[];
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:222](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L222)

Detect emergent clusters of collaborating agents.

###### Returns

[`AgentCluster`](#agentcluster)[]

##### getEventsByAgent()

```ts
getEventsByAgent(agentId): AgentEvent[];
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:242](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L242)

Get events for a specific agent.

###### Parameters

###### agentId

`string`

###### Returns

[`AgentEvent`](#agentevent)[]

##### getEventsByTrace()

```ts
getEventsByTrace(traceId): AgentEvent[];
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:237](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L237)

Get events for a specific trace.

###### Parameters

###### traceId

`string`

###### Returns

[`AgentEvent`](#agentevent)[]

##### getHealthMetrics()

```ts
getHealthMetrics(): SwarmHealthMetrics;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:232](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L232)

Get swarm health metrics.

###### Returns

[`SwarmHealthMetrics`](#swarmhealthmetrics)

##### recordEvent()

```ts
recordEvent(event): void;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:202](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L202)

Record an agent event.

###### Parameters

###### event

[`AgentEvent`](#agentevent)

###### Returns

`void`

##### recordInteraction()

```ts
recordInteraction(options): void;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:207](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L207)

Record an interaction between two agents.

###### Parameters

###### options

[`RecordInteractionOptions`](#recordinteractionoptions)

###### Returns

`void`

---

### InteractionEdge

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:82](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L82)

Edge in the interaction graph representing a message/interaction.

#### Properties

##### durationMs?

```ts
readonly optional durationMs?: number;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L94)

Duration if applicable

##### from

```ts
readonly from: string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:84](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L84)

Source agent

##### interactionType

```ts
readonly interactionType: string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:88](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L88)

Type of interaction

##### outcome

```ts
readonly outcome: InteractionOutcome;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:92](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L92)

Outcome of interaction

##### timestamp

```ts
readonly timestamp: string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:90](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L90)

When interaction occurred

##### to

```ts
readonly to: string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L86)

Target agent

##### traceId

```ts
readonly traceId: string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L96)

Trace ID for correlation

##### weight

```ts
readonly weight: number;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:98](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L98)

Weight for graph algorithms (default 1)

---

### InteractionGraph

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:253](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L253)

Interface for the interaction graph.

#### Methods

##### addEdge()

```ts
addEdge(edge): void;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:262](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L262)

Add an edge (interaction) to the graph.

###### Parameters

###### edge

[`InteractionEdge`](#interactionedge)

###### Returns

`void`

##### addNode()

```ts
addNode(agentId): void;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:257](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L257)

Add a node (agent) to the graph.

###### Parameters

###### agentId

`string`

###### Returns

`void`

##### clear()

```ts
clear(): void;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:302](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L302)

Clear the graph.

###### Returns

`void`

##### getDegreeCentrality()

```ts
getDegreeCentrality(): Map<string, number>;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:287](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L287)

Calculate degree centrality for all nodes.

###### Returns

`Map`\<`string`, `number`\>

##### getEdgeCount()

```ts
getEdgeCount(from, to): number;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:297](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L297)

Get edge count between two agents.

###### Parameters

###### from

`string`

###### to

`string`

###### Returns

`number`

##### getEdges()

```ts
getEdges(): InteractionEdge[];
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:272](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L272)

Get all edges in the graph.

###### Returns

[`InteractionEdge`](#interactionedge)[]

##### getIncomingEdges()

```ts
getIncomingEdges(agentId): InteractionEdge[];
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:282](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L282)

Get edges to a specific agent.

###### Parameters

###### agentId

`string`

###### Returns

[`InteractionEdge`](#interactionedge)[]

##### getNodes()

```ts
getNodes(): string[];
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:267](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L267)

Get all nodes in the graph.

###### Returns

`string`[]

##### getOutgoingEdges()

```ts
getOutgoingEdges(agentId): InteractionEdge[];
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:277](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L277)

Get edges from a specific agent.

###### Parameters

###### agentId

`string`

###### Returns

[`InteractionEdge`](#interactionedge)[]

##### getStronglyConnectedComponents()

```ts
getStronglyConnectedComponents(): string[][];
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:292](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L292)

Find strongly connected components.

###### Returns

`string`[][]

---

### InteractionObserverConfig

Defined in: [packages/nexus-agents/src/observability/swarm-observer-core-types.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-core-types.ts#L62)

Configuration for the SwarmObserver.

#### Properties

##### bottleneckThreshold

```ts
readonly bottleneckThreshold: number;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-core-types.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-core-types.ts#L70)

Bottleneck threshold (queued messages)

##### cohesionThreshold

```ts
readonly cohesionThreshold: number;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-core-types.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-core-types.ts#L74)

Cohesion threshold for cluster detection

##### logPayloads

```ts
readonly logPayloads: boolean;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-core-types.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-core-types.ts#L68)

Enable detailed payload logging

##### maxEvents

```ts
readonly maxEvents: number;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-core-types.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-core-types.ts#L64)

Maximum events to keep in memory

##### metricsWindowMs

```ts
readonly metricsWindowMs: number;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-core-types.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-core-types.ts#L66)

Time window for metrics calculation (ms)

##### minClusterSize

```ts
readonly minClusterSize: number;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-core-types.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-core-types.ts#L72)

Minimum cluster size to detect

---

### IOrchestrationObserver

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:205](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L205)

OrchestrationObserver interface for dependency injection.

#### Methods

##### addEventListener()

```ts
addEventListener(listener): void;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:225](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L225)

Add event listener for visualization

###### Parameters

###### listener

[`OrchestrationObserverListener`](#orchestrationobserverlistener)

###### Returns

`void`

##### getAgentStates()

```ts
getAgentStates(): readonly ObserverTrackedAgent[];
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:213](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L213)

Get current agent states

###### Returns

readonly [`ObserverTrackedAgent`](#observertrackedagent)[]

##### getRoutingHistory()

```ts
getRoutingHistory(limit?): readonly ObserverRoutingDecision[];
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:216](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L216)

Get routing decision history

###### Parameters

###### limit?

`number`

###### Returns

readonly [`ObserverRoutingDecision`](#observerroutingdecision)[]

##### getSessionMetrics()

```ts
getSessionMetrics(sessionId?): readonly ObserverSessionMetrics[];
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:219](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L219)

Get session metrics

###### Parameters

###### sessionId?

`string`

###### Returns

readonly [`ObserverSessionMetrics`](#observersessionmetrics)[]

##### getStats()

```ts
getStats(): OrchestrationStats;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:222](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L222)

Get aggregate orchestration statistics

###### Returns

[`OrchestrationStats`](#orchestrationstats)

##### isActive()

```ts
isActive(): boolean;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:237](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L237)

Check if observer is active

###### Returns

`boolean`

##### recordRoutingDecision()

```ts
recordRoutingDecision(decision): void;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:231](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L231)

Record a routing decision manually (for non-event-bus integrations)

###### Parameters

###### decision

[`ObserverRoutingDecision`](#observerroutingdecision)

###### Returns

`void`

##### recordTokenUsage()

```ts
recordTokenUsage(
   sessionId,
   model,
   tokens): void;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:234](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L234)

Record token usage for a session

###### Parameters

###### sessionId

`string`

###### model

`"claude"` \| `"gemini"` \| `"codex"` \| `"opencode"`

###### tokens

[`ObserverTokenUsage`](#observertokenusage)

###### Returns

`void`

##### removeEventListener()

```ts
removeEventListener(listener): void;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:228](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L228)

Remove event listener

###### Parameters

###### listener

[`OrchestrationObserverListener`](#orchestrationobserverlistener)

###### Returns

`void`

##### start()

```ts
start(): void;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:207](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L207)

Start observing the event bus

###### Returns

`void`

##### stop()

```ts
stop(): void;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:210](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L210)

Stop observing and cleanup

###### Returns

`void`

---

### ITaskTracker

Defined in: [packages/nexus-agents/src/pipeline/task-tracker.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/task-tracker.ts#L48)

Task tracker interface — create, update, comment.

#### Methods

##### createTask()

```ts
createTask(title, body): Promise<TrackedTask>;
```

Defined in: [packages/nexus-agents/src/pipeline/task-tracker.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/task-tracker.ts#L49)

###### Parameters

###### title

`string`

###### body

`string`

###### Returns

`Promise`\<[`TrackedTask`](#trackedtask)\>

##### postComment()

```ts
postComment(taskId, comment): Promise<void>;
```

Defined in: [packages/nexus-agents/src/pipeline/task-tracker.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/task-tracker.ts#L51)

###### Parameters

###### taskId

`string`

###### comment

`string`

###### Returns

`Promise`\<`void`\>

##### updateStatus()

```ts
updateStatus(taskId, status): Promise<void>;
```

Defined in: [packages/nexus-agents/src/pipeline/task-tracker.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/task-tracker.ts#L50)

###### Parameters

###### taskId

`string`

###### status

`"open"` \| `"closed"` \| `"in_progress"`

###### Returns

`Promise`\<`void`\>

---

### LearningProgress

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L57)

Learning progress metrics.

#### Properties

##### avgRegret

```ts
readonly avgRegret: number;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L63)

##### convergenceScore

```ts
readonly convergenceScore: number;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L72)

Learning convergence metric (0-1, 1 = converged)

##### cumulativeRegret

```ts
readonly cumulativeRegret: number;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L62)

Cumulative regret

##### explorationRate

```ts
readonly explorationRate: number;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L59)

LinUCB exploration rate over time

##### explorationRateTrend

```ts
readonly explorationRateTrend: number;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L60)

##### featureImportance

```ts
readonly featureImportance: readonly {
  feature: string;
  importance: number;
}[];
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L67)

Feature importance ranking

##### optimalRate

```ts
readonly optimalRate: number;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L65)

Optimal decision rate

---

### MemoryPayload

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L61)

Payload for memory operation events.

#### Properties

##### key?

```ts
readonly optional key?: string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L65)

##### memoryType

```ts
readonly memoryType: string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L64)

##### operation

```ts
readonly operation: "write" | "read";
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L63)

##### sizeBytes?

```ts
readonly optional sizeBytes?: number;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L66)

##### type

```ts
readonly type: "memory";
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L62)

---

### MessagePayload

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L37)

Payload for message events.

#### Properties

##### contentPreview?

```ts
readonly optional contentPreview?: string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:44](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L44)

Truncated preview of message content

##### direction

```ts
readonly direction: "received" | "sent";
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L39)

##### messageType

```ts
readonly messageType: string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:42](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L42)

##### sourceAgentId?

```ts
readonly optional sourceAgentId?: string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L41)

##### targetAgentId?

```ts
readonly optional targetAgentId?: string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L40)

##### type

```ts
readonly type: "message";
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L38)

---

### ModelMetrics

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L48)

Aggregated metrics for a single model.

#### Properties

##### avgLatencyMs

```ts
readonly avgLatencyMs: number;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L54)

##### avgQuality

```ts
readonly avgQuality: number;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L53)

##### avgReward

```ts
readonly avgReward: number;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L52)

##### explorationCount

```ts
readonly explorationCount: number;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:56](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L56)

##### model

```ts
readonly model: "claude" | "gemini" | "codex" | "opencode";
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L49)

##### selectionCount

```ts
readonly selectionCount: number;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L50)

##### selectionPercent

```ts
readonly selectionPercent: number;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L51)

##### successRate

```ts
readonly successRate: number;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L55)

---

### ModelPerformanceSummary

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:20](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L20)

Model performance summary with confidence intervals.

#### Properties

##### avgLatencyMs

```ts
readonly avgLatencyMs: number;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L32)

Average latency in milliseconds

##### avgReward

```ts
readonly avgReward: number;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L29)

Average reward with distribution stats

##### costEfficiency

```ts
readonly costEfficiency: number;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L37)

Cost efficiency (reward per token)

##### model

```ts
readonly model: string;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L22)

Model/CLI name

##### n

```ts
readonly n: number;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L24)

Number of routing decisions

##### rewardStats

```ts
readonly rewardStats: DistributionStats;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L30)

##### successRate

```ts
readonly successRate: number;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L26)

Success rate with confidence interval

##### successRateCI

```ts
readonly successRateCI: ConfidenceInterval;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L27)

##### winRate

```ts
readonly winRate: number;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L34)

Win rate vs other models

##### winRateCI

```ts
readonly winRateCI: ConfidenceInterval;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L35)

---

### ObserverCostMetrics

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:78](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L78)

Cost tracking per session.

#### Properties

##### costPerModel

```ts
costPerModel: Map<'claude' | 'gemini' | 'codex' | 'opencode', number>;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:80](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L80)

##### totalCostUsd

```ts
totalCostUsd: number;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L79)

---

### ObserverRoutingDecision

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L47)

Captured routing decision for audit and analysis.

#### Properties

##### alternatives

```ts
readonly alternatives: readonly ("claude" | "gemini" | "codex" | "opencode")[];
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L54)

##### confidence

```ts
readonly confidence: number;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L52)

##### decisionTimeMs

```ts
readonly decisionTimeMs: number;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:56](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L56)

##### reason

```ts
readonly reason: string;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L53)

##### selectedCli

```ts
readonly selectedCli: "claude" | "gemini" | "codex" | "opencode";
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L51)

##### stagesExecuted

```ts
readonly stagesExecuted: readonly string[];
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L55)

##### taskDescription

```ts
readonly taskDescription: string;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L50)

##### taskId

```ts
readonly taskId: string;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L49)

##### timestamp

```ts
readonly timestamp: string;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L48)

##### topsisScore?

```ts
readonly optional topsisScore?: number;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:58](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L58)

##### ucbScore?

```ts
readonly optional ucbScore?: number;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:59](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L59)

##### withinBudget?

```ts
readonly optional withinBudget?: boolean;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L57)

---

### ObserverSessionMetrics

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:86](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L86)

Session-level metrics.

#### Properties

##### completedAt?

```ts
optional completedAt?: string;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:89](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L89)

##### costMetrics

```ts
costMetrics: ObserverCostMetrics;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:95](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L95)

##### durationMs

```ts
durationMs: number;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:90](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L90)

##### eventsProcessed

```ts
eventsProcessed: number;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:97](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L97)

##### failureCount

```ts
failureCount: number;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:93](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L93)

##### routingDecisions

```ts
routingDecisions: number;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:96](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L96)

##### sessionId

```ts
readonly sessionId: string;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:87](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L87)

##### startedAt

```ts
startedAt: string;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:88](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L88)

##### successCount

```ts
successCount: number;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:92](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L92)

##### taskCount

```ts
taskCount: number;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:91](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L91)

##### tokenUsage

```ts
tokenUsage: ObserverTokenUsage;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:94](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L94)

---

### ObserverTokenUsage

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L69)

Token usage tracking per model.

#### Properties

##### inputTokens

```ts
inputTokens: number;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:70](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L70)

##### outputTokens

```ts
outputTokens: number;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:71](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L71)

##### totalTokens

```ts
totalTokens: number;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L72)

---

### ObserverTrackedAgent

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L30)

Tracked agent information.

#### Properties

##### currentTask?

```ts
optional currentTask?: string;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L34)

##### errorCount

```ts
errorCount: number;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L37)

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L31)

##### lastUpdated

```ts
lastUpdated: string;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L35)

##### role

```ts
readonly role: string;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L32)

##### state

```ts
state: 'error' | 'thinking' | 'idle' | 'waiting' | 'executing';
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L33)

##### taskCount

```ts
taskCount: number;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L36)

---

### OrchestrationStats

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:107](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L107)

Aggregate orchestration statistics.

#### Properties

##### activeSessions

```ts
activeSessions: number;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:111](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L111)

Currently active sessions

##### avgTaskDurationMs

```ts
avgTaskDurationMs: number;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:117](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L117)

Average task duration in ms

##### consensus

```ts
consensus: ConsensusStats;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:129](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L129)

Consensus voting statistics (Issue #552)

##### eventsProcessed

```ts
eventsProcessed: number;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:125](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L125)

Events processed

##### routingDistribution

```ts
routingDistribution: Record<CliName, number>;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:119](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L119)

Routing decisions per CLI

##### successRate

```ts
successRate: number;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:115](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L115)

Success rate (0-1)

##### totalCostUsd

```ts
totalCostUsd: number;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:123](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L123)

Total cost (estimated)

##### totalSessions

```ts
totalSessions: number;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:109](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L109)

Total sessions observed

##### totalTasks

```ts
totalTasks: number;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:113](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L113)

Total tasks processed

##### totalTokens

```ts
totalTokens: number;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:121](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L121)

Total tokens used

##### uptimeMs

```ts
uptimeMs: number;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:127](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L127)

Observer uptime in ms

---

### OutcomeRecord

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L33)

Outcome record for a routing decision.

#### Properties

##### latencyMs?

```ts
readonly optional latencyMs?: number;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:40](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L40)

##### model

```ts
readonly model: "claude" | "gemini" | "codex" | "opencode";
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:36](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L36)

##### qualityScore?

```ts
readonly optional qualityScore?: number;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:39](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L39)

##### reward

```ts
readonly reward: number;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:38](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L38)

##### success

```ts
readonly success: boolean;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L37)

##### timestamp

```ts
readonly timestamp: string;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:34](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L34)

##### traceId

```ts
readonly traceId: string;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:35](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L35)

---

### RecordInteractionOptions

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:104](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L104)

Options for recording an interaction.

#### Properties

##### durationMs?

```ts
readonly optional durationMs?: number;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:116](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L116)

Duration in milliseconds

##### from

```ts
readonly from: string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:106](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L106)

Source agent

##### interactionType

```ts
readonly interactionType: string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:110](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L110)

Type of interaction

##### outcome

```ts
readonly outcome: InteractionOutcome;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:112](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L112)

Outcome of interaction

##### to

```ts
readonly to: string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:108](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L108)

Target agent

##### traceId

```ts
readonly traceId: string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:114](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L114)

Trace ID for correlation

---

### RoutingDashboardConfig

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L77)

Dashboard rendering configuration.

#### Properties

##### periodHours

```ts
readonly periodHours: number;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:80](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L80)

##### showTrends

```ts
readonly showTrends: boolean;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:79](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L79)

##### width

```ts
readonly width: number;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:78](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L78)

---

### RoutingMetrics

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:60](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L60)

Overall routing metrics.

#### Properties

##### avgReward

```ts
readonly avgReward: number;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L67)

##### avgRewardTrend

```ts
readonly avgRewardTrend: number;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:68](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L68)

##### avgRoutingLatencyMs

```ts
readonly avgRoutingLatencyMs: number;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:69](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L69)

##### explorationRate

```ts
readonly explorationRate: number;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:66](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L66)

##### modelMetrics

```ts
readonly modelMetrics: readonly ModelMetrics[];
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:65](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L65)

##### periodEnd

```ts
readonly periodEnd: string;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L62)

##### periodStart

```ts
readonly periodStart: string;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:61](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L61)

##### totalDecisions

```ts
readonly totalDecisions: number;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:63](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L63)

##### totalOutcomes

```ts
readonly totalOutcomes: number;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:64](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L64)

---

### RoutingMetricsConfig

Defined in: [packages/nexus-agents/src/observability/routing-metrics.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics.ts#L47)

Configuration for the metrics collector.

#### Properties

##### maxRecords

```ts
readonly maxRecords: number;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics.ts:48](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics.ts#L48)

##### retentionHours

```ts
readonly retentionHours: number;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics.ts#L49)

---

### RoutingRecord

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:20](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L20)

Individual routing decision record.

#### Properties

##### alternativeModels

```ts
readonly alternativeModels: readonly ("claude" | "gemini" | "codex" | "opencode")[];
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:24](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L24)

##### contextTokens?

```ts
readonly optional contextTokens?: number;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L27)

##### isExploration

```ts
readonly isExploration: boolean;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L25)

##### routingLatencyMs?

```ts
readonly optional routingLatencyMs?: number;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L29)

Time taken to make the routing decision (ms).

##### selectedModel

```ts
readonly selectedModel: "claude" | "gemini" | "codex" | "opencode";
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:23](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L23)

##### taskType?

```ts
readonly optional taskType?: string;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L26)

##### timestamp

```ts
readonly timestamp: string;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:21](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L21)

##### traceId

```ts
readonly traceId: string;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics-types.ts:22](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics-types.ts#L22)

---

### StateChangePayload

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:27](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L27)

Payload for state change events.

#### Properties

##### newState

```ts
readonly newState: SwarmAgentState;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L30)

##### previousState

```ts
readonly previousState: SwarmAgentState;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L29)

##### reason?

```ts
readonly optional reason?: string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L31)

##### type

```ts
readonly type: "state_change";
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L28)

---

### SwarmHealthMetrics

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:174](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L174)

Swarm-level health metrics.

#### Properties

##### activeAgents

```ts
readonly activeAgents: number;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:178](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L178)

Currently active agents

##### avgLatencyMs

```ts
readonly avgLatencyMs: number;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:186](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L186)

Average interaction latency (ms)

##### bottlenecks

```ts
readonly bottlenecks: BottleneckInfo[];
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:188](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L188)

Current bottlenecks

##### calculatedAt

```ts
readonly calculatedAt: string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:192](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L192)

Timestamp of metrics calculation

##### clusters

```ts
readonly clusters: AgentCluster[];
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:190](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L190)

Detected clusters

##### errorAgents

```ts
readonly errorAgents: number;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:180](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L180)

Agents in error state

##### successRate

```ts
readonly successRate: number;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:184](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L184)

Successful interaction rate (0-1)

##### totalAgents

```ts
readonly totalAgents: number;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:176](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L176)

Total agents in swarm

##### totalInteractions

```ts
readonly totalInteractions: number;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-types.ts:182](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-types.ts#L182)

Total interactions in time window

---

### TaskPayload

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:72](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L72)

Payload for task lifecycle events.

#### Properties

##### phase

```ts
readonly phase: "completed" | "started";
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:74](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L74)

##### success?

```ts
readonly optional success?: boolean;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:77](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L77)

##### taskDescription?

```ts
readonly optional taskDescription?: string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:76](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L76)

##### taskId

```ts
readonly taskId: string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:75](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L75)

##### type

```ts
readonly type: "task";
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L73)

---

### TaskTypePerformance

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:43](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L43)

Task type performance breakdown.

#### Properties

##### bestModel

```ts
readonly bestModel: string;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:49](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L49)

Best performing model

##### modelPerformance

```ts
readonly modelPerformance: readonly ModelPerformanceSummary[];
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:47](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L47)

Performance per model for this task type

##### taskType

```ts
readonly taskType: string;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:45](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L45)

Task type

##### worstModel

```ts
readonly worstModel: string;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L51)

Worst performing model

---

### ToolPayload

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:50](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L50)

Payload for tool invocation events.

#### Properties

##### errorMessage?

```ts
readonly optional errorMessage?: string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:55](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L55)

##### phase

```ts
readonly phase: "completed" | "invoked";
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L52)

##### success?

```ts
readonly optional success?: boolean;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:54](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L54)

##### toolName

```ts
readonly toolName: string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L53)

##### type

```ts
readonly type: "tool";
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:51](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L51)

---

### TrackedTask

Defined in: [packages/nexus-agents/src/pipeline/task-tracker.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/task-tracker.ts#L26)

A tracked task/issue.

#### Properties

##### id

```ts
readonly id: string;
```

Defined in: [packages/nexus-agents/src/pipeline/task-tracker.ts:28](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/task-tracker.ts#L28)

Backend-specific ID (issue number or local ID).

##### status

```ts
readonly status: "open" | "closed" | "in_progress";
```

Defined in: [packages/nexus-agents/src/pipeline/task-tracker.ts:30](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/task-tracker.ts#L30)

##### title

```ts
readonly title: string;
```

Defined in: [packages/nexus-agents/src/pipeline/task-tracker.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/task-tracker.ts#L29)

##### url?

```ts
readonly optional url?: string;
```

Defined in: [packages/nexus-agents/src/pipeline/task-tracker.ts:31](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/pipeline/task-tracker.ts#L31)

## Type Aliases

### AgentId

```ts
type AgentId = string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-core-types.ts:15](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-core-types.ts#L15)

Unique identifier for agents in the swarm.

---

### DashboardFormat

```ts
type DashboardFormat = 'json' | 'text' | 'markdown' | 'compact';
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L26)

Output format for dashboard rendering.

---

### EventPayload

```ts
type EventPayload =
  | StateChangePayload
  | MessagePayload
  | ToolPayload
  | MemoryPayload
  | TaskPayload
  | ErrorPayload;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-payloads.ts:16](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-payloads.ts#L16)

Discriminated union of event payloads.

---

### EventType

```ts
type EventType =
  | 'state_change'
  | 'message_sent'
  | 'message_received'
  | 'tool_invoked'
  | 'tool_completed'
  | 'memory_read'
  | 'memory_write'
  | 'task_started'
  | 'task_completed'
  | 'error';
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-core-types.ts:37](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-core-types.ts#L37)

Types of events the observer can track.

---

### InteractionOutcome

```ts
type InteractionOutcome = 'success' | 'failure' | 'timeout' | 'pending';
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-core-types.ts:57](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-core-types.ts#L57)

Outcome of an interaction.

---

### ObserverAgentState

```ts
type ObserverAgentState = z.infer<typeof AgentStateSchema>;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:25](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L25)

---

### OrchestrationObserverEvent

```ts
type OrchestrationObserverEvent =
  | {
      agentId: string;
      previousState: ObserverAgentState;
      state: ObserverAgentState;
      type: 'agent_state_changed';
    }
  | {
      decision: ObserverRoutingDecision;
      type: 'routing_decision';
    }
  | {
      pattern: string;
      sessionId: string;
      type: 'session_started';
    }
  | {
      durationMs: number;
      sessionId: string;
      success: boolean;
      type: 'session_completed';
    }
  | {
      metrics: OrchestrationStats;
      type: 'metrics_updated';
    }
  | {
      error: string;
      source: string;
      type: 'error';
    };
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:160](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L160)

OrchestrationObserver event types for visualization hooks.

---

### OrchestrationObserverListener

```ts
type OrchestrationObserverListener = (event) => void;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts:171](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-types.ts#L171)

Observer event listener function.

#### Parameters

##### event

[`OrchestrationObserverEvent`](#orchestrationobserverevent)

#### Returns

`void`

---

### SpanId

```ts
type SpanId = string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-core-types.ts:32](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-core-types.ts#L32)

OpenTelemetry-compatible span identifier.
Format: 16-character hex string (64-bit).

---

### SwarmAgentState

```ts
type SwarmAgentState = 'idle' | 'thinking' | 'executing' | 'waiting' | 'error';
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-core-types.ts:52](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-core-types.ts#L52)

Agent state for tracking state transitions.

---

### TaskId

```ts
type TaskId = string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-core-types.ts:20](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-core-types.ts#L20)

Unique identifier for tasks.

---

### TimePeriod

```ts
type TimePeriod = '1h' | '24h' | '7d' | '30d' | 'all';
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:15](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L15)

Time period for aggregation.

---

### TraceId

```ts
type TraceId = string;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-core-types.ts:26](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-core-types.ts#L26)

OpenTelemetry-compatible trace identifier.
Format: 32-character hex string (128-bit).

## Variables

### AgentEventSchema

```ts
const AgentEventSchema: ZodObject<
  {
    agentId: ZodString;
    durationMs: ZodOptional<ZodNumber>;
    eventId: ZodString;
    eventType: ZodEnum<{
      error: 'error';
      memory_read: 'memory_read';
      memory_write: 'memory_write';
      message_received: 'message_received';
      message_sent: 'message_sent';
      state_change: 'state_change';
      task_completed: 'task_completed';
      task_started: 'task_started';
      tool_completed: 'tool_completed';
      tool_invoked: 'tool_invoked';
    }>;
    parentSpanId: ZodOptional<ZodString>;
    payload: ZodRecord<ZodString, ZodUnknown>;
    spanId: ZodString;
    timestamp: ZodISODateTime;
    traceId: ZodString;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-schemas.ts:41](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-schemas.ts#L41)

Zod schema for AgentEvent validation.

---

### DashboardConfigSchema

```ts
const DashboardConfigSchema: ZodObject<
  {
    format: ZodDefault<
      ZodEnum<{
        compact: 'compact';
        json: 'json';
        markdown: 'markdown';
        text: 'text';
      }>
    >;
    maxAgentsShown: ZodDefault<ZodNumber>;
    maxEventsShown: ZodDefault<ZodNumber>;
    showBottlenecks: ZodDefault<ZodBoolean>;
    showClusters: ZodDefault<ZodBoolean>;
    showContributions: ZodDefault<ZodBoolean>;
    showGraph: ZodDefault<ZodBoolean>;
    timeWindowMs: ZodDefault<ZodNumber>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:67](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L67)

Zod schema for dashboard configuration.

---

### DEFAULT_DASHBOARD_CONFIG

```ts
const DEFAULT_DASHBOARD_CONFIG: DashboardConfig;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-types.ts:53](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-types.ts#L53)

Default dashboard configuration.

---

### DEFAULT_DASHBOARD_RENDER_OPTIONS

```ts
const DEFAULT_DASHBOARD_RENDER_OPTIONS: Required<DashboardRenderOptions>;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard-types.ts:153](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard-types.ts#L153)

Default dashboard render options.

---

### DEFAULT_SWARM_OBSERVER_CONFIG

```ts
const DEFAULT_SWARM_OBSERVER_CONFIG: InteractionObserverConfig;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-schemas.ts:17](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-schemas.ts#L17)

Default configuration for SwarmObserver.

---

### InteractionObserverConfigSchema

```ts
const InteractionObserverConfigSchema: ZodObject<
  {
    bottleneckThreshold: ZodDefault<ZodNumber>;
    cohesionThreshold: ZodDefault<ZodNumber>;
    logPayloads: ZodDefault<ZodBoolean>;
    maxEvents: ZodDefault<ZodNumber>;
    metricsWindowMs: ZodDefault<ZodNumber>;
    minClusterSize: ZodDefault<ZodNumber>;
  },
  $strip
>;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer-schemas.ts:29](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer-schemas.ts#L29)

Zod schema for SwarmObserverConfig validation.

## Functions

### calculateMetricsTotals()

```ts
function calculateMetricsTotals(sessionMetrics): {
  totalCost: number;
  totalTokens: number;
};
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-helpers.ts:195](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-helpers.ts#L195)

Aggregates token and cost totals from session metrics.

#### Parameters

##### sessionMetrics

`Iterable`\<[`ObserverSessionMetrics`](#observersessionmetrics)\>

Iterable of session metrics

#### Returns

```ts
{
  totalCost: number;
  totalTokens: number;
}
```

Object containing total tokens and total cost

##### totalCost

```ts
totalCost: number;
```

##### totalTokens

```ts
totalTokens: number;
```

---

### calculateRoutingDistribution()

```ts
function calculateRoutingDistribution(routingHistory): Record<CliName, number>;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-helpers.ts:179](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-helpers.ts#L179)

Calculates routing distribution from routing history.

#### Parameters

##### routingHistory

readonly [`ObserverRoutingDecision`](#observerroutingdecision)[]

The routing decision history

#### Returns

`Record`\<[`CliName`](cli-adapters.md#cliname-2), `number`\>

A record mapping CLI names to counts

---

### calculateTokenCost()

```ts
function calculateTokenCost(tokens, ratePerThousand): number;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-helpers.ts:277](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-helpers.ts#L277)

Calculates the cost for token usage based on rate.

#### Parameters

##### tokens

[`ObserverTokenUsage`](#observertokenusage)

Token usage to calculate cost for

##### ratePerThousand

`number`

Cost rate per 1000 tokens

#### Returns

`number`

The calculated cost in USD

---

### countActiveSessions()

```ts
function countActiveSessions(sessionMetrics): number;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-helpers.ts:214](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-helpers.ts#L214)

Counts active sessions (sessions without a completedAt timestamp).

#### Parameters

##### sessionMetrics

`Iterable`\<[`ObserverSessionMetrics`](#observersessionmetrics)\>

Iterable of session metrics

#### Returns

`number`

The count of active sessions

---

### createDashboard()

```ts
function createDashboard(observer, config?): Dashboard;
```

Defined in: [packages/nexus-agents/src/observability/dashboard.ts:269](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard.ts#L269)

Create a new dashboard instance.

#### Parameters

##### observer

[`IInteractionObserver`](#iinteractionobserver)

##### config?

`Partial`\<[`DashboardConfig`](#dashboardconfig)\>

#### Returns

[`Dashboard`](#dashboard)

---

### createDashboardRenderer()

```ts
function createDashboardRenderer(config): IDashboardRenderer;
```

Defined in: [packages/nexus-agents/src/observability/dashboard-renderer.ts:325](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/dashboard-renderer.ts#L325)

Create a dashboard renderer for the specified format.

#### Parameters

##### config

[`DashboardConfig`](#dashboardconfig)

#### Returns

[`IDashboardRenderer`](#idashboardrenderer)

---

### createInitialCostMetrics()

```ts
function createInitialCostMetrics(): ObserverCostMetrics;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-helpers.ts:136](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-helpers.ts#L136)

Creates initial cost metrics with zero values.

#### Returns

[`ObserverCostMetrics`](#observercostmetrics)

A new CostMetrics object with zero values

---

### createInitialSessionMetrics()

```ts
function createInitialSessionMetrics(sessionId): ObserverSessionMetrics;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-helpers.ts:103](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-helpers.ts#L103)

Creates initial session metrics with default values.

#### Parameters

##### sessionId

`string`

The session ID

#### Returns

[`ObserverSessionMetrics`](#observersessionmetrics)

A new SessionMetrics object with initial values

---

### createInitialTokenUsage()

```ts
function createInitialTokenUsage(): ObserverTokenUsage;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-helpers.ts:123](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-helpers.ts#L123)

Creates initial token usage with zero values.

#### Returns

[`ObserverTokenUsage`](#observertokenusage)

A new TokenUsage object with zero values

---

### createInteractionGraph()

```ts
function createInteractionGraph(): InteractionGraph;
```

Defined in: [packages/nexus-agents/src/observability/interaction-graph.ts:271](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/interaction-graph.ts#L271)

Create a new interaction graph.

#### Returns

[`InteractionGraph`](#interactiongraph)

---

### createInteractionSwarmObserver()

```ts
function createInteractionSwarmObserver(config?): IInteractionObserver;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer.ts:358](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer.ts#L358)

Create a new SwarmObserver instance.

#### Parameters

##### config?

`Partial`\<[`InteractionObserverConfig`](#interactionobserverconfig)\>

#### Returns

[`IInteractionObserver`](#iinteractionobserver)

---

### createRoutingMetricsCollector()

```ts
function createRoutingMetricsCollector(config?): RoutingMetricsCollector;
```

Defined in: [packages/nexus-agents/src/observability/routing-metrics.ts:303](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/routing-metrics.ts#L303)

Create a RoutingMetricsCollector instance.

#### Parameters

##### config?

`Partial`\<[`RoutingMetricsConfig`](#routingmetricsconfig)\>

#### Returns

[`RoutingMetricsCollector`](#routingmetricscollector)

---

### createTrackedAgent()

```ts
function createTrackedAgent(agentId, state, role?, currentTask?): ObserverTrackedAgent;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-helpers.ts:152](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-helpers.ts#L152)

Creates a new TrackedAgent object with initial values.

#### Parameters

##### agentId

`string`

The agent ID

##### state

`"error"` \| `"thinking"` \| `"idle"` \| `"waiting"` \| `"executing"`

The initial agent state

##### role?

`string` = `'unknown'`

The agent role (defaults to 'unknown')

##### currentTask?

`string`

Optional current task description

#### Returns

[`ObserverTrackedAgent`](#observertrackedagent)

A new TrackedAgent object

---

### createValidationDashboard()

```ts
function createValidationDashboard(): ValidationDashboard;
```

Defined in: [packages/nexus-agents/src/observability/validation-dashboard.ts:289](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/validation-dashboard.ts#L289)

Create a validation dashboard instance.

#### Returns

[`ValidationDashboard`](#validationdashboard)

---

### extractBooleanField()

```ts
function extractBooleanField(payload, field): boolean;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-helpers.ts:62](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-helpers.ts#L62)

Extracts a boolean field from a payload object safely.

#### Parameters

##### payload

`Record`\<`string`, `unknown`\>

The payload object to extract from

##### field

`string`

The field name to extract

#### Returns

`boolean`

The boolean value (defaults to false if not found/invalid)

---

### extractNumberField()

```ts
function extractNumberField(payload, field, defaultValue?): number;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-helpers.ts:46](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-helpers.ts#L46)

Extracts a number field from a payload object safely.

#### Parameters

##### payload

`Record`\<`string`, `unknown`\>

The payload object to extract from

##### field

`string`

The field name to extract

##### defaultValue?

`number` = `0`

Default value if not found

#### Returns

`number`

The number value or default if not found/invalid

---

### extractSessionId()

```ts
function extractSessionId(event, payload): string;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-helpers.ts:85](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-helpers.ts#L85)

Extracts session ID from event object or payload.

#### Parameters

##### event

`DomainEvent`

The domain event

##### payload

`Record`\<`string`, `unknown`\>

The event payload

#### Returns

`string`

The session ID or empty string if not found

---

### extractStringArrayField()

```ts
function extractStringArrayField(payload, field): string[];
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-helpers.ts:73](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-helpers.ts#L73)

Extracts a string array field from a payload object safely.

#### Parameters

##### payload

`Record`\<`string`, `unknown`\>

The payload object to extract from

##### field

`string`

The field name to extract

#### Returns

`string`[]

The string array or empty array if not found/invalid

---

### extractStringField()

```ts
function extractStringField(payload, field): string;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-helpers.ts:33](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-helpers.ts#L33)

Extracts a string field from a payload object safely.

#### Parameters

##### payload

`Record`\<`string`, `unknown`\>

The payload object to extract from

##### field

`string`

The field name to extract

#### Returns

`string`

The string value or empty string if not found/invalid

---

### findActiveSession()

```ts
function findActiveSession(sessionMetrics): ObserverSessionMetrics | undefined;
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-helpers.ts:230](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-helpers.ts#L230)

Finds the first active session (no completedAt) from metrics.

#### Parameters

##### sessionMetrics

`Iterable`\<[`ObserverSessionMetrics`](#observersessionmetrics)\>

Iterable of session metrics

#### Returns

[`ObserverSessionMetrics`](#observersessionmetrics) \| `undefined`

The first active session or undefined

---

### getSwarmObserver()

```ts
function getSwarmObserver(config?): InteractionSwarmObserver;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer.ts:370](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer.ts#L370)

Get or create the global SwarmObserver.

#### Parameters

##### config?

`Partial`\<[`InteractionObserverConfig`](#interactionobserverconfig)\>

#### Returns

[`InteractionSwarmObserver`](#interactionswarmobserver)

---

### identifySessionsToRemove()

```ts
function identifySessionsToRemove(sessions, maxSessions): string[];
```

Defined in: [packages/nexus-agents/src/agents/observability/orchestration-observer-helpers.ts:253](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/agents/observability/orchestration-observer-helpers.ts#L253)

Identifies session IDs to remove based on max history limit.
Returns oldest sessions first.

#### Parameters

##### sessions

\[`string`, [`ObserverSessionMetrics`](#observersessionmetrics)\][]

Array of [sessionId, metrics] entries

##### maxSessions

`number`

Maximum sessions to keep

#### Returns

`string`[]

Array of session IDs to remove

---

### setSwarmObserver()

```ts
function setSwarmObserver(observer): void;
```

Defined in: [packages/nexus-agents/src/observability/swarm-observer.ts:378](https://github.com/nexus-substrate/nexus-agents/blob/5c12a37f0775ec3c299142f22bd39afd955bbbaf/packages/nexus-agents/src/observability/swarm-observer.ts#L378)

Set the global SwarmObserver.

#### Parameters

##### observer

[`InteractionSwarmObserver`](#interactionswarmobserver)

#### Returns

`void`
