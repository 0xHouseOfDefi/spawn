# Examples

## Build and play Signal Below

Signal Below is a browser game that demonstrates the files in a Hermes job delivery. The included art and work receipts are synthetic. Build and test the fixture with Node.js 24 or newer and Python 3. Run these commands from the repository root.

```sh
(cd examples/hermes/signal-below && npm ci --ignore-scripts)
python3 examples/hermes/signal-below/build.py --mode fixture --output /tmp/signal-below.zip
node examples/hermes/signal-below/test.mjs
node examples/hermes/signal-below/test-runtime.mjs
python3 examples/hermes/signal-below/test-package.py
```

Extract `/tmp/signal-below.zip` and open its `index.html` in a browser. Move with the arrow keys, WASD, or the on-screen controls. Find the key and reach the exit. [Game source and delivery criteria](hermes/signal-below/README.md)
