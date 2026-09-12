# CapFoundry.geo.distance

Great-circle distance between two WGS-84 coordinates, using the haversine formula on a spherical
Earth.

## Contract

**Input**

```json
{
  "from": { "lat": 55.6761, "lon": 12.5683 },
  "to": { "lat": 59.3293, "lon": 18.0686 },
  "unit": "km"
}
```

`unit` is optional and defaults to `km`. Supported: `km`, `m`, `mi`, `nmi`.

**Output**

```json
{ "distance": 522.078, "unit": "km", "method": "haversine" }
```

## Accuracy

Haversine on a sphere is accurate to about 0.5% against the WGS-84 ellipsoid. That is stated in the
contract rather than hidden: if you need survey-grade distance, you need Vincenty, which is a
different capability. Silently upgrading the algorithm here would break the determinism this
capability promises.

`method` is part of the output so a caller can tell which model produced the number without reading
this file.

## Effect

`PURE`. No network, filesystem, clock or randomness. Runs in a Deno subprocess with no permissions
at all.
