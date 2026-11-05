import { describe, expect, test } from "bun:test";
import { AgentChatClient, ConversationIdSchema, GatewayError } from "../src/sdk/index.ts";
import { fakeGateway } from "./support/fake-gateway.ts";

const BASE_URL = "http://gateway.test";
const BUSY = { error: { code: "internal", message: "busy" } };

describe("SDK transport policy", () => {
  test("registration is never retried, so a 503 surfaces after exactly one attempt", async () => {
    const gateway = fakeGateway();
    gateway.failNext(503, BUSY);

    const failure = await AgentChatClient.register("me", {
      baseUrl: BASE_URL,
      fetch: gateway.fetch,
    }).catch((error: unknown) => error);

    expect(failure).toMatchObject({ status: 503 });
    expect(gateway.calls.register).toBe(1);
  });

  test("a read is retried after a 503 and then succeeds", async () => {
    const gateway = fakeGateway({ holdPolls: false });
    const client = new AgentChatClient({ baseUrl: BASE_URL, fetch: gateway.fetch, token: "t" });
    const { message } = await client.send("hello");
    gateway.failNext(503, BUSY);

    const page = await client.messages(ConversationIdSchema.parse(message.conversationId));

    expect(page.messages.map((m) => m.text)).toEqual(["hello"]);
    expect(gateway.calls.poll).toBe(2);
  });

  test("a non-JSON error body maps to internal and takes Retry-After from the header", async () => {
    const gateway = fakeGateway();
    const client = new AgentChatClient({ baseUrl: BASE_URL, fetch: gateway.fetch, token: "t" });
    gateway.failNext(429, "<html>slow down</html>", { "Retry-After": "17" });

    const failure = await client.send("hi").catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(GatewayError);
    expect(failure).toMatchObject({ status: 429, code: "internal", retryAfterSeconds: 17 });
  });
});
