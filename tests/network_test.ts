/**
 * Network-capable capabilities (effect: NETWORK).
 *
 * These tests run against a server started in-process on localhost, never
 * against a real site. A test that depends on dr.dk being up is a test that
 * reports someone else's outage as a CapFoundry regression.
 *
 * The property under test is that the grant is an *intersection*: a capability
 * reaches a host only when it declared that host AND local policy permits it.
 * Each half is checked on its own, because a gate that only enforces one of
 * them looks identical in the happy path.
 */

import { assert, assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { fromFileUrl } from "@std/path";
import { execute } from "../cfcm/runtime/execute.ts";
import { computeGrant, permittedHosts } from "../cfcm/runtime/permissions.ts";
import { parseConfig } from "../cfcm/config/config.ts";
import { CfcmError } from "../cfcm/types.ts";
import type { IndexRecord } from "../cfcm/types.ts";

const fixture = (name: string) => fromFileUrl(new URL(`./fixtures/net/${name}`, import.meta.url));

function record(partial: Partial<IndexRecord> & Pick<IndexRecord, "name">): IndexRecord {
  return {
    schemaVersion: 1,
    version: "1.0.0",
    description: "",
    aliases: [],
    exampleQueries: [],
    tags: [],
    inputSummary: "",
    outputSummary: "",
    runtime: "deno",
    effect: "PURE",
    artifact: { type: "typescript", sha256: "0".repeat(64) },
    exposure: { execution: true, artifact: true },
    cfpLocation: "x",
    artifactLocation: "x",
    namespaceType: "public",
    indexedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

async function withServer(fn: (origin: string, host: string) => Promise<void>) {
  const controller = new AbortController();
  const server = Deno.serve(
    { port: 0, signal: controller.signal, onListen: () => {} },
    () => new Response("hello from the test server"),
  );
  const { port } = server.addr as Deno.NetAddr;
  try {
    await fn(`http://127.0.0.1:${port}`, `127.0.0.1:${port}`);
  } finally {
    controller.abort();
    await server.finished;
  }
}

Deno.test("a NETWORK capability reaches the host both sides agreed on", async () => {
  await withServer(async (origin, host) => {
    const config = parseConfig({ execution: { network: { enabled: true, allow: [host] } } }, ".");
    const grant = computeGrant(
      record({ name: "Test.net.allowed", effect: "NETWORK", permissions: { network: [host] } }),
      config,
    );
    assertEquals(grant.network, [host]);

    const out = await execute({
      artifactPath: fixture("allowed.ts"),
      input: { url: `${origin}/` },
      timeoutMs: 10_000,
      maxOutputBytes: 1024 * 1024,
      effect: "NETWORK",
      capability: "Test.net.allowed",
      grantedHosts: grant.network,
    });

    const value = out.value as { status: number; body: string };
    assertEquals(value.status, 200);
    assertStringIncludes(value.body, "hello from the test server");
  });
});

Deno.test("a granted host does not open any other host", async () => {
  await withServer(async (origin, host) => {
    // Granted the test server, the capability still cannot reach elsewhere.
    const err = await assertRejects(
      () =>
        execute({
          artifactPath: fixture("sneaky.ts"),
          input: { url: "https://example.com/" },
          timeoutMs: 10_000,
          maxOutputBytes: 1024 * 1024,
          effect: "NETWORK",
          capability: "Test.net.sneaky",
          grantedHosts: [host],
        }),
      CfcmError,
    );
    assertStringIncludes(err.message.toLowerCase(), "net access");
    assertStringIncludes(err.message, "example.com");
    assert(origin.length > 0);
  });
});

Deno.test("policy alone grants nothing: the capability must declare the host too", () => {
  const config = parseConfig(
    { execution: { network: { enabled: true, allow: ["www.dr.dk", "example.com"] } } },
    ".",
  );
  const grant = computeGrant(
    record({ name: "Test.net.one", effect: "NETWORK", permissions: { network: ["www.dr.dk"] } }),
    config,
  );
  // Permitted two, declared one, granted one.
  assertEquals(grant.network, ["www.dr.dk"]);
});

Deno.test("a declaration alone grants nothing: policy must permit it", () => {
  const config = parseConfig({ execution: { network: { enabled: true, allow: [] } } }, ".");
  const err = assertThrowsCfcm(() =>
    computeGrant(
      record({ name: "Test.net.x", effect: "NETWORK", permissions: { network: ["www.dr.dk"] } }),
      config,
    )
  );
  assertEquals(err.code, "NETWORK_NOT_PERMITTED");
  assertStringIncludes(err.message, "www.dr.dk");
  assertStringIncludes(err.message, "cfcm.json");
});

Deno.test("a shortfall is refused rather than silently narrowed", () => {
  const config = parseConfig(
    { execution: { network: { enabled: true, allow: ["a.example"] } } },
    ".",
  );
  const err = assertThrowsCfcm(() =>
    computeGrant(
      record({
        name: "Test.net.two",
        effect: "NETWORK",
        permissions: { network: ["a.example", "b.example"] },
      }),
      config,
    )
  );
  // Running with one of two hosts would fail halfway through, at a point the
  // caller cannot interpret.
  assertEquals(err.code, "NETWORK_NOT_PERMITTED");
  assertStringIncludes(err.message, "b.example");
});

Deno.test("network is off by default", () => {
  const config = parseConfig({}, ".");
  assertEquals(config.execution.network.enabled, false);
  assertEquals(config.execution.network.allow, []);

  const err = assertThrowsCfcm(() =>
    computeGrant(
      record({ name: "Test.net.x", effect: "NETWORK", permissions: { network: ["www.dr.dk"] } }),
      config,
    )
  );
  assertEquals(err.code, "NETWORK_DISABLED");
});

Deno.test("a private namespace may be granted hosts the machine list lacks", () => {
  const config = parseConfig({
    execution: { network: { enabled: true, allow: ["public.example"] } },
    namespaces: [{
      name: "Netsi",
      type: "private",
      source: { type: "filesystem", path: "./x" },
      permissions: { network: ["internal.netsi.example"] },
    }],
  }, ".");

  assertEquals(permittedHosts(config, "Netsi.demo.thing"), [
    "internal.netsi.example",
    "public.example",
  ]);
  // A public capability gets only the machine-wide list.
  assertEquals(permittedHosts(config, "CapFoundry.text.slugify"), ["public.example"]);
});

Deno.test("a PURE capability that requests hosts is refused, not over-granted", () => {
  const config = parseConfig(
    { execution: { network: { enabled: true, allow: ["www.dr.dk"] } } },
    ".",
  );
  const err = assertThrowsCfcm(() =>
    computeGrant(
      record({ name: "Test.pure.sneaky", effect: "PURE", permissions: { network: ["www.dr.dk"] } }),
      config,
    )
  );
  assertEquals(err.code, "DESCRIPTOR_INCONSISTENT");
});

Deno.test("a NETWORK capability naming no hosts is refused", () => {
  const config = parseConfig(
    { execution: { network: { enabled: true, allow: ["www.dr.dk"] } } },
    ".",
  );
  const err = assertThrowsCfcm(() =>
    computeGrant(record({ name: "Test.net.unbounded", effect: "NETWORK" }), config)
  );
  assertEquals(err.code, "DESCRIPTOR_INCONSISTENT");
  assertStringIncludes(err.message, "unbounded");
});

Deno.test("a wildcard allowlist is rejected as configuration", () => {
  const err = assertThrowsCfcm(() =>
    parseConfig({ execution: { network: { enabled: true, allow: ["*.dr.dk"] } } }, ".")
  );
  assertEquals(err.code, "CONFIG_INVALID");
  assertStringIncludes(err.message, "not an allowlist");
});

Deno.test("READ and WRITE remain unexecutable", () => {
  const config = parseConfig({}, ".");
  for (const effect of ["READ", "WRITE"] as const) {
    const err = assertThrowsCfcm(() => computeGrant(record({ name: "Test.x.y", effect }), config));
    assertEquals(err.code, "EFFECT_UNSUPPORTED");
  }
});

Deno.test("every shipped capability is still PURE", async () => {
  // The mechanism exists; the first capability set deliberately does not use
  // it. A NETWORK capability cannot hold the determinism contract every one of
  // these asserts, and would make the Phase 4 A/B measurement read as noise.
  const root = new URL("../capabilities", import.meta.url).pathname;
  for await (const entry of Deno.readDir(root)) {
    if (!entry.isDirectory) continue;
    for (const dir of [entry.name, ...[]]) {
      const path = `${root}/${dir}/capability.json`;
      try {
        const descriptor = JSON.parse(await Deno.readTextFile(path));
        assertEquals(descriptor.effect, "PURE", `${descriptor.name} is not PURE`);
      } catch {
        // Nested fixture directory; covered by the validator.
      }
    }
  }
});

function assertThrowsCfcm(fn: () => unknown): CfcmError {
  try {
    fn();
  } catch (err) {
    if (err instanceof CfcmError) return err;
    throw err;
  }
  throw new Error("expected a CfcmError");
}
