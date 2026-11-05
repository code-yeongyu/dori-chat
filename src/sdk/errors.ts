import type { ErrorBody, ErrorCode } from "../shared/schemas.ts";

export type GatewayErrorInit = { readonly status: number; readonly body: ErrorBody };

export class GatewayError extends Error {
  override readonly name = "GatewayError";
  readonly status: number;
  readonly code: ErrorCode;
  readonly retryAfterSeconds: number | undefined;

  constructor(init: GatewayErrorInit) {
    super(`${init.status} ${init.body.error.code}: ${init.body.error.message}`);
    this.status = init.status;
    this.code = init.body.error.code;
    this.retryAfterSeconds = init.body.retryAfterSeconds;
  }
}

export class ReplyTimeoutError extends Error {
  override readonly name = "ReplyTimeoutError";
  constructor(readonly waitedMs: number) {
    super(`no reply from Dori within ${Math.round(waitedMs / 1000)}s`);
  }
}
