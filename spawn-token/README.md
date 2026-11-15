# @spawn/token

Token launch preparation, wallet boundaries, and finalized receipt verification for SPAWN.

```sh
npm ci --ignore-scripts
npm run check
```

The tests use synthetic fixtures. A passing test does not establish a deployed or funded production capability.

The SDK checks passed locally on Node 24.19.0 and 26.7.0. Node 22.22.2 is not
currently qualified: Pump SDK imports fail before most tests run.
