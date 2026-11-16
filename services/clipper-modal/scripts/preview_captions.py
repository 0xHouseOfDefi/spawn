"""Render a synthetic speech fixture through the production caption encoder.

Requires FFmpeg with libflite/libass and the same DejaVu font as the Modal
image. This fixture supplies known timings; it does not qualify Whisper or
replace an interview re-test. No service, inference API or upload is called.
"""

import argparse
import array
import json
import math
import subprocess
import wave
from pathlib import Path

from spawn_clipper.policy import DEFAULT_CAPTION_STYLE
from spawn_clipper.runner import _encode_vertical


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    parser.add_argument("--variants", action="store_true", help="Also render style presets and a four-way comparison")
    args = parser.parse_args()
    root = args.output.resolve()
    root.mkdir(parents=True, exist_ok=True)
    rate = 24000
    samples = array.array("h", [0] * (rate * 14 // 10))
    words = []
    for index, text in enumerate(("Your", "agents", "can", "build", "better", "together")):
        raw = subprocess.check_output([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi",
            "-i", f"flite=text={text}:voice=slt", "-ac", "1", "-ar", str(rate),
            "-f", "s16le", "pipe:1",
        ])
        speech = array.array("h")
        speech.frombytes(raw)
        voiced = [i for i, value in enumerate(speech) if abs(value) > 150]
        if not voiced:
            raise RuntimeError(f"Fixture speech is empty: {text}")
        speech = speech[max(0, voiced[0] - 240):min(len(speech), voiced[-1] + 240)]
        start = round(len(samples) * 1000 / rate) - 1000
        samples.extend(speech)
        end = round(len(samples) * 1000 / rate) - 1000
        words.append({"from_ms": start, "to_ms": end, "text": text})
        samples.extend([0] * (rate // 2 if index == 2 else rate * 8 // 100))
    samples.extend([0] * rate)
    duration_ms = math.ceil(len(samples) * 1000 / rate)
    audio = root / "synthetic-speech.wav"
    with wave.open(str(audio), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(samples.tobytes())
    source = root / "synthetic-source.mp4"
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
        "-i", f"color=c=0x080a0a:s=720x1280:r=30:d={duration_ms / 1000}",
        "-i", str(audio), "-c:v", "libx264", "-preset", "veryfast",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(source),
    ], check=True)
    clip = {
        "in_ms": 1000, "out_ms": duration_ms, "aspect": "9:16",
        "crop": {"x": 0, "y": 0, "width": 1, "height": 1},
        "captions": [{"from_ms": words[0]["from_ms"], "to_ms": words[-1]["to_ms"],
                      "text": " ".join(word["text"] for word in words)}],
        "caption_words": words,
    }
    output = root / "spawn-karaoke-caption-preview.mp4"
    _encode_vertical(source, output, clip, 720, 1280)
    (root / "synthetic-fixture.json").write_text(json.dumps(clip, indent=2) + "\n")
    print(output)
    if args.variants:
        styles = {
            "viral": {**DEFAULT_CAPTION_STYLE},
            "clean": {**DEFAULT_CAPTION_STYLE, "font_size": 64, "uppercase": False,
                      "outline_width": 3, "shadow": 1, "animation": "fade", "animation_ms": 160, "y_pct": 76},
            "minimal": {**DEFAULT_CAPTION_STYLE, "font_size": 60, "uppercase": False,
                        "outline_width": 2, "shadow": 0, "animation": "none", "words_per_group": 4, "y_pct": 80},
            "custom": {**DEFAULT_CAPTION_STYLE, "font": "condensed", "font_size": 96,
                       "highlight_color": "#C79CFF", "x_pct": 65, "y_pct": 28,
                       "words_per_group": 2, "animation": "rise", "animation_ms": 240},
        }
        inputs = []
        for name, style in styles.items():
            variant = root / f"caption-{name}.mp4"
            _encode_vertical(source, variant, {**clip, "caption_style": style}, 720, 1280)
            inputs.extend(["-i", str(variant)])
        font = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
        labels = ("VIRAL / POP", "CLEAN / FADE", "MINIMAL / NONE", "CUSTOM / RISE")
        filters = [f"[{index}:v]scale=360:640,drawtext=fontfile={font}:text='{label}':fontsize=20:fontcolor=0xeae9e3:x=20:y=24,drawbox=x=0:y=0:w=iw:h=ih:color=0x303535:t=1[v{index}]"
                   for index, label in enumerate(labels)]
        filters.append("[v0][v1][v2][v3]xstack=inputs=4:layout=0_0|360_0|0_640|360_640[v]")
        comparison = root / "caption-styles-preview.mp4"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *inputs,
                        "-filter_complex", ";".join(filters), "-map", "[v]", "-map", "0:a",
                        "-c:v", "libx264", "-preset", "veryfast", "-c:a", "copy", str(comparison)], check=True)
        (root / "caption-styles.json").write_text(json.dumps(styles, indent=2) + "\n")
        print(comparison)


if __name__ == "__main__":
    main()
