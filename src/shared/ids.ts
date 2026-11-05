import { z } from "zod";

export const SenderIdSchema = z
  .string()
  .regex(/^s_[0-9a-z]{16}$/)
  .brand("SenderId");
export type SenderId = z.infer<typeof SenderIdSchema>;

export const ConversationIdSchema = z
  .string()
  .regex(/^s_[0-9a-z]{16}-[0-9a-z]{8}$/)
  .brand("ConversationId");
export type ConversationId = z.infer<typeof ConversationIdSchema>;

export const MessageIdSchema = z
  .string()
  .regex(/^m_[0-9a-z]{20}$/)
  .brand("MessageId");
export type MessageId = z.infer<typeof MessageIdSchema>;
