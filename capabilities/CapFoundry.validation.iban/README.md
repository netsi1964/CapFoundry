# CapFoundry.validation.iban

Validates an IBAN per ISO 13616 and returns a normalized form.

```json
{ "iban": "dk50 0040 0440 1162 43" }
→ { "valid": true, "normalized": "DK5000400440116243",
    "formatted": "DK50 0040 0440 1162 43", "countryCode": "DK",
    "reason": null, "message": null }
```

## What this does and does not tell you

Checked: character set, length for the country, and the ISO 7064 mod-97-10 checksum.

**Not** checked: whether the account exists, whether it is open, or whether it belongs to who you
think it does. A structurally valid IBAN is a well-formed string, not a verified payee. The output
field is called `valid` and never `safe to pay`.

## Machine-readable failures

`reason` is one of `TOO_SHORT`, `INVALID_CHARACTERS`, `UNKNOWN_COUNTRY`, `WRONG_LENGTH_FOR_COUNTRY`,
`CHECKSUM_FAILED`, so a caller can branch on the cause instead of re-deriving it to show a useful
message. `message` is the human-readable companion.

## Notes

Spaces are stripped and letters uppercased before validation — that is how IBANs are printed, so
accepting them is normalization rather than leniency.

An unregistered country code is **rejected**, not assumed valid: guessing a length would turn an
unknown into a false positive.

The mod-97 remainder is folded every 7 digits. A 34-character IBAN expands past 60 digits once
letters become numbers, which exceeds exact double precision.
