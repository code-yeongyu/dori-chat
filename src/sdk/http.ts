import ky, { HTTPError, NetworkError, TimeoutError, type KyInstance } from "ky";
import type { z } from "zod";
import { parseJson } from "../shared/json.ts";
import { ErrorBodySchema } from "../shared/schemas.ts";
import { GatewayError, GatewayTransportError } from "./errors.ts";

export const DEFAULT_BASE_URL = "https://dori-chat-gateway.code-yeon-gyu.workers.dev";

export type FetchLike = (input: Request, init?: RequestInit) => Promise<Response>;

export type HttpConfig = {
  readonly baseUrl?: string;
  readonly token?: string;
  readonly fetch?: FetchLike;
  readonly timeoutMs?: number;
};

export type RequestSpec<S extends z.ZodType> = {
  readonly method: "get" | "post";
  readonly path: string;
  readonly schema: S;
  readonly json?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  readonly searchParams?: Readonly<Record<string, number>>;
  readonly retry?: boolean;
};

const RETRY_STATUS = [408, 500, 502, 503, 504];

export class GatewayHttp {
  private readonly client: KyInstance;

  constructor(config: HttpConfig) {
    this.client = ky.create({
      baseUrl: `${(config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "")}/`,
      timeout: config.timeoutMs ?? 40_000,
      headers: config.token === undefined ? {} : { Authorization: `Bearer ${config.token}` },
      ...(config.fetch === undefined ? {} : { fetch: config.fetch }),
    });
  }

  async request<S extends z.ZodType>(spec: RequestSpec<S>): Promise<z.infer<S>> {
    try {
      const body = await this.client(spec.path.replace(/^\//, ""), {
        method: spec.method,
        headers: spec.headers ?? {},
        ...(spec.json === undefined ? {} : { json: spec.json }),
        ...(spec.searchParams === undefined ? {} : { searchParams: { ...spec.searchParams } }),
        retry:
          spec.retry === false
            ? 0
            : {
                limit: 2,
                methods: ["get", "post"],
                statusCodes: RETRY_STATUS,
                retryOnTimeout: true,
              },
      }).text();
      return spec.schema.parse(parseJson(body));
    } catch (error) {
      if (error instanceof HTTPError) throw gatewayErrorFrom(error.response, error.data);
      if (error instanceof TimeoutError)
        throw new GatewayTransportError("timeout", { cause: error });
      if (error instanceof NetworkError)
        throw new GatewayTransportError("network", { cause: error });
      throw error;
    }
  }
}

function retryAfterHeader(response: Response): number | undefined {
  const seconds = Number(response.headers.get("Retry-After"));
  return Number.isInteger(seconds) && seconds > 0 ? seconds : undefined;
}

function gatewayErrorFrom(response: Response, data: unknown): GatewayError {
  const { status } = response;
  const parsed = ErrorBodySchema.safeParse(typeof data === "string" ? parseJson(data) : data);
  const body = parsed.success
    ? parsed.data
    : { error: { code: "internal" as const, message: `unexpected ${status} response` } };
  const fromHeader = retryAfterHeader(response);
  return new GatewayError({
    status,
    body:
      body.retryAfterSeconds === undefined && fromHeader !== undefined
        ? { ...body, retryAfterSeconds: fromHeader }
        : body,
  });
}
