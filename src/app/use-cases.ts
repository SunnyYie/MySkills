export const CLI_COMMAND_GROUPS = ['bind', 'inspect', 'run', 'record'] as const;

export const APP_USE_CASE_IDS = [
  'bind-project-profile',
  'inspect-resource',
  'orchestrate-run-lifecycle',
  'record-external-artifacts',
] as const;

export type CliCommandGroup = (typeof CLI_COMMAND_GROUPS)[number];
export type AppUseCaseId = (typeof APP_USE_CASE_IDS)[number];

export const CLI_COMMAND_USE_CASE_BOUNDARY: Record<CliCommandGroup, AppUseCaseId> = {
  bind: 'bind-project-profile',
  inspect: 'inspect-resource',
  run: 'orchestrate-run-lifecycle',
  record: 'record-external-artifacts',
};

export const getUseCaseForCommandGroup = (commandGroup: CliCommandGroup) =>
  CLI_COMMAND_USE_CASE_BOUNDARY[commandGroup];
