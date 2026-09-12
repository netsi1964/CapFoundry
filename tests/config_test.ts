/** cfcm.json tests (PRD-FEAT-003.1 and 003.5). */

import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import { DEFAULT_CONFIG, parseConfig } from "../cfcm/config/config.ts";
import { CfcmError } from "../cfcm/types.ts";

Deno.test("an empty config yields working defaults", () => {
  const config = parseConfig({}, ".");
  assertEquals(config.search.matchThreshold, DEFAULT_CONFIG.search.matchThreshold);
  assertEquals(config.telemetry.upload, false, "telemetry upload must be opt-in");
  assertEquals(config.telemetry.local, true);
  assertEquals(config.namespaces, []);
});

Deno.test("Local is a reserved namespace and says why", () => {
  const err = assertThrows(
    () =>
      parseConfig(
        {
          namespaces: [{
            name: "Local",
            type: "private",
            source: { type: "filesystem", path: "./x" },
          }],
        },
        ".",
      ),
    CfcmError,
  );
  assertEquals((err as CfcmError).code, "CONFIG_RESERVED_NAMESPACE");
  assertStringIncludes(err.message, "this machine only");
});

Deno.test("CapFoundry is a reserved namespace", () => {
  const err = assertThrows(
    () =>
      parseConfig(
        {
          namespaces: [{
            name: "CapFoundry",
            type: "private",
            source: { type: "filesystem", path: "./x" },
          }],
        },
        ".",
      ),
    CfcmError,
  );
  assertEquals((err as CfcmError).code, "CONFIG_RESERVED_NAMESPACE");
});

Deno.test("a private namespace is accepted and its path resolved against the config", () => {
  const config = parseConfig(
    {
      namespaces: [{
        name: "Netsi",
        type: "private",
        source: { type: "filesystem", path: "./caps/netsi" },
      }],
    },
    "/home/dev/project",
  );
  assertEquals(config.namespaces[0].name, "Netsi");
  assertEquals(config.namespaces[0].source.path, "/home/dev/project/caps/netsi");
});

Deno.test("thresholds outside 0..1 are rejected", () => {
  assertThrows(() => parseConfig({ search: { matchThreshold: 1.5 } }, "."), CfcmError);
  assertThrows(() => parseConfig({ search: { coverageWeight: -1 } }, "."), CfcmError);
});

Deno.test("a partial threshold above the match threshold is rejected", () => {
  const err = assertThrows(
    () => parseConfig({ search: { matchThreshold: 0.4, partialThreshold: 0.9 } }, "."),
    CfcmError,
  );
  assertStringIncludes(err.message, "partialThreshold");
});

Deno.test("a malformed namespace entry names the offending index", () => {
  const err = assertThrows(
    () => parseConfig({ namespaces: [{ name: "Netsi", type: "private" }] }, "."),
    CfcmError,
  );
  assertStringIncludes(err.message, "namespaces[0].source");
});

Deno.test("a relative registry path resolves against the config file, like a namespace path", () => {
  // The footgun this guards: the same "./x" meaning two different places
  // depending on where CFCM happened to be started.
  const config = parseConfig(
    {
      capfoundry: { registry: "./registry-mirror" },
      namespaces: [{
        name: "Netsi",
        type: "private",
        source: { type: "filesystem", path: "./caps/netsi" },
      }],
    },
    "/home/dev/project",
  );
  assertEquals(config.capfoundry.registry, "/home/dev/project/registry-mirror");
  assertEquals(config.namespaces[0].source.path, "/home/dev/project/caps/netsi");
});

Deno.test("a bare dot registry resolves to the config's own directory", () => {
  assertEquals(
    parseConfig({ capfoundry: { registry: "." } }, "/home/dev/project").capfoundry.registry,
    "/home/dev/project",
  );
});

Deno.test("an absolute registry path and an http registry are left alone", () => {
  assertEquals(
    parseConfig({ capfoundry: { registry: "/srv/registry" } }, "/home/dev").capfoundry.registry,
    "/srv/registry",
  );
  assertEquals(
    parseConfig({ capfoundry: { registry: "https://example.com/reg" } }, "/home/dev").capfoundry
      .registry,
    "https://example.com/reg",
  );
});
