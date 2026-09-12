# Local.dev.echo

The **reserved-namespace fixture** (MVP §15).

`Local.*` means _this machine only_. This capability exists to verify that semantic holds:

- CFCM's built-in local source finds it.
- It is **absent** from `registry/index.json`.
- It is **absent** from every configured private namespace source.
- CFCM refuses to declare `Local` as an external namespace in `cfcm.json`.

Echoing input back is the smallest thing that still proves the whole path ran — search, resolve,
spawn, execute, return — because a wrong answer is impossible to mistake for a right one.

## Installing it

`Local.*` is read from `$CFCM_HOME/local` (default `~/.cfcm/local`), not from this repository. The
copy here is the **source**; installing means:

```bash
mkdir -p ~/.cfcm/local
cp -r capabilities/local/Local.dev.echo ~/.cfcm/local/
```

It is kept in the repository so the semantics are testable in CI. `build-index` never picks it up,
because it only scans direct children of `capabilities/`.
