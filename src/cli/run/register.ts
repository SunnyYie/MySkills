import { Command } from 'commander';

import {
  approveCliRunStage,
  bindCliRunBranch,
  bindCliRunRequirement,
  createCliRun,
  ensureCliSubtask,
  executeCliWrite,
  getCliRunReport,
  getCliRunStatus,
  previewCliWrite,
  provideCliArtifacts,
  provideCliFixCommit,
  provideCliVerification,
  rejectCliRunStage,
  resumeCliRun,
  reviseCliRun,
} from '../../app/cli-orchestration.js';
import { BUGFIX_STAGES } from '../../domain/index.js';
import type { CliRuntimeOptions } from '../program.js';
import { emitCliPayload } from '../shared.js';

const addSharedOptions = (command: Command) =>
  command
    .option('--json', 'emit JSON output')
    .option('--dry-run', 'mark the command as dry-run')
    .option('--non-interactive', 'disable interactive confirmations')
    .option('--output <path>', 'write the rendered output to a file')
    .option('--checkpoint <id>', 'target a specific checkpoint when supported');

const addStageOption = (command: Command) =>
  command.requiredOption(
    '--stage <stage>',
    `target stage (${BUGFIX_STAGES.join(', ')})`,
  );

export const registerRunCommands = (
  program: Command,
  runtime: CliRuntimeOptions,
) => {
  const run = program.command('run').description('Drive the main workflow lifecycle.');

  addSharedOptions(
    run
      .command('start')
      .requiredOption('--project <id>', 'project id')
      .requiredOption('--issue <key>', 'issue key')
      .action(
        async (options: {
          project: string;
          issue: string;
          json?: boolean;
          dryRun?: boolean;
          nonInteractive?: boolean;
          output?: string;
        }) => {
          const payload = await createCliRun({
            projectId: options.project,
            issueKey: options.issue,
            runMode: 'full',
            homeDir: runtime.homeDir,
            dryRun: Boolean(options.dryRun),
            nonInteractive: Boolean(options.nonInteractive),
          });

          await emitCliPayload({
            runtime,
            payload,
            asJson: Boolean(options.json),
            outputPath: options.output,
          });
        },
      ),
  );

  addSharedOptions(
    run
      .command('brief')
      .requiredOption('--project <id>', 'project id')
      .requiredOption('--issue <key>', 'issue key')
      .action(
        async (options: {
          project: string;
          issue: string;
          json?: boolean;
          dryRun?: boolean;
          nonInteractive?: boolean;
          output?: string;
        }) => {
          const payload = await createCliRun({
            projectId: options.project,
            issueKey: options.issue,
            runMode: 'brief_only',
            homeDir: runtime.homeDir,
            dryRun: Boolean(options.dryRun),
            nonInteractive: Boolean(options.nonInteractive),
          });

          await emitCliPayload({
            runtime,
            payload,
            asJson: Boolean(options.json),
            outputPath: options.output,
          });
        },
      ),
  );

  addSharedOptions(
    run
      .command('resume')
      .requiredOption('--run <id>', 'run id')
      .action(
        async (options: {
          run: string;
          checkpoint?: string;
          json?: boolean;
          output?: string;
        }) => {
          const payload = await resumeCliRun({
            runId: options.run,
            checkpointId: options.checkpoint,
            homeDir: runtime.homeDir,
          });

          await emitCliPayload({
            runtime,
            payload,
            asJson: Boolean(options.json),
            outputPath: options.output,
          });
        },
      ),
  );

  addSharedOptions(
    run
      .command('status')
      .requiredOption('--run <id>', 'run id')
      .action(
        async (options: {
          run: string;
          checkpoint?: string;
          json?: boolean;
          output?: string;
        }) => {
          const payload = await getCliRunStatus({
            runId: options.run,
            checkpointId: options.checkpoint,
            homeDir: runtime.homeDir,
          });

          await emitCliPayload({
            runtime,
            payload,
            asJson: Boolean(options.json),
            outputPath: options.output,
          });
        },
      ),
  );

  addSharedOptions(
    run
      .command('report')
      .requiredOption('--run <id>', 'run id')
      .action(
        async (options: {
          run: string;
          json?: boolean;
          output?: string;
        }) => {
          const payload = await getCliRunReport({
            runId: options.run,
            homeDir: runtime.homeDir,
          });

          await emitCliPayload({
            runtime,
            payload,
            asJson: Boolean(options.json),
            outputPath: options.output,
          });
        },
      ),
  );

  addSharedOptions(
    addStageOption(
      run
        .command('approve')
        .requiredOption('--run <id>', 'run id')
        .requiredOption('--preview-ref <ref>', 'approved preview ref')
        .action(
          async (options: {
            run: string;
            stage: string;
            previewRef: string;
            json?: boolean;
            dryRun?: boolean;
            nonInteractive?: boolean;
            output?: string;
          }) => {
            const payload = await approveCliRunStage({
              runId: options.run,
              stage: options.stage as (typeof BUGFIX_STAGES)[number],
              previewRef: options.previewRef,
              homeDir: runtime.homeDir,
              dryRun: Boolean(options.dryRun),
              nonInteractive: Boolean(options.nonInteractive),
            });

            await emitCliPayload({
              runtime,
              payload,
              asJson: Boolean(options.json),
              outputPath: options.output,
            });
          },
        ),
    ),
  );

  addSharedOptions(
    addStageOption(
      run
        .command('reject')
        .requiredOption('--run <id>', 'run id')
        .action(
          async (options: {
            run: string;
            stage: string;
            json?: boolean;
            dryRun?: boolean;
            nonInteractive?: boolean;
            output?: string;
          }) => {
            const payload = await rejectCliRunStage({
              runId: options.run,
              stage: options.stage as (typeof BUGFIX_STAGES)[number],
              homeDir: runtime.homeDir,
              dryRun: Boolean(options.dryRun),
              nonInteractive: Boolean(options.nonInteractive),
            });

            await emitCliPayload({
              runtime,
              payload,
              asJson: Boolean(options.json),
              outputPath: options.output,
            });
          },
        ),
    ),
  );

  addSharedOptions(
    run
      .command('revise')
      .requiredOption('--run <id>', 'run id')
      .requiredOption('--rollback-to <stage>', 'rollback target stage')
      .action(
        async (options: {
          run: string;
          rollbackTo: string;
          json?: boolean;
          dryRun?: boolean;
          nonInteractive?: boolean;
          output?: string;
        }) => {
          const payload = await reviseCliRun({
            runId: options.run,
            rollbackToStage: options.rollbackTo as (typeof BUGFIX_STAGES)[number],
            homeDir: runtime.homeDir,
            dryRun: Boolean(options.dryRun),
            nonInteractive: Boolean(options.nonInteractive),
          });

          await emitCliPayload({
            runtime,
            payload,
            asJson: Boolean(options.json),
            outputPath: options.output,
          });
        },
      ),
  );

  addSharedOptions(
    run
      .command('bind-branch')
      .requiredOption('--run <id>', 'run id')
      .requiredOption('--branch <name>', 'development branch name')
      .option('--issue <key>', 'explicit issue key override')
      .action(
        async (options: {
          run: string;
          branch: string;
          issue?: string;
          json?: boolean;
          dryRun?: boolean;
          nonInteractive?: boolean;
          output?: string;
        }) => {
          const payload = await bindCliRunBranch({
            runId: options.run,
            branchName: options.branch,
            issueKey: options.issue,
            homeDir: runtime.homeDir,
            dryRun: Boolean(options.dryRun),
            nonInteractive: Boolean(options.nonInteractive),
          });

          await emitCliPayload({
            runtime,
            payload,
            asJson: Boolean(options.json),
            outputPath: options.output,
          });
        },
      ),
  );

  addSharedOptions(
    run
      .command('bind-requirement')
      .requiredOption('--run <id>', 'run id')
      .requiredOption('--requirement <ref>', 'resolved requirement reference')
      .action(
        async (options: {
          run: string;
          requirement: string;
          json?: boolean;
          dryRun?: boolean;
          nonInteractive?: boolean;
          output?: string;
        }) => {
          const payload = await bindCliRunRequirement({
            runId: options.run,
            issueKey: options.requirement,
            homeDir: runtime.homeDir,
            dryRun: Boolean(options.dryRun),
            nonInteractive: Boolean(options.nonInteractive),
          });

          await emitCliPayload({
            runtime,
            payload,
            asJson: Boolean(options.json),
            outputPath: options.output,
          });
        },
      ),
  );

  addSharedOptions(
    run
      .command('ensure-subtask')
      .requiredOption('--run <id>', 'run id')
      .option('--issue <key>', 'explicit issue key override')
      .action(
        async (options: {
          run: string;
          issue?: string;
          json?: boolean;
          dryRun?: boolean;
          nonInteractive?: boolean;
          output?: string;
        }) => {
          const payload = await ensureCliSubtask({
            runId: options.run,
            issueKey: options.issue,
            homeDir: runtime.homeDir,
            dryRun: Boolean(options.dryRun),
            nonInteractive: Boolean(options.nonInteractive),
          });

          await emitCliPayload({
            runtime,
            payload,
            asJson: Boolean(options.json),
            outputPath: options.output,
          });
        },
      ),
  );

  addSharedOptions(
    run
      .command('provide-fix-commit')
      .requiredOption('--run <id>', 'run id')
      .requiredOption('--issue <key>', 'target issue key')
      .requiredOption('--commit <sha>', 'fix commit sha')
      .action(
        async (options: {
          run: string;
          issue: string;
          commit: string;
          json?: boolean;
          dryRun?: boolean;
          nonInteractive?: boolean;
          output?: string;
        }) => {
          const payload = await provideCliFixCommit({
            runId: options.run,
            issueKey: options.issue,
            commitSha: options.commit,
            homeDir: runtime.homeDir,
            dryRun: Boolean(options.dryRun),
            nonInteractive: Boolean(options.nonInteractive),
          });

          await emitCliPayload({
            runtime,
            payload,
            asJson: Boolean(options.json),
            outputPath: options.output,
          });
        },
      ),
  );

  addSharedOptions(
    run
      .command('provide-artifact')
      .requiredOption('--run <id>', 'run id')
      .requiredOption('--file <path>', 'JSON file with GitLab artifact payload')
      .action(
        async (options: {
          run: string;
          file: string;
          json?: boolean;
          dryRun?: boolean;
          nonInteractive?: boolean;
          output?: string;
        }) => {
          const payload = await provideCliArtifacts({
            runId: options.run,
            artifactFile: options.file,
            homeDir: runtime.homeDir,
            dryRun: Boolean(options.dryRun),
            nonInteractive: Boolean(options.nonInteractive),
          });

          await emitCliPayload({
            runtime,
            payload,
            asJson: Boolean(options.json),
            outputPath: options.output,
          });
        },
      ),
  );

  addSharedOptions(
    run
      .command('provide-verification')
      .requiredOption('--run <id>', 'run id')
      .requiredOption('--file <path>', 'JSON file with verification result payload')
      .action(
        async (options: {
          run: string;
          file: string;
          json?: boolean;
          dryRun?: boolean;
          nonInteractive?: boolean;
          output?: string;
        }) => {
          const payload = await provideCliVerification({
            runId: options.run,
            verificationFile: options.file,
            homeDir: runtime.homeDir,
            dryRun: Boolean(options.dryRun),
            nonInteractive: Boolean(options.nonInteractive),
          });

          await emitCliPayload({
            runtime,
            payload,
            asJson: Boolean(options.json),
            outputPath: options.output,
          });
        },
      ),
  );

  addSharedOptions(
    addStageOption(
      run
        .command('preview-write')
        .requiredOption('--run <id>', 'run id')
        .action(
          async (options: {
            run: string;
            stage: string;
            json?: boolean;
            dryRun?: boolean;
            nonInteractive?: boolean;
            output?: string;
          }) => {
            const payload = await previewCliWrite({
              runId: options.run,
              stage: options.stage as (typeof BUGFIX_STAGES)[number],
              homeDir: runtime.homeDir,
              dryRun: Boolean(options.dryRun),
              nonInteractive: Boolean(options.nonInteractive),
            });

            await emitCliPayload({
              runtime,
              payload,
              asJson: Boolean(options.json),
              outputPath: options.output,
            });
          },
        ),
    ),
  );

  addSharedOptions(
    addStageOption(
      run
        .command('execute-write')
        .requiredOption('--run <id>', 'run id')
        .requiredOption('--preview-ref <ref>', 'preview ref to execute')
        .option('--confirm <hash>', 'preview hash confirmation')
        .action(
          async (options: {
            run: string;
            stage: string;
            previewRef: string;
            confirm?: string;
            json?: boolean;
            dryRun?: boolean;
            nonInteractive?: boolean;
            output?: string;
          }) => {
            const payload = await executeCliWrite({
              runId: options.run,
              stage: options.stage as (typeof BUGFIX_STAGES)[number],
              previewRef: options.previewRef,
              confirm: options.confirm,
              homeDir: runtime.homeDir,
              dryRun: Boolean(options.dryRun),
              nonInteractive: Boolean(options.nonInteractive),
            });

            await emitCliPayload({
              runtime,
              payload,
              asJson: Boolean(options.json),
              outputPath: options.output,
            });
          },
        ),
    ),
  );
};
