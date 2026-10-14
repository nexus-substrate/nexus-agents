---
'nexus-agents': patch
---

refactor(routing): disambiguate colliding RoutingDecision definitions across subsystems (#5129 item 3)

Disambiguates 6 conflicting definitions of `RoutingDecision` that model distinct subsystem domains, following the precedent established in #4440 and consensus vote decision:

- Renames `RoutingDecision` in `orchestration/workflow-router-types.ts` to `WorkflowRoutingDecision` and updates `IWorkflowRouter.route` and `WorkflowPatternRouter.route`.
- Renames `RoutingDecision` in `agents/observability/orchestration-observer-types.ts` to `ObserverRoutingDecision` and updates `IOrchestrationObserver` and helper signatures.
- Renames `RoutingDecision` and `RoutingDecisionSchema` in `learning/outcome-feedback-types.ts` to `FeedbackRoutingDecision` and `FeedbackRoutingDecisionSchema`, updating `IOutcomeFeedback` and `OutcomeFeedbackCollector`.
- Renames `RoutingDecision` in `core/routing/routing-context-store.ts` to `RoutingDecisionRecord`, updating `IRoutingContextStore`, `RoutingContextStore`, and helper functions.
- Renames `RoutingDecision` in `cli-adapters/router-types.ts` to `CliRoutingDecision`, updating `ITaskRouter` and testing framework callers.
- Renames `RoutingDecision` in `cli-adapters/routing/router-stage.ts` to `StageRoutingDecision`, updating `IRoutingPipeline` and stage results.
- Preserves 100% backward compatibility at every definition site with deprecated `export type RoutingDecision = ...` and schema aliases.
- Regenerates public API surface (`api-surface.txt`), completely removing `RoutingDecision` from colliding names without breaking public API compatibility.
