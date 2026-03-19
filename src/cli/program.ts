import { Command } from "commander";

export function createProgram() {
  return new Command()
    .name("bugfix-orchestrator")
    .description("CLI-first bugfix orchestration scaffold for v1.")
    .showHelpAfterError();
}
