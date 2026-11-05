import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { SenderIdSchema } from "../shared/ids.ts";
import { parseJson } from "../shared/json.ts";
import { DEFAULT_BASE_URL } from "../sdk/http.ts";

const CredentialsSchema = z
  .object({
    baseUrl: z.url(),
    senderId: SenderIdSchema,
    name: z.string(),
    token: z.string(),
  })
  .readonly();
export type StoredCredentials = z.infer<typeof CredentialsSchema>;

export class MissingConfigError extends Error {
  override readonly name = "MissingConfigError";
}

export function configDir(): string {
  return process.env["DORI_CHAT_HOME"] ?? join(homedir(), ".config", "dori-chat");
}

export function resolveBaseUrl(flag: string | undefined, stored: string | undefined): string {
  return flag ?? process.env["DORI_CHAT_URL"] ?? stored ?? DEFAULT_BASE_URL;
}

async function readJson(path: string): Promise<unknown> {
  const file = Bun.file(path);
  return (await file.exists()) ? parseJson(await file.text()) : undefined;
}

export async function loadCredentials(): Promise<StoredCredentials> {
  const parsed = CredentialsSchema.safeParse(await readJson(join(configDir(), "credentials.json")));
  if (parsed.success) return parsed.data;
  throw new MissingConfigError("not registered yet: run `dori-chat register --name <name>` first");
}

export type SaveOptions = { readonly overwrite: boolean };

const credentialsPath = (): string => join(configDir(), "credentials.json");

// Run before registering, so a refused save never creates a sender on the server.
export async function assertCanRegister(options: SaveOptions): Promise<void> {
  const path = credentialsPath();
  if (!options.overwrite && (await Bun.file(path).exists())) {
    throw new MissingConfigError(
      `already registered (${path}); pass --force to replace that token`,
    );
  }
}

export async function saveCredentials(
  credentials: StoredCredentials,
  options: SaveOptions,
): Promise<string> {
  await mkdir(configDir(), { recursive: true, mode: 0o700 });
  await chmod(configDir(), 0o700);
  await assertCanRegister(options);
  const path = credentialsPath();
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(credentials, null, 2)}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
  return path;
}

export function boundBaseUrl(flag: string | undefined, stored: StoredCredentials): string {
  const requested = resolveBaseUrl(flag, stored.baseUrl);
  if (requested !== stored.baseUrl) {
    throw new MissingConfigError(
      `these credentials were issued by ${stored.baseUrl}; register again to talk to ${requested}`,
    );
  }
  return requested;
}
