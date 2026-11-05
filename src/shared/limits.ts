export const LIMITS = {
  maxBodyBytes: 16 * 1024,
  maxTextBytes: 8 * 1024,
  maxNameLength: 48,
  maxIdempotencyKeyLength: 128,
  maxWaitSeconds: 25,
} as const;

export type RateRule = {
  readonly limit: number;
  readonly windowMs: number;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const RATE_RULES = {
  senderPerMinute: { limit: 20, windowMs: MINUTE },
  senderPerDay: { limit: 500, windowMs: DAY },
  registerPerIpPerHour: { limit: 5, windowMs: HOUR },
} as const satisfies Record<string, RateRule>;
