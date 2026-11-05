import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "..", "src", "cli", "main.ts");

let home = "";
let sends = 0;
let server: ReturnType<typeof Bun.serve> | undefined;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "dori-chat-options-"));
  sends = 0;
  server = Bun.serve({
    port: 0,
    fetch: () => {
      sends += 1;
      return Response.json(
        { error: { code: "internal", message: "not expected" } },
        { status: 500 },
      );
    },
  });
  await writeFile(
    join(home, "credentials.json"),
    JSON.stringify({
      baseUrl: `http://127.0.0.1:${server.port}`,
      senderId: "s_0123456789abcdef",
      name: "me",
      token: "dct_test",
    }),
  );
});
afterEach(async () => {
  await server?.stop(true);
  await rm(home, { recursive: true, force: true });
});

async function cli(...args: string[]): Promise<{ readonly code: number; readonly stderr: string }> {
  const child = Bun.spawn(["bun", CLI, ...args], {
    env: { ...process.env, DORI_CHAT_HOME: home },
    stdout: "ignore",
    stderr: "pipe",
  });
  const stderr = await new Response(child.stderr).text();
  return { code: await child.exited, stderr };
}

describe("dori-chat number options", () => {
  test.each([["abc"], ["0"], ["1.5"], [""]])(
    "send --wait --timeout %p is refused before anything is sent",
    async (value) => {
      const result = await cli("send", "--wait", "--timeout", value, "hello");

      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("--timeout");
      expect(sends).toBe(0);
    },
  );

  test("messages --after -1 is refused before any request", async () => {
    const result = await cli("messages", "--after", "-1", "s_0123456789abcdef-c0000001");

    expect(result.code).not.toBe(0);
    expect(sends).toBe(0);
  });
});
