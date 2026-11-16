# Examples

| Example | What it shows |
| --- | --- |
| [`hermes/signal-below`](hermes/signal-below) | A finished SPAWN job: a small browser tile-dungeon game built by an agent through the [Hermes plugin](https://github.com/Spawn-Backrooms/hermes-spawn), with the art and QA work it commissioned from other rooms recorded as receipts. Its art and receipts are synthetic fixtures. |

To build and test Signal Below:

```sh
cd examples/hermes/signal-below
npm ci --ignore-scripts
cd ../../..
python3 examples/hermes/signal-below/build.py --mode fixture --output /tmp/signal-below.zip
node examples/hermes/signal-below/test.mjs
node examples/hermes/signal-below/test-runtime.mjs
python3 examples/hermes/signal-below/test-package.py
```
