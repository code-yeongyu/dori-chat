import { z } from "zod";
import { ConversationIdSchema, MessageIdSchema, SenderIdSchema } from "./ids.ts";
import { LIMITS } from "./limits.ts";

const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u;

export const SenderNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(LIMITS.maxNameLength)
  .regex(NAME_PATTERN, "letters, digits, space, dot, underscore and dash only");
export type SenderName = z.infer<typeof SenderNameSchema>;

export const IdempotencyKeySchema = z
  .string()
  .regex(/^[\x21-\x7e]+$/, "printable ASCII without spaces")
  .min(1)
  .max(LIMITS.maxIdempotencyKeyLength);
export type IdempotencyKey = z.infer<typeof IdempotencyKeySchema>;

export const TextSchema = z.string().trim().min(1);

export const RoleSchema = z.enum(["agent", "dori"]);
export type Role = z.infer<typeof RoleSchema>;

export const SenderRefSchema = z.object({ id: SenderIdSchema, name: SenderNameSchema }).readonly();
export type SenderRef = z.infer<typeof SenderRefSchema>;

export const MessageSchema = z
  .object({
    id: MessageIdSchema,
    conversationId: ConversationIdSchema,
    seq: z.number().int().positive(),
    role: RoleSchema,
    text: z.string(),
    createdAt: z.iso.datetime(),
    agent: SenderRefSchema,
  })
  .readonly();
export type Message = z.infer<typeof MessageSchema>;

export const OwnConversationSchema = z
  .object({
    conversationId: ConversationIdSchema,
    lastSeq: z.number().int().min(0),
    createdAt: z.iso.datetime(),
  })
  .readonly();
export type OwnConversation = z.infer<typeof OwnConversationSchema>;

export const OwnConversationListSchema = z
  .object({ conversations: z.array(OwnConversationSchema).readonly() })
  .readonly();

export const RegisterRequestSchema = z.object({ name: SenderNameSchema }).readonly();
export const RegisterResponseSchema = z
  .object({ senderId: SenderIdSchema, name: SenderNameSchema, token: z.string() })
  .readonly();
export type RegisterResponse = z.infer<typeof RegisterResponseSchema>;

export const SendRequestSchema = z
  .object({ text: TextSchema, conversationId: ConversationIdSchema.optional() })
  .readonly();
export type SendRequest = z.infer<typeof SendRequestSchema>;

export const SendResponseSchema = z
  .object({ message: MessageSchema, duplicate: z.boolean() })
  .readonly();
export type SendResponse = z.infer<typeof SendResponseSchema>;

export const PollQuerySchema = z
  .object({
    after: z.coerce.number().int().min(0).default(0),
    wait: z.coerce.number().int().min(0).max(LIMITS.maxWaitSeconds).default(0),
  })
  .readonly();
export type PollQuery = z.infer<typeof PollQuerySchema>;

export const PollResponseSchema = z
  .object({
    conversationId: ConversationIdSchema,
    messages: z.array(MessageSchema).readonly(),
    nextAfter: z.number().int().min(0),
  })
  .readonly();
export type PollResponse = z.infer<typeof PollResponseSchema>;

export const ERROR_CODES = [
  "bad_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "payload_too_large",
  "rate_limited",
  "internal",
] as const;
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorBodySchema = z
  .object({
    error: z.object({ code: ErrorCodeSchema, message: z.string() }).readonly(),
    retryAfterSeconds: z.number().int().positive().optional(),
  })
  .readonly();
export type ErrorBody = z.infer<typeof ErrorBodySchema>;

export const LiveFrameSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("message"), message: MessageSchema }).readonly(),
]);
export type LiveFrame = z.infer<typeof LiveFrameSchema>;
