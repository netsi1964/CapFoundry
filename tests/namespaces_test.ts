/**
 * Namespace integration tests (PRD-FEAT-011, PRD-FEAT-012, OBJ-6).
 *
 * The claim under test is that public, private and Local.* capabilities form
 * *one* search space while keeping *different* policies. Both halves matter:
 * a single space with a single policy would leak private code, and separate
 * spaces would make the agent choose a registry before it could search.
 */

import { assert, assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { Cfcm } from "../cfcm/core.ts";
import type { RegistryIndex } from "../cfcm/types.ts";
import { CfcmError } from "../cfcm/types.ts";
import { parseConfig } from "../cfcm/config/config.ts";

const REPO_ROOT = new URL("..", import.meta.url).pathname;

async function withCfcm(fn: (cfcm: Cfcm) => Promise<void>) {
  const home = await Deno.makeTempDir({ prefix: "cfcm-ns-" });
  const previous = Deno.env.get("CFCM_HOME");
  Deno.env.set("CFCM_HOME", home);
  try {
    const config = parseConfig({
      capfoundry: { registry: REPO_ROOT, enabled: true },
      telemetry: { local: true, upload: false },
      namespaces: [{
        name: "Netsi",
        type: "private",
        source: { type: "filesystem", path: join(REPO_ROOT, "capabilities", "netsi") },
      }],
    }, REPO_ROOT);
    // Local.* is normally read from ~/.cfcm/local; the repo copy stands in.
    await fn(
      await Cfcm.create({
        config,
        localRoot: join(REPO_ROOT, "capabilities", "local"),
      }),
    );
  } finally {
    if (previous === undefined) Deno.env.delete("CFCM_HOME");
    else Deno.env.set("CFCM_HOME", previous);
    await Deno.remove(home, { recursive: true });
  }
}

/**
 * The published registry is the source of truth for what is public.
 *
 * These counts were literals until the ninth capability broke three tests at
 * once, which taught the wrong lesson: that adding a capability is expected to
 * turn the suite red. The question worth asking is whether CFCM indexes
 * exactly what the registry publishes — no more, and nothing dropped — and
 * that question has the same answer at nine capabilities as at ninety.
 */
async function publishedCapabilityNames(): Promise<string[]> {
  const index = JSON.parse(
    await Deno.readTextFile(join(REPO_ROOT, "registry/index.json")),
  ) as RegistryIndex;
  return index.capabilities.map((c) => c.name).sort();
}

Deno.test("every published capability is indexed, and nothing else is public", async () => {
  const published = await publishedCapabilityNames();
  assert(published.length > 0, "the registry is empty; the assertion would be vacuous");

  await withCfcm((cfcm) => {
    const loaded = cfcm.list().filter((r) => r.namespaceType === "public").map((r) => r.name);
    assertEquals(loaded.sort(), published);
    return Promise.resolve();
  });
});

Deno.test("public, private and local form one search space (OBJ-6)", async () => {
  const published = await publishedCapabilityNames();

  await withCfcm((cfcm) => {
    const byType = new Map<string, number>();
    for (const record of cfcm.list()) {
      byType.set(record.namespaceType, (byType.get(record.namespaceType) ?? 0) + 1);
    }

    // The fixtures are exactly one each, and that is the claim: a private and
    // a machine-local capability sit in the same space as everything public.
    assertEquals(byType.get("public"), published.length);
    assertEquals(byType.get("private"), 1);
    assertEquals(byType.get("local"), 1);
    assertEquals(cfcm.size, published.length + 2);
    return Promise.resolve();
  });
});

Deno.test("a private capability is found by natural-language search", async () => {
  await withCfcm(async (cfcm) => {
    const found = await cfcm.search("look up an internal customer by their identifier");
    assertEquals(found.status, "MATCH");
    assertEquals(found.candidates[0].record.name, "Netsi.demo.getCustomer");
    assertEquals(found.candidates[0].record.namespaceType, "private");
  });
});

Deno.test("a private capability executes locally", async () => {
  await withCfcm(async (cfcm) => {
    const out = await cfcm.invoke({
      capability: "Netsi.demo.getCustomer",
      input: { customerId: "C-1001" },
    });
    assertEquals((out.result as { found: boolean }).found, true);
  });
});

Deno.test("a private capability refuses to return its artifact", async () => {
  await withCfcm(async (cfcm) => {
    for (const mode of ["artifact", "result-and-artifact"] as const) {
      const err = await assertRejects(
        () =>
          cfcm.invoke({
            capability: "Netsi.demo.getCustomer",
            input: { customerId: "C-1001" },
            options: { return: mode },
          }),
        CfcmError,
      );
      assertEquals(err.code, "EXPOSURE_DENIED");
      assertStringIncludes(err.message, "exposure.artifact");
      // The refusal must not carry the thing it refused to hand over.
      assert(!err.message.includes("Nordlys"), "the refusal leaked capability source or data");
    }
  });
});

Deno.test("a public capability does return its artifact", async () => {
  await withCfcm(async (cfcm) => {
    const out = await cfcm.invoke({
      capability: "CapFoundry.geo.distance",
      input: { from: { lat: 0, lon: 0 }, to: { lat: 0, lon: 1 } },
      options: { return: "result-and-artifact" },
    });
    assert(out.artifact, "expected an artifact");
    assertStringIncludes(out.artifact.source, "haversine");
  });
});

Deno.test("the private capability is absent from the public registry", async () => {
  const index = JSON.parse(await Deno.readTextFile(join(REPO_ROOT, "registry/index.json")));
  const names = index.capabilities.map((c: { name: string }) => c.name);
  assert(!names.includes("Netsi.demo.getCustomer"), "a private capability was published");
  assert(!names.some((n: string) => n.startsWith("Netsi.")), "the Netsi namespace leaked");
});

Deno.test("Local.* is absent from the registry and from private sources", async () => {
  const index = JSON.parse(await Deno.readTextFile(join(REPO_ROOT, "registry/index.json")));
  const names = index.capabilities.map((c: { name: string }) => c.name);
  assert(!names.some((n: string) => n.startsWith("Local.")), "a Local.* capability was published");

  // And it is not sitting in the private namespace directory either.
  for await (const entry of Deno.readDir(join(REPO_ROOT, "capabilities", "netsi"))) {
    assert(!entry.name.startsWith("Local."), "Local.* found in a private source");
  }
});

Deno.test("the Local.* capability is found and executes", async () => {
  await withCfcm(async (cfcm) => {
    const record = cfcm.record("Local.dev.echo");
    assertEquals(record.namespaceType, "local");

    const out = await cfcm.invoke({
      capability: "Local.dev.echo",
      input: { value: { a: [1, 2] }, label: "probe" },
    });
    assertEquals((out.result as { label: string }).label, "probe");
    assertEquals((out.result as { depth: number }).depth, 2);
  });
});

Deno.test("a source refuses to serve capabilities outside its namespace", async () => {
  // Point the built-in Local source at the public capabilities directory.
  // CapFoundry.* capabilities must not be servable as Local.*, or the
  // "this machine only" guarantee would be meaningless.
  const config = parseConfig({
    capfoundry: { registry: null, enabled: false },
    telemetry: { local: false, upload: false },
  }, REPO_ROOT);

  const cfcm = await Cfcm.create({ config, localRoot: join(REPO_ROOT, "capabilities") });

  // CFCM stays up — a broken source must not take the working ones with it —
  // but the offending source serves nothing and says why.
  assertEquals(cfcm.size, 0, "a namespace-violating source must serve nothing");

  const local = cfcm.sourceReports.find((r) => r.id === "local");
  assert(local, "the local source should be reported");
  assertEquals(local.status, "unavailable");
  assertStringIncludes(local.detail ?? "", "is not in the Local.* namespace");
});

Deno.test("a misconfigured private namespace does not stop the working sources", async () => {
  const home = await Deno.makeTempDir({ prefix: "cfcm-ns-missing-" });
  const previous = Deno.env.get("CFCM_HOME");
  Deno.env.set("CFCM_HOME", home);
  try {
    const config = parseConfig({
      capfoundry: { registry: REPO_ROOT, enabled: true },
      telemetry: { local: false, upload: false },
      namespaces: [{
        name: "Ghost",
        type: "private",
        source: { type: "filesystem", path: join(REPO_ROOT, "capabilities", "does-not-exist") },
      }],
    }, REPO_ROOT);

    const cfcm = await Cfcm.create({ config, localRoot: join(home, "local") });

    assertEquals(
      cfcm.size,
      (await publishedCapabilityNames()).length,
      "the public registry should still load",
    );
    const ghost = cfcm.sourceReports.find((r) => r.id === "Ghost");
    assertEquals(ghost?.status, "unavailable");
    assertStringIncludes(ghost?.detail ?? "", "does not exist");
  } finally {
    if (previous === undefined) Deno.env.delete("CFCM_HOME");
    else Deno.env.set("CFCM_HOME", previous);
    await Deno.remove(home, { recursive: true });
  }
});

Deno.test("every capability is reachable by at least one of its own example queries", async () => {
  await withCfcm(async (cfcm) => {
    const failures: string[] = [];

    for (const record of cfcm.list()) {
      let matched = false;
      for (const query of record.exampleQueries) {
        const found = await cfcm.search(query);
        if (found.status === "MATCH" && found.candidates[0].record.name === record.name) {
          matched = true;
          break;
        }
      }
      if (!matched) failures.push(record.name);
    }

    assertEquals(
      failures,
      [],
      `capabilities unreachable by their own example queries: ${failures}`,
    );
  });
});
