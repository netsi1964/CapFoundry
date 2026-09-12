# Netsi.demo.getCustomer

A **private-namespace fixture** (MVP §14). Its job is not to be useful.

It proves four things at once:

1. `cfcm.json` can register a private namespace with **no CFCM code knowing the organisation
   exists**.
2. A private capability is searched **alongside** public ones, in one space (OBJ-6).
3. Private policy can differ: `exposure.artifact` is `false`, so it executes but never hands back
   its source.
4. Execution stays local; nothing reaches the central registry, and the capability never appears in
   `registry/index.json`.

## Why it connects to nothing

A fixture that needed credentials would prove the namespace model works only where credentials exist
— the opposite of what a proof should require. The "database" is a frozen table of three invented
companies.

No real customer data belongs in a repository.

## Installing it

```json
{
  "namespaces": [
    {
      "name": "Netsi",
      "type": "private",
      "source": { "type": "filesystem", "path": "./capabilities/netsi" }
    }
  ]
}
```
