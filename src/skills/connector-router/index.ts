import {
  StructuredErrorSchema,
  type ExecutionContext,
} from '../../domain/index.js';

export const CONNECTOR_ROUTER_SKILL = 'connector-router' as const;

export const routeConnectorForStage = ({
  stage,
}: {
  stage: ExecutionContext['current_stage'];
}) => {
  if (stage === 'Artifact Linking') {
    return {
      skill: CONNECTOR_ROUTER_SKILL,
      stage,
      system: 'jira' as const,
    };
  }

  if (stage === 'Knowledge Recording') {
    return {
      skill: CONNECTOR_ROUTER_SKILL,
      stage,
      system: 'feishu' as const,
    };
  }

  throw StructuredErrorSchema.parse({
    code: 'connector_route_unsupported_stage',
    category: 'validation_error',
    stage,
    system: CONNECTOR_ROUTER_SKILL,
    operation: 'route-stage',
    target_ref: null,
    message: `No connector route is defined for ${stage}.`,
    detail:
      'connector-router only resolves write stages that map to a concrete external system.',
    retryable: false,
    outcome_unknown: false,
    user_action: 'Use connector-router only for Artifact Linking or Knowledge Recording.',
    raw_cause_ref: null,
    partial_state_ref: null,
    timestamp: new Date().toISOString(),
  });
};
