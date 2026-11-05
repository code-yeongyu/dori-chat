#!/usr/bin/env bun
import { Command } from "commander";
import { GatewayError, GatewayTransportError, ReplyTimeoutError } from "../sdk/errors.ts";
import { registerAgentCommands } from "./agent-commands.ts";
import { MissingConfigError } from "./config-store.ts";

const program = new Command()
  .name("dori-chat")
  .description("Talk to Dori from any agent")
  .version("0.1.0");

registerAgentCommands(program);

try {
  await program.parseAsync(process.argv);
} catch (error) {
  // no-excuse-ok: catch (CLI entry boundary prints the failure and exits non-zero)
  const known =
    error instanceof GatewayError ||
    error instanceof GatewayTransportError ||
    error instanceof ReplyTimeoutError ||
    error instanceof MissingConfigError;
  process.stderr.write(`dori-chat: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(known ? 2 : 1);
}
