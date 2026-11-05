import type { Command } from "commander";
import { AgentChatClient } from "../sdk/agent-client.ts";
import { subscribe } from "../sdk/live.ts";
import { ConversationIdSchema } from "../shared/ids.ts";
import { loadCredentials, resolveBaseUrl, saveCredentials } from "./config-store.ts";
import { print } from "./output.ts";

type UrlOption = { readonly url?: string };

async function client(options: UrlOption): Promise<AgentChatClient> {
  const stored = await loadCredentials();
  return new AgentChatClient({
    baseUrl: resolveBaseUrl(options.url, stored.baseUrl),
    token: stored.token,
  });
}

export function registerAgentCommands(program: Command): void {
  program
    .command("register")
    .description("register this agent once and store its token (0600) in the config dir")
    .requiredOption("--name <name>", "display name Dori will see")
    .option("--url <url>", "gateway base URL")
    .action(async (options: UrlOption & { readonly name: string }) => {
      const baseUrl = resolveBaseUrl(options.url, undefined);
      const credentials = await AgentChatClient.register(options.name, { baseUrl });
      const path = await saveCredentials({ baseUrl, ...credentials });
      print({ senderId: credentials.senderId, name: credentials.name, savedTo: path });
    });

  program
    .command("send")
    .description("send a message to Dori; starts a new conversation unless --conversation is given")
    .argument("<text...>", "message text")
    .option("--conversation <id>", "continue this conversation")
    .option("--wait", "wait for Dori's reply and print it")
    .option("--timeout <seconds>", "how long --wait waits", "600")
    .option("--url <url>", "gateway base URL")
    .action(
      async (
        words: readonly string[],
        options: UrlOption & {
          readonly conversation?: string;
          readonly wait?: boolean;
          readonly timeout: string;
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
          timeoutMs: Number(options.timeout) * 1000,
        });
        print({ sent: message, reply });
      },
    );

  program
    .command("wait")
    .description("wait for Dori's next reply in a conversation")
    .argument("<conversationId>")
    .option("--after <seq>", "only replies after this sequence number", "0")
    .option("--timeout <seconds>", "give up after this many seconds", "600")
    .option("--url <url>", "gateway base URL")
    .action(
      async (
        id: string,
        options: UrlOption & { readonly after: string; readonly timeout: string },
      ) => {
        const agent = await client(options);
        const reply = await agent.waitForReply(ConversationIdSchema.parse(id), {
          afterSeq: Number(options.after),
          timeoutMs: Number(options.timeout) * 1000,
        });
        print({ reply });
      },
    );

  program
    .command("messages")
    .description("print a conversation's messages")
    .argument("<conversationId>")
    .option("--after <seq>", "only messages after this sequence number", "0")
    .option("--url <url>", "gateway base URL")
    .action(async (id: string, options: UrlOption & { readonly after: string }) => {
      const agent = await client(options);
      print(await agent.messages(ConversationIdSchema.parse(id), { after: Number(options.after) }));
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
        baseUrl: resolveBaseUrl(options.url, stored.baseUrl),
        onMessage: (message) => print(message),
      });
      await new Promise<void>((resolve) => process.once("SIGINT", () => resolve()));
    });
}
