import { chmod, mkdir, writeFile } from "node:fs/promises";
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

export async function saveCredentials(credentials: StoredCredentials): Promise<string> {
  await mkdir(configDir(), { recursive: true, mode: 0o700 });
  const path = join(configDir(), "credentials.json");
  await writeFile(path, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
  return path;
}
