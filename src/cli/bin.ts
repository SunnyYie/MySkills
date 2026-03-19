#!/usr/bin/env node

import { bootstrapCli } from "../app/bootstrap.js";

async function main() {
  const program = bootstrapCli();
  await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
