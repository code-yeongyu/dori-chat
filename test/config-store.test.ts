import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertCanRegister,
  boundBaseUrl,
  saveCredentials,
  type StoredCredentials,
} from "../src/cli/config-store.ts";
import { SenderIdSchema } from "../src/shared/ids.ts";

const credentials: StoredCredentials = {
  baseUrl: "https://gateway.test",
  senderId: SenderIdSchema.parse("s_0123456789abcdef"),
  name: "me",
  token: "dct_secret",
};

let home = "";
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "dori-chat-config-"));
  process.env["DORI_CHAT_HOME"] = home;
});
afterEach(async () => {
  delete process.env["DORI_CHAT_HOME"];
  await rm(home, { recursive: true, force: true });
});

describe("stored credentials", () => {
  test("the credentials file is private to the user", async () => {
    const path = await saveCredentials(credentials, { overwrite: false });

    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  test("a second registration does not silently replace the first token", async () => {
    await saveCredentials(credentials, { overwrite: false });

    const refused = await saveCredentials(
      { ...credentials, token: "other" },
      { overwrite: false },
    ).catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(Error);
    expect(await Bun.file(join(home, "credentials.json")).json()).toMatchObject({
      token: "dct_secret",
    });
  });

  test("the token is only sent to the gateway that issued it", () => {
    expect(boundBaseUrl(undefined, credentials)).toBe("https://gateway.test");
    expect(() => boundBaseUrl("https://elsewhere.test", credentials)).toThrow();
  });

  test("the pre-register check refuses an existing registration unless forced", async () => {
    await saveCredentials(credentials, { overwrite: false });

    expect(assertCanRegister({ overwrite: false })).rejects.toThrow("already registered");
    expect(assertCanRegister({ overwrite: true })).resolves.toBeUndefined();
  });

  test("a save that cannot complete leaves no temporary file behind", async () => {
    await mkdir(join(home, "credentials.json", "occupied"), { recursive: true });

    const failed = await saveCredentials(credentials, { overwrite: true }).catch(
      (error: unknown) => error,
    );

    expect(failed).toBeInstanceOf(Error);
    expect((await readdir(home)).toSorted()).toEqual(["credentials.json"]);
  });
});
