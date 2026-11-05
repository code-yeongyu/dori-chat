export const LIMITS = {
  maxBodyBytes: 16 * 1024,
  maxTextBytes: 8 * 1024,
  maxNameLength: 48,
  maxIdempotencyKeyLength: 128,
  maxWaitSeconds: 25,
} as const;

export const RATE_LIMITS = {
  messagesPerMinute: 20,
  messagesPerDay: 500,
  registrationsPerIpPerHour: 5,
} as const;
