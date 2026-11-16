"""Bounded public-file import smoke; no provider job or production writes.

Run with PYTHONPATH=. python scripts/qualify_public_import.py --output /tmp/import-proof
The result explicitly excludes signed destination upload and browser authentication.
"""
import argparse
import json
import shutil
import tempfile
from pathlib import Path

from spawn_clipper.importer import (
    _assert_mp4_header, _duration_ms, _fetch_direct, _fit, _probe, _sha256,
)
from spawn_clipper.policy import classify_import_url


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="https://media.w3.org/2010/05/sintel/trailer.mp4")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    classification = classify_import_url(args.url)
    if classification[0] != "direct":
        parser.error("This bounded smoke qualifies public direct files only")
    with tempfile.TemporaryDirectory(prefix="spawn-import-proof-") as directory:
        root = Path(directory)
        fetched = _fetch_direct(args.url, root / "download")
        output = _fit(fetched, root, 134217728, 1800000)
        _assert_mp4_header(output)
        evidence = {
            "source_url": args.url,
            "classification": classification,
            "bytes": output.stat().st_size,
            "sha256": _sha256(output),
            "duration_ms": _duration_ms(_probe(output)),
            "boundary": "Actual public HTTPS fetch with DNS pinning and production fit/header/digest; signed destination upload and authentication not exercised",
        }
        args.output.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(output, args.output / "imported.mp4")
        (args.output / "evidence.json").write_text(json.dumps(evidence, indent=2))
        print(json.dumps(evidence))


if __name__ == "__main__":
    main()

