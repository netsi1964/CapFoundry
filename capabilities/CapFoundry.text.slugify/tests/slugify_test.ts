import { assertEquals, assertThrows } from "@std/assert";
import slugify from "../artifact/index.ts";

const slug = (text: string, opts: Record<string, unknown> = {}) => slugify({ text, ...opts }).slug;

Deno.test("basic lowercase and hyphenation", () => {
  assertEquals(slug("Hello World"), "hello-world");
  assertEquals(slug("  leading and trailing  "), "leading-and-trailing");
  assertEquals(slug("Multiple   spaces"), "multiple-spaces");
});

Deno.test("punctuation collapses to a single separator", () => {
  assertEquals(slug("What?! Really... yes"), "what-really-yes");
  assertEquals(slug("a---b"), "a-b");
  assertEquals(slug("--edges--"), "edges");
});

Deno.test("diacritics are stripped by default", () => {
  assertEquals(slug("Café Crème"), "cafe-creme");
  assertEquals(slug("naïve résumé"), "naive-resume");
  assertEquals(slug("Ångström"), "angstrom", "the sv map is not applied without a locale");
});

Deno.test("Danish locale transliterates rather than strips", () => {
  assertEquals(slug("Rødgrød med fløde", { locale: "da" }), "roedgroed-med-floede");
  assertEquals(slug("Æbleskiver", { locale: "da" }), "aebleskiver");
  // Without the locale, the universal map applies: ae for æ, o for ø.
  assertEquals(slug("Rødgrød"), "rodgrod");
  assertEquals(slug("Æble"), "aeble");
});

Deno.test("German locale maps umlauts to digraphs", () => {
  assertEquals(slug("Müller Straße", { locale: "de" }), "mueller-strasse");
  assertEquals(slug("Öl", { locale: "de" }), "oel");
});

Deno.test("locale accepts a full BCP-47 tag", () => {
  assertEquals(slug("fløde", { locale: "da-DK" }), "floede");
  assertEquals(slug("fløde", { locale: "da_DK" }), "floede");
});

Deno.test("eszett becomes ss even without a locale", () => {
  assertEquals(slug("Straße"), "strasse");
});

Deno.test("ampersand and at expand to words", () => {
  assertEquals(slug("Tom & Jerry"), "tom-and-jerry");
  assertEquals(slug("user@example"), "user-at-example");
});

Deno.test("a custom separator is honoured", () => {
  assertEquals(slug("Hello World", { separator: "_" }), "hello_world");
  assertEquals(slug("a b c", { separator: "." }), "a.b.c");
  assertEquals(slug("Hello World", { separator: "" }), "helloworld");
});

Deno.test("lowercase can be turned off, preserving mapped casing", () => {
  assertEquals(slug("Hello World", { lowercase: false }), "Hello-World");
  assertEquals(slug("Øre", { locale: "da", lowercase: false }), "Oere");
});

Deno.test("maxLength truncates at a word boundary", () => {
  // "the-quick-brown-fox" cut at 13 would land mid-word on "the-quick-bro".
  const out = slugify({ text: "the quick brown fox", maxLength: 13 });
  assertEquals(out.slug, "the-quick");
  assertEquals(out.truncated, true);
});

Deno.test("maxLength keeps a whole word when the cut lands on a separator", () => {
  assertEquals(slugify({ text: "the quick brown fox", maxLength: 9 }).slug, "the-quick");
  assertEquals(slugify({ text: "the quick brown fox", maxLength: 15 }).slug, "the-quick-brown");
});

Deno.test("a single oversized token is cut hard rather than emptied", () => {
  assertEquals(slugify({ text: "supercalifragilistic", maxLength: 8 }).slug, "supercal");
});

Deno.test("text within maxLength is not marked truncated", () => {
  assertEquals(slugify({ text: "short", maxLength: 100 }).truncated, false);
  assertEquals(slugify({ text: "short", maxLength: 0 }).truncated, false);
});

Deno.test("characters with no ASCII reading are dropped, not guessed", () => {
  assertEquals(slug("hello 世界 world"), "hello-world");
  assertEquals(slug("🎉 party 🎉"), "party");
  assertEquals(slug("世界"), "");
});

Deno.test("digits and existing hyphens survive", () => {
  assertEquals(slug("Version 2.0.1-beta"), "version-2-0-1-beta");
  assertEquals(slug("iPhone 15 Pro"), "iphone-15-pro");
});

Deno.test("empty and whitespace-only input give an empty slug", () => {
  assertEquals(slug(""), "");
  assertEquals(slug("   "), "");
  assertEquals(slug("!!!"), "");
});

Deno.test("deterministic across repeated calls", () => {
  const first = slug("Rødgrød med fløde", { locale: "da" });
  for (let i = 0; i < 100; i++) {
    assertEquals(slug("Rødgrød med fløde", { locale: "da" }), first);
  }
});

Deno.test("rejects an alphanumeric separator", () => {
  assertThrows(() => slugify({ text: "a b", separator: "x" }), RangeError);
});

Deno.test("rejects a multi-character separator", () => {
  assertThrows(() => slugify({ text: "a b", separator: "--" }), RangeError);
});

Deno.test("rejects a negative or fractional maxLength", () => {
  assertThrows(() => slugify({ text: "a", maxLength: -1 }), RangeError);
  assertThrows(() => slugify({ text: "a", maxLength: 1.5 }), RangeError);
});

Deno.test("rejects non-string text", () => {
  assertThrows(() => slugify({ text: 42 as never }), TypeError);
});
