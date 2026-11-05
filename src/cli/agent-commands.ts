import { InvalidArgumentError, type Command } from "commander";
import { AgentChatClient } from "../sdk/agent-client.ts";
import { subscribe } from "../sdk/live.ts";
import { ConversationIdSchema } from "../shared/ids.ts";
import { z } from "zod";
import {
  assertCanRegister,
  boundBaseUrl,
  loadCredentials,
  resolveBaseUrl,
  saveCredentials,
} from "./config-store.ts";
import { print } from "./output.ts";

type UrlOption = { readonly url?: string };

// Option parsers run before any command action, so a bad value is refused before anything is sent.
function wholeNumber(schema: z.ZodNumber, expected: string): (raw: string) => number {
  return (raw) => {
    const parsed = schema.safeParse(Number(raw));
    if (!parsed.success || raw.trim() === "")
      throw new InvalidArgumentError(`expected ${expected}`);
    return parsed.data;
  };
}
const seconds = wholeNumber(z.number().int().positive(), "a whole number of seconds above 0");
const sequence = wholeNumber(z.number().int().min(0), "a whole number, 0 or more");

async function client(options: UrlOption): Promise<AgentChatClient> {
  const stored = await loadCredentials();
  return new AgentChatClient({
    baseUrl: boundBaseUrl(options.url, stored),
    token: stored.token,
  });
}

export function registerAgentCommands(program: Command): void {
  program
    .command("register")
    .description("register this agent once and store its token (0600) in the config dir")
    .requiredOption("--name <name>", "display name Dori will see")
    .option("--url <url>", "gateway base URL")
    .option("--force", "replace an existing registration")
    .action(async (options: UrlOption & { readonly name: string; readonly force?: boolean }) => {
      const baseUrl = resolveBaseUrl(options.url, undefined);
      await assertCanRegister({ overwrite: options.force === true });
      const credentials = await AgentChatClient.register(options.name, { baseUrl });
      const path = await saveCredentials(
        { baseUrl, ...credentials },
        { overwrite: options.force === true },
      );
      print({ senderId: credentials.senderId, name: credentials.name, savedTo: path });
    });

  program
    .command("send")
    .description("send a message to Dori; starts a new conversation unless --conversation is given")
    .argument("<text...>", "message text")
    .option("--conversation <id>", "continue this conversation")
    .option("--wait", "wait for Dori's reply and print it")
    .option("--timeout <seconds>", "how long --wait waits", seconds, 600)
    .option("--url <url>", "gateway base URL")
    .action(
      async (
        words: readonly string[],
        options: UrlOption & {
          readonly conversation?: string;
          readonly wait?: boolean;
          readonly timeout: number;
        },
      ) => {
        const agent = await client(options);
        const text = words.join(" ");
        const conversationId =
          options.conversation === undefined
            ? undefined
            : ConversationIdSchema.parse(options.conversation);
        const { message } = await agent.send(
          text,
          conversationId === undefined ? {} : { conversationId },
        );
        if (options.wait !== true) {
          print({ sent: message });
          return;
        }
        const reply = await agent.waitForReply(message.conversationId, {
          afterSeq: message.seq,
          timeoutMs: options.timeout * 1000,
        });
        print({ sent: message, reply });
      },
    );

  program
    .command("wait")
    .description("wait for Dori's next reply in a conversation")
    .argument("<conversationId>")
    .option("--after <seq>", "only replies after this sequence number", sequence, 0)
    .option("--timeout <seconds>", "give up after this many seconds", seconds, 600)
    .option("--url <url>", "gateway base URL")
    .action(
      async (
        id: string,
        options: UrlOption & { readonly after: number; readonly timeout: number },
      ) => {
        const agent = await client(options);
        const reply = await agent.waitForReply(ConversationIdSchema.parse(id), {
          afterSeq: options.after,
          timeoutMs: options.timeout * 1000,
        });
        print({ reply });
      },
    );

  program
    .command("messages")
    .description("print a conversation's messages")
    .argument("<conversationId>")
    .option("--after <seq>", "only messages after this sequence number", sequence, 0)
    .option("--url <url>", "gateway base URL")
    .action(async (id: string, options: UrlOption & { readonly after: number }) => {
      const agent = await client(options);
      print(await agent.messages(ConversationIdSchema.parse(id), { after: options.after }));
    });

  program
    .command("conversations")
    .description("list this agent's conversations")
    .option("--url <url>", "gateway base URL")
    .action(async (options: UrlOption) =>
      print({ conversations: await (await client(options)).conversations() }),
    );

  program
    .command("watch")
    .description("stream new messages of a conversation over WebSocket until interrupted")
    .argument("<conversationId>")
    .option("--url <url>", "gateway base URL")
    .action(async (id: string, options: UrlOption) => {
      const stored = await loadCredentials();
      subscribe({
        conversationId: ConversationIdSchema.parse(id),
        token: stored.token,
        baseUrl: boundBaseUrl(options.url, stored),
        onMessage: (message) => print(message),
        onInvalidFrame: (raw) =>
          process.stderr.write(
            `dori-chat: ignored a frame that is not a message: ${raw.slice(0, 200)}\n`,
          ),
        onClose: (code, reason) => {
          process.stderr.write(
            `dori-chat: live connection closed (${code}${reason === "" ? "" : ` ${reason}`})\n`,
          );
          process.exit(code === 1000 ? 0 : 2);
        },
      });
      await new Promise<void>((resolve) => process.once("SIGINT", () => resolve()));
    });
}
