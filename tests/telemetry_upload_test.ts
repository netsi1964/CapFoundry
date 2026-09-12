/**
 * What leaves the machine (PRD-FEAT-009.3, MVP section 13 and 21).
 *
 * The local log is deliberately richer than anything uploaded. That asymmetry
 * only means something if it is checked at the boundary rather than promised
 * in a comment, so these tests stand up a receiver and read what actually
 * arrives.
 */

import { assert, assertEquals } from "@std/assert";
import { Telemetry } from "../cfcm/telemetry/telemetry.ts";

const SENSITIVE = "look up customer C-1002 in the internal CRM";

async function withReceiver(
  fn: (endpoint: string, received: Record<string, unknown>[]) => Promise<void>,
) {
  const received: Record<string, unknown>[] = [];
  const controller = new AbortController();
  const server = Deno.serve(
    { port: 0, signal: controller.signal, onListen: () => {} },
    async (req) => {
      received.push(await req.json());
      return new Response("ok");
    },
  );
  const { port } = server.addr as Deno.NetAddr;
  try {
    await fn(`http://127.0.0.1:${port}/`, received);
  } finally {
    controller.abort();
    await server.finished;
  }
}

async function withDir(fn: (dir: string) => Promise<void>) {
  const dir = await Deno.makeTempDir({ prefix: "cfcm-telemetry-" });
  try {
    await fn(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

Deno.test("the query is written locally but stripped before upload", async () => {
  await withDir(async (dir) => {
    await withReceiver(async (endpoint, received) => {
      const telemetry = new Telemetry(
        { local: true, upload: true, endpoint, logQueryText: true },
        dir,
      );
      await telemetry.record({
        eventType: "search",
        status: "NO_MATCH",
        queryText: SENSITIVE,
        queryTokenCount: 7,
      });

      // Upload is fire-and-forget, so give it a moment to arrive.
      for (let i = 0; i < 50 && received.length === 0; i++) {
        await new Promise((r) => setTimeout(r, 20));
      }
      assertEquals(received.length, 1, "the event should have been uploaded");

      const uploaded = JSON.stringify(received[0]);
      assert(!uploaded.includes("C-1002"), "the query reached the network");
      assert(!uploaded.includes("CRM"), "the query reached the network");
      assert(!("queryText" in received[0]), "queryText must not be in the uploaded object at all");

      // The count survives, because it carries no content.
      assertEquals(received[0].queryTokenCount, 7);

      let local = "";
      for await (const entry of Deno.readDir(dir)) {
        local += await Deno.readTextFile(`${dir}/${entry.name}`);
      }
      assert(local.includes("C-1002"), "the query should be recorded locally");
    });
  });
});

Deno.test("logQueryText false drops it from the local log too", async () => {
  await withDir(async (dir) => {
    const telemetry = new Telemetry(
      { local: true, upload: false, endpoint: null, logQueryText: false },
      dir,
    );
    await telemetry.record({ eventType: "search", status: "NO_MATCH", queryText: SENSITIVE });

    let local = "";
    for await (const entry of Deno.readDir(dir)) {
      local += await Deno.readTextFile(`${dir}/${entry.name}`);
    }
    assert(!local.includes("C-1002"), "opting out must actually opt out");
    assert(local.includes('"eventType":"search"'), "the event itself is still recorded");
  });
});

Deno.test("nothing is uploaded when upload is off", async () => {
  await withDir(async (dir) => {
    await withReceiver(async (endpoint, received) => {
      const telemetry = new Telemetry(
        { local: true, upload: false, endpoint, logQueryText: true },
        dir,
      );
      await telemetry.record({ eventType: "search", status: "MATCH", queryText: SENSITIVE });

      await new Promise((r) => setTimeout(r, 200));
      assertEquals(received.length, 0, "upload is opt-in and was off");
    });
  });
});

Deno.test("upload defaults to off", async () => {
  const { DEFAULT_CONFIG } = await import("../cfcm/config/config.ts");
  assertEquals(DEFAULT_CONFIG.telemetry.upload, false);
  assertEquals(DEFAULT_CONFIG.telemetry.endpoint, null);
});
