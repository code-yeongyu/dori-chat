import {
  ConversationIdSchema,
  MessageIdSchema,
  SenderIdSchema,
  type SenderId,
} from "../../src/shared/ids.ts";
import { SendRequestSchema, type Message } from "../../src/shared/schemas.ts";

const randomTail = (length: number): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(length)), (byte) => (byte % 10).toString()).join(
    "",
  );

export type FakeGateway = {
  readonly fetch: (request: Request) => Promise<Response>;
  readonly seenIdempotencyKeys: string[];
  readonly reply: (text: string) => void;
  readonly failNext: (
    status: number,
    body: unknown,
    headers?: Readonly<Record<string, string>>,
  ) => void;
  readonly calls: { register: number; poll: number };
  readonly nextSend: () => Promise<Message>;
};

export type FakeOptions = { readonly holdPolls: boolean };

const json = (
  status: number,
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
): Response =>
  typeof body === "string"
    ? new Response(body, { status, headers: { "Content-Type": "text/html", ...headers } })
    : new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...headers },
      });

export function fakeGateway(options: FakeOptions = { holdPolls: true }): FakeGateway {
  const sender: SenderId = SenderIdSchema.parse(`s_${randomTail(16)}`);
  const messages: Message[] = [];
  const seenIdempotencyKeys: string[] = [];
  const failures: Response[] = [];
  const calls = { register: 0, poll: 0 };
  let wake: () => void = () => undefined;
  const sendListeners: ((message: Message) => void)[] = [];
  const conversationId = ConversationIdSchema.parse(`${sender}-${randomTail(8)}`);
  const append = (role: Message["role"], text: string): Message => {
    const message: Message = {
      id: MessageIdSchema.parse(`m_${randomTail(20)}`),
      conversationId,
      seq: messages.length + 1,
      role,
      text,
      createdAt: new Date().toISOString(),
      agent: { id: sender, name: "fake-agent" },
    };
    messages.push(message);
    wake();
    return message;
  };
  const fetch = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (url.pathname === "/v1/agent/senders") calls.register += 1;
    if (request.method === "GET") calls.poll += 1;
    const isSend = request.method === "POST" && url.pathname === "/v1/agent/messages";
    if (isSend) seenIdempotencyKeys.push(request.headers.get("Idempotency-Key") ?? "");
    const failure = failures.shift();
    if (failure !== undefined) return failure;
    if (request.method === "POST" && url.pathname === "/v1/agent/senders") {
      return json(201, {
        senderId: sender,
        name: "fake-agent",
        token: `dct_${sender}_${"a".repeat(43)}`,
      });
    }
    if (isSend) {
      const body = SendRequestSchema.parse(await request.json());
      const message = append("agent", body.text);
      for (const listener of sendListeners.splice(0)) listener(message);
      return json(202, { message, duplicate: false });
    }
    const after = Number(url.searchParams.get("after") ?? "0");
    const pending = (): Message[] => messages.filter((message) => message.seq > after);
    if (
      options.holdPolls &&
      pending().length === 0 &&
      Number(url.searchParams.get("wait") ?? "0") > 0
    ) {
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
    const page = pending();
    return json(200, { conversationId, messages: page, nextAfter: page.at(-1)?.seq ?? after });
  };
  return {
    fetch,
    seenIdempotencyKeys,
    reply: (text) => {
      append("dori", text);
    },
    failNext: (status, body, headers = {}) => {
      failures.push(json(status, body, headers));
    },
    calls,
    nextSend: () => new Promise((resolve) => sendListeners.push(resolve)),
  };
}
