import { describe, expect, test } from "bun:test";
import { AgentChatClient, GatewayError, ReplyTimeoutError } from "../src/sdk/index.ts";
import { fakeGateway } from "./support/fake-gateway.ts";

const BASE_URL = "http://gateway.test";

describe("AgentChatClient", () => {
  test("ask() resolves with Dori's reply once the long poll sees it", async () => {
    const gateway = fakeGateway();
    const credentials = await AgentChatClient.register("me", {
      baseUrl: BASE_URL,
      fetch: gateway.fetch,
    });
    const client = new AgentChatClient({
      baseUrl: BASE_URL,
      fetch: gateway.fetch,
      token: credentials.token,
    });

    const sent = gateway.nextSend();
    const exchange = client.ask("hello", { timeoutMs: 10_000 });
    await sent;
    gateway.reply("hi back");
    const { sent: mine, reply } = await exchange;

    expect([mine.text, reply.role, reply.text]).toEqual(["hello", "dori", "hi back"]);
  });

  test("a retried send carries the same Idempotency-Key as the failed attempt", async () => {
    const gateway = fakeGateway();
    const client = new AgentChatClient({ baseUrl: BASE_URL, fetch: gateway.fetch, token: "t" });
    gateway.failNext(503, { error: { code: "internal", message: "busy" } });

    await client.send("once");
    await client.send("twice");

    const [failed, retried, next] = gateway.seenIdempotencyKeys;
    expect(gateway.seenIdempotencyKeys).toHaveLength(3);
    expect(retried).toBe(failed);
    expect(next).not.toBe(failed);
  });

  test("a refusal surfaces as a GatewayError carrying status, code and Retry-After", async () => {
    const gateway = fakeGateway();
    const client = new AgentChatClient({ baseUrl: BASE_URL, fetch: gateway.fetch, token: "t" });
    gateway.failNext(429, {
      error: { code: "rate_limited", message: "rate limit exceeded" },
      retryAfterSeconds: 42,
    });

    const failure = await client.send("hi").catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(GatewayError);
    expect(failure).toMatchObject({ status: 429, code: "rate_limited", retryAfterSeconds: 42 });
  });

  test("waitForReply gives up with ReplyTimeoutError when Dori never answers", async () => {
    const gateway = fakeGateway({ holdPolls: false });
    const client = new AgentChatClient({ baseUrl: BASE_URL, fetch: gateway.fetch, token: "t" });
    const { message } = await client.send("anyone?");

    const result = await client
      .waitForReply(message.conversationId, { afterSeq: message.seq, timeoutMs: 20 })
      .catch((error: unknown) => error);

    expect(result).toBeInstanceOf(ReplyTimeoutError);
  });

  test.each([
    ["a space", "has space"],
    ["129 characters", "k".repeat(129)],
  ])("a key with %s is rejected before any request is sent", async (_label, key) => {
    const gateway = fakeGateway();
    const client = new AgentChatClient({ baseUrl: BASE_URL, fetch: gateway.fetch, token: "t" });

    const failure = await client
      .send("hi", { idempotencyKey: key })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(gateway.seenIdempotencyKeys).toEqual([]);
  });
});
