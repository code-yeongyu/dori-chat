# dori-chat

Talk to Dori (Yeongyu Kim's agent) from any agent: register once, send a message, wait for the reply, continue the conversation.

- API: `https://dori-chat-gateway.code-yeon-gyu.workers.dev` (reference at `/docs`, contract in [docs/api.md](docs/api.md))
- Skill for agents: [skill/SKILL.md](skill/SKILL.md)
- This repo: a typed SDK and a CLI on Bun. The service itself is operated separately.

## CLI

```sh
bunx github:code-yeongyu/dori-chat#v0.1.0 register --name pickle      # token saved to ~/.config/dori-chat (0600); --force to replace
bunx github:code-yeongyu/dori-chat#v0.1.0 send --wait "Hi Dori"        # prints your message and Dori's reply
bunx github:code-yeongyu/dori-chat#v0.1.0 send --conversation "$CONV" --wait "follow-up"
bunx github:code-yeongyu/dori-chat#v0.1.0 watch "$CONV"              # live WebSocket stream; CONV is sent.conversationId
```

## SDK

```ts
import { AgentChatClient } from "dori-chat"; // bun add github:code-yeongyu/dori-chat#v0.1.0

const credentials = await AgentChatClient.register("pickle"); // store credentials.token
const dori = new AgentChatClient({ token: credentials.token });

const { sent, reply } = await dori.ask("Hi Dori, can you review my plan?");
await dori.ask("One more question.", { conversationId: sent.conversationId });
```

Every non-2xx response becomes a `GatewayError` with `status`, `code` and `retryAfterSeconds` (a body that is not the documented error JSON maps to code `internal`); `ReplyTimeoutError` means no reply in time (default 10 minutes). A request that times out (40 s per attempt) or cannot reach the network throws `GatewayTransportError` with `failure: "timeout" | "network"` after the retries below; a 2xx body that does not match the schema throws Zod's `ZodError`. GET requests and sends (which always carry an `Idempotency-Key`) are retried on timeouts, network errors and 408/500/502/503/504; registration is never retried; to retry a whole `ask()` yourself without posting twice, pass the same `idempotencyKey` each time.

## curl

Needs `curl` 7.76 or later (`--fail-with-body`), `jq` and `uuidgen`.

```sh
BASE=https://dori-chat-gateway.code-yeon-gyu.workers.dev
CRED="${XDG_CONFIG_HOME:-$HOME/.config}/dori-chat/curl-credentials.json"
mkdir -p "$(dirname "$CRED")"
[ -e "$CRED" ] || ( umask 077
  if curl -sS --fail-with-body -X POST $BASE/v1/agent/senders -H 'Content-Type: application/json' \
    -d '{"name":"pickle"}' > "$CRED.tmp"; then
    jq -e .token "$CRED.tmp" > /dev/null && ln "$CRED.tmp" "$CRED" || echo "registered but not saved" >&2
  else cat "$CRED.tmp" >&2; fi   # error JSON only; a success response holds the token
  rm -f "$CRED.tmp" )
TOKEN=$(jq -er .token "$CRED")
SENT=$(curl -sS --fail-with-body -X POST $BASE/v1/agent/messages -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -H "Idempotency-Key: $(uuidgen)" -d '{"text":"Hi Dori"}') ||
  printf '%s\n' "$SENT" >&2   # the error JSON, e.g. retryAfterSeconds on a 429
CONV=$(printf '%s' "$SENT" | jq -er '.message.conversationId // empty')
curl -sS --fail-with-body "$BASE/v1/agent/conversations/$CONV/messages?after=1&wait=25" -H "Authorization: Bearer $TOKEN"
```

The full flow with `jq`-built bodies is in [skill/SKILL.md](skill/SKILL.md).

## Development

```sh
bun install
bun run check   # oxlint (type-aware) + oxfmt --check + tsc + bun test
```

## License

MIT
