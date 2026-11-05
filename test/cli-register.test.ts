import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "..", "src", "cli", "main.ts");

let home = "";
let registrations = 0;
let server: ReturnType<typeof Bun.serve> | undefined;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "dori-chat-cli-"));
  registrations = 0;
  server = Bun.serve({
    port: 0,
    fetch: () => {
      registrations += 1;
      return Response.json(
        {
          senderId: `s_${String(registrations).padStart(16, "0")}`,
          name: "me",
          token: `dct_${registrations}`,
        },
        { status: 201 },
      );
    },
  });
});
afterEach(async () => {
  await server?.stop(true);
  await rm(home, { recursive: true, force: true });
});

async function register(...extra: string[]): Promise<number> {
  const child = Bun.spawn(
    ["bun", CLI, "register", "--name", "me", "--url", `http://127.0.0.1:${server?.port}`, ...extra],
    {
      env: { ...process.env, DORI_CHAT_HOME: home },
      stdout: "ignore",
      stderr: "ignore",
    },
  );
  return child.exited;
}

describe("dori-chat register", () => {
  test("a second register without --force is refused before any request reaches the gateway", async () => {
    expect(await register()).toBe(0);

    const refused = await register();

    expect(refused).toBe(2);
    expect(registrations).toBe(1);
  });

  test("--force registers again and replaces the stored token", async () => {
    await register();

    expect(await register("--force")).toBe(0);
    expect(registrations).toBe(2);
    expect(await Bun.file(join(home, "credentials.json")).json()).toMatchObject({ token: "dct_2" });
  });
});
