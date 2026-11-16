# Signal Below

A self-contained tile dungeon: a winding conduit, an unavoidable timed spike corridor, and a push-block pressure plate that reveals the key to the exit. Keyboard and touch controls use the same movement cadence. Retry immediately restores the initial state.

The target is a two-to-three-minute first play. That duration remains unmeasured. The deterministic optimal route takes 21.24 simulated seconds and proves completion through ordinary movement, not how quickly a new player will solve the puzzle.

## Build and test

Install this folder's pinned esbuild once with `npm ci --ignore-scripts` (run inside `examples/hermes/signal-below`), then use Python 3 and Node. No browser library or network is needed for packaging.

```sh
python3 examples/hermes/signal-below/build.py --mode fixture --output /tmp/signal-below-fixture.zip
node examples/hermes/signal-below/test.mjs
node examples/hermes/signal-below/test-runtime.mjs
python3 examples/hermes/signal-below/test-package.py
```

Extract the ZIP and open root `index.html`. The delivered page contains a bundled classic script, so local opening does not need JavaScript module requests. The checked-in art and receipt files explicitly identify themselves as synthetic; they prove no child execution, review, payment or buyer acceptance.

The art input is `spawn.pixel-grid.v1`, with unique frames named `floor`, `wall`, `hero`, `block`, `key`, `spike`, and `exit`. The builder rejects invalid or missing frames. Request these exact IDs in the art child brief. Transparent pixels use alpha 00.

## Exact source for independent QA

```sh
python3 examples/hermes/signal-below/build.py --mode export-source --output /tmp/signal-runtime.html
```

This exports the **entire actual executable HTML runtime**, byte-for-byte equal to the final root `index.html`. It is raw HTML, not a JSON wrapper or a truncated source excerpt. Current runtime size is 4,645 UTF-8 bytes. Art data is a separate exact input; include its SHA-256 along with the runtime SHA-256 and full runtime text in the QA brief. The native quote must still verify the total input budget, including service instructions and review context, and leave enough output space for useful findings and the checklist below.

Readable authoring files are also delivered under `source/`, including the room paths in `layout.mjs`. QA scope covers the actual bundled runtime plus separately pinned art; the authoring files are not separately reviewed. The bundle precomputes the immutable room paths into an indexed row-mask table and verifies that the emitted decoder preserves all 741 cells exactly. The compiler removes unused module exports and shortens seven private simulation fields. DOM and art fields retain their names. A change to executable or art bytes requires fresh QA of those bytes before claiming final-byte independent coverage; obtain a buyer amendment before exceeding an exactly-two-paid-child limit.

The exporter rejects runtime output above 16 KiB. This is an export ceiling, not a promise that every native QA quote will accept that many bytes.

### Required QA request and acceptance checklist

Ask the independent source-QA Backroom for reproducible findings, including severity, file/function, steps or source trace, expected versus actual behavior, and a suggested fix. Require a pass/fail/untested checklist covering:

- Wall and room boundaries, block collision and solvability, and the locked exit before key collection.
- Raised-spike entry, waiting on a spike as its phase changes, both timed crossings, and movement cadence.
- Revealing and collecting the key, retaining it after the block leaves the plate, and opening the exit.
- Death and victory, terminal-state input, and a retry that resets room, position, block, key, clock and movement cadence.
- A complete keyboard route and a complete pointer route, including controls, focus, victory and retry.

Include the full exported runtime, source and art hashes, acceptance criteria and review scope. A hash alone supplies no source. If the native quote cannot fit the complete input plus useful output and independent review, stop before allocation and obtain an explicitly approved supported scope or route. Do not silently truncate the source or omit requested checks to fit the quote.

The QA report must distinguish source reasoning from checks the Backroom actually executed. Hermes must also extract and play the exact selected ZIP offline, test fixes, retain both reviewed child receipts and current authenticated approval reads, and report the actual archive/source/art hashes. The buyer must download and play the submitted bytes before acceptance. A two-to-three-minute first play is a separate measurement from an optimal scripted route.

## Candidate package

```sh
python3 examples/hermes/signal-below/build.py --mode candidate --art /path/art.json --art-receipt /path/art-draft.json --qa-receipt /path/qa-draft.json --output /tmp/signal-below-candidate.zip
```

Supply the complete native `spawn.external-job-children.v1` draft exports, including approved result and review metadata. The builder verifies their structural consistency: same parent/installation/accepted plan, independent room and service identities, native pin and result hashes, matching approved reviews, allocation conservation, exact approved art, and the current runtime/source/art hashes in the QA input. Superseded attempts and explicitly synthetic receipts are rejected. Additive companion fields such as `ok` are accepted.

These checks cannot authenticate copied exports. Native authority must establish their authenticity and current approval before delivery; the buyer must inspect and play the delivered bytes. `TEST-REPORT.json` records the distinction and all input hashes. No live child, delivery, acceptance or settlement is implied by this example.

### Local fixes after independent QA

The original dungeon brief permits Hermes to fix launch-blocking issues after source QA while retaining the same two child receipts. The default candidate command requires exact final-source QA. If the accepted scope permits documented local fixes, provide the complete source actually reviewed and an explicit fix report:

```sh
python3 examples/hermes/signal-below/build.py --mode candidate --art /path/art.json --art-receipt /path/art-draft.json --qa-receipt /path/qa-draft.json --qa-source /path/reviewed-runtime.html --fix-report /path/local-fixes.json --output /tmp/signal-below-fixed.zip
```

The fix report is bounded to 8 KiB and uses this schema, with actual SHA-256 values and one to sixteen specific findings/changes:

```json
{
  "schema_version": "spawn.local-game-fixes.v1",
  "reviewed_source_sha256": "SHA256_OF_THE_COMPLETE_QA_INPUT_RUNTIME",
  "delivered_source_sha256": "SHA256_OF_THE_CURRENT_EXPORTED_RUNTIME",
  "fixes": [{"finding": "QA finding or local playtest failure", "change": "Exact local correction", "validation": "Checks performed and their scope"}]
}
```

The builder checks the original QA receipt against that complete earlier source and unchanged approved art. It packages the earlier source, a generated exact diff and the hash-bound fix report, then runs the simulation and compiled keyboard/pointer tests against the actual final runtime and supplied art. `TEST-REPORT.json` identifies both source hashes and explicitly records that the local edits were **not independently reviewed**. Both original child receipts are retained; packaging starts no paid operation.

This mode does not replace the human offline playtest or authorize a change in accepted scope. If the buyer requires independent review of the final executable, keep the default exact-source mode and obtain any additional review through an explicitly approved amendment.

## Current evidence

The simulation tests cover wall collision, movement cadence, both required spike crossings, death/retry, locked exit, two-axis block placement, key collection and persistence after releasing the plate, complete retry reset, and a full route using ordinary movement. A connectivity check proves the spike corridor has no geometric bypass. The packaged JavaScript completes routes through both keyboard and pointer handlers, including timed crossings, the block puzzle, key persistence, victory and retry, against a deterministic DOM/canvas test port. A raster probe verifies that transparent floor art does not retain a departed hero. This tests the actual compiled code; it does not render pixels in a browser. Packaging runs that test against the exact runtime and supplied art, compares the exported runtime with the actual archive, and rejects changed output, review, target, source and art evidence.

Rendered visual/accessibility checks and first-time-player timing remain separate acceptance gates. Browser compilation and simulation tests do not establish them.
