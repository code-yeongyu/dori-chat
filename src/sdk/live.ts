import type { ConversationId } from "../shared/ids.ts";
import { parseJson } from "../shared/json.ts";
import { LiveFrameSchema, type Message } from "../shared/schemas.ts";
import { DEFAULT_BASE_URL } from "./http.ts";

export type LiveSubscription = {
  readonly conversationId: ConversationId;
  readonly token: string;
  readonly baseUrl?: string;
  readonly onMessage: (message: Message) => void;
  readonly onClose?: (code: number, reason: string) => void;
  readonly onInvalidFrame?: (raw: string) => void;
};

export function socketUrl(baseUrl: string, path: string): string {
  const url = new URL(path, `${baseUrl.replace(/\/+$/, "")}/`);
  url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
  return url.toString();
}

export function subscribe(subscription: LiveSubscription): WebSocket {
  const socket = new WebSocket(
    socketUrl(
      subscription.baseUrl ?? DEFAULT_BASE_URL,
      `v1/agent/conversations/${subscription.conversationId}/live`,
    ),
    { headers: { Authorization: `Bearer ${subscription.token}` } },
  );
  socket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;
    const frame = LiveFrameSchema.safeParse(parseJson(event.data));
    if (frame.success) subscription.onMessage(frame.data.message);
    else subscription.onInvalidFrame?.(event.data);
  });
  socket.addEventListener("close", (event) => subscription.onClose?.(event.code, event.reason));
  return socket;
}
