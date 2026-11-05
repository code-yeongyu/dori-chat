import type { ConversationId, SenderId } from "../shared/ids.ts";
import { LIMITS } from "../shared/limits.ts";
import {
  IdempotencyKeySchema,
  OwnConversationListSchema,
  OwnConversationSchema,
  PollResponseSchema,
  RegisterResponseSchema,
  SendResponseSchema,
  type Message,
  type OwnConversation,
  type PollResponse,
  type SendResponse,
} from "../shared/schemas.ts";
import { ReplyTimeoutError } from "./errors.ts";
import { GatewayHttp, type HttpConfig } from "./http.ts";

export type AgentCredentials = {
  readonly senderId: SenderId;
  readonly name: string;
  readonly token: string;
};

export type SendOptions = {
  readonly conversationId?: ConversationId;
  readonly idempotencyKey?: string;
};

export type ReadOptions = { readonly after?: number; readonly waitSeconds?: number };

export type WaitOptions = { readonly afterSeq: number; readonly timeoutMs?: number };

export type Exchange = { readonly sent: Message; readonly reply: Message };

export type AskOptions = {
  readonly conversationId?: ConversationId;
  readonly timeoutMs?: number;
  readonly idempotencyKey?: string;
};

const DEFAULT_REPLY_TIMEOUT_MS = 10 * 60_000;

export class AgentChatClient {
  private readonly http: GatewayHttp;

  constructor(readonly config: HttpConfig & { readonly token: string }) {
    this.http = new GatewayHttp(config);
  }

  static async register(
    name: string,
    config: Omit<HttpConfig, "token"> = {},
  ): Promise<AgentCredentials> {
    const response = await new GatewayHttp(config).request({
      method: "post",
      path: "/v1/agent/senders",
      schema: RegisterResponseSchema,
      json: { name },
      retry: false,
    });
    return { senderId: response.senderId, name: response.name, token: response.token };
  }

  startConversation(): Promise<OwnConversation> {
    return this.http.request({
      method: "post",
      path: "/v1/agent/conversations",
      schema: OwnConversationSchema,
      retry: false,
    });
  }

  async conversations(): Promise<readonly OwnConversation[]> {
    const response = await this.http.request({
      method: "get",
      path: "/v1/agent/conversations",
      schema: OwnConversationListSchema,
    });
    return response.conversations;
  }

  async send(text: string, options: SendOptions = {}): Promise<SendResponse> {
    return this.http.request({
      method: "post",
      path: "/v1/agent/messages",
      schema: SendResponseSchema,
      json:
        options.conversationId === undefined
          ? { text }
          : { text, conversationId: options.conversationId },
      headers: {
        "Idempotency-Key": IdempotencyKeySchema.parse(
          options.idempotencyKey ?? crypto.randomUUID(),
        ),
      },
    });
  }

  messages(conversationId: ConversationId, options: ReadOptions = {}): Promise<PollResponse> {
    return this.http.request({
      method: "get",
      path: `/v1/agent/conversations/${conversationId}/messages`,
      schema: PollResponseSchema,
      searchParams: { after: options.after ?? 0, wait: options.waitSeconds ?? 0 },
    });
  }

  async waitForReply(conversationId: ConversationId, options: WaitOptions): Promise<Message> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_REPLY_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;
    let after = options.afterSeq;
    while (Date.now() < deadline) {
      const remaining = Math.ceil((deadline - Date.now()) / 1000);
      const page = await this.messages(conversationId, {
        after,
        waitSeconds: Math.max(1, Math.min(LIMITS.maxWaitSeconds, remaining)),
      });
      const reply = page.messages.find((message) => message.role === "dori");
      if (reply !== undefined) return reply;
      after = page.nextAfter;
    }
    throw new ReplyTimeoutError(timeoutMs);
  }

  async ask(text: string, options: AskOptions = {}): Promise<Exchange> {
    const { message } = await this.send(text, {
      ...(options.conversationId === undefined ? {} : { conversationId: options.conversationId }),
      ...(options.idempotencyKey === undefined ? {} : { idempotencyKey: options.idempotencyKey }),
    });
    const reply = await this.waitForReply(message.conversationId, {
      afterSeq: message.seq,
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    });
    return { sent: message, reply };
  }
}
