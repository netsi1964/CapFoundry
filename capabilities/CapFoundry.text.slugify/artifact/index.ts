/**
 * CapFoundry.text.slugify
 *
 * Turns arbitrary text into a stable, URL- and filename-safe slug.
 *
 * The contract that matters is *stability*: the same input must always give
 * the same slug, across versions and machines, because slugs end up in URLs
 * and filenames that outlive the code that made them. Every rule below is
 * therefore explicit rather than delegated to a locale-sensitive runtime API.
 *
 * Transliteration is locale-aware because the correct answer genuinely differs
 * by language: Danish "o-slash" is "oe", but generic diacritic stripping gives
 * "o". Getting this wrong silently produces colliding slugs, so the locale is
 * part of the input rather than guessed from the environment.
 *
 * PURE: no network, no filesystem, no clock, no randomness, no Intl.
 */

export interface SlugifyInput {
  text: string;
  /** BCP-47-ish language tag. Only the primary subtag is used. */
  locale?: string;
  separator?: string;
  maxLength?: number;
  lowercase?: boolean;
}

export interface SlugifyOutput {
  slug: string;
  truncated: boolean;
}

/** Applied before diacritic stripping, so language-specific spellings win. */
const LOCALE_MAP: Record<string, Record<string, string>> = {
  da: { "æ": "ae", "ø": "oe", "å": "aa" },
  nb: { "æ": "ae", "ø": "oe", "å": "aa" },
  no: { "æ": "ae", "ø": "oe", "å": "aa" },
  sv: { "ä": "ae", "ö": "oe", "å": "aa" },
  de: { "ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss" },
};

/** Characters no locale disagrees about, or that NFD cannot decompose. */
const UNIVERSAL_MAP: Record<string, string> = {
  "ß": "ss",
  "æ": "ae",
  "ø": "o",
  "œ": "oe",
  "đ": "d",
  "ð": "d",
  "þ": "th",
  "ł": "l",
  "&": " and ",
  "@": " at ",
};

function applyMap(text: string, map: Record<string, string>): string {
  let out = "";
  for (const char of text) {
    const lower = char.toLowerCase();
    const mapped = map[lower];
    if (mapped === undefined) {
      out += char;
      continue;
    }
    // Preserve the caller's casing decision: an uppercase source character
    // maps to an uppercase replacement, which matters when lowercase is off.
    out += char === lower ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1);
  }
  return out;
}

export default function slugify(input: SlugifyInput): SlugifyOutput {
  if (!input || typeof input !== "object") {
    throw new TypeError("input must be an object with a text field");
  }
  if (typeof input.text !== "string") {
    throw new TypeError("text must be a string");
  }

  const separator = input.separator ?? "-";
  if (typeof separator !== "string" || separator.length > 1) {
    throw new RangeError("separator must be a single character or an empty string");
  }
  if (separator.length === 1 && /[a-zA-Z0-9]/.test(separator)) {
    throw new RangeError("separator must not be alphanumeric, or slugs could not be split again");
  }

  const maxLength = input.maxLength ?? 0;
  if (typeof maxLength !== "number" || !Number.isInteger(maxLength) || maxLength < 0) {
    throw new RangeError("maxLength must be a non-negative integer");
  }

  const lowercase = input.lowercase ?? true;
  const primarySubtag = (input.locale ?? "").split(/[-_]/)[0].toLowerCase();

  let text = input.text;
  if (LOCALE_MAP[primarySubtag]) text = applyMap(text, LOCALE_MAP[primarySubtag]);
  text = applyMap(text, UNIVERSAL_MAP);

  // NFKD then strip combining marks: accented letters lose their accent and
  // full-width forms become ASCII. Anything still non-ASCII (CJK, emoji) is
  // dropped by the filter below rather than guessed at.
  text = text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

  if (lowercase) text = text.toLowerCase();

  let slug = text.replace(/[^a-zA-Z0-9]+/g, separator);

  if (separator) {
    const escaped = separator.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
    slug = slug
      .replace(new RegExp(`${escaped}{2,}`, "g"), separator)
      .replace(new RegExp(`^${escaped}+|${escaped}+$`, "g"), "");
  }

  let truncated = false;
  if (maxLength > 0 && slug.length > maxLength) {
    truncated = true;
    let cut = slug.slice(0, maxLength);

    if (separator) {
      // Truncate at a word boundary rather than mid-word. "the-quick-bro" is
      // a worse identifier than "the-quick": a partial word reads as
      // corruption, and it is the fragment most likely to collide with an
      // unrelated slug that happens to share a prefix.
      if (slug.charAt(maxLength) !== separator) {
        const lastSeparator = cut.lastIndexOf(separator);
        // A single token longer than maxLength has no boundary to fall back
        // to, so it is cut hard rather than returned empty.
        if (lastSeparator > 0) cut = cut.slice(0, lastSeparator);
      }
      const escaped = separator.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
      cut = cut.replace(new RegExp(`${escaped}+$`), "");
    }

    slug = cut;
  }

  return { slug, truncated };
}
