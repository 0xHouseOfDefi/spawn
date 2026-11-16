"""Exercise the production encoder and inspect decoded libass pixels."""

import json
import math
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from spawn_clipper.policy import DEFAULT_CAPTION_STYLE
from spawn_clipper.runner import _encode_vertical


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg/libass required")
class CaptionRenderTest(unittest.TestCase):
    def test_custom_fonts_positions_colors_and_disabled_captions_in_real_pixels(self):
        with tempfile.TemporaryDirectory(prefix="caption-style-render-") as directory:
            root = Path(directory)
            source = root / "source.mp4"
            subprocess.run([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "color=c=black:s=720x1280:r=30:d=2",
                "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", str(source),
            ], check=True, capture_output=True)
            clip = {
                "in_ms": 0, "out_ms": 2000,
                "crop": {"x": 0, "y": 0, "width": 1, "height": 1},
                "captions": [{"from_ms": 200, "to_ms": 1200, "text": "move"}],
                "caption_words": [{"from_ms": 200, "to_ms": 1200, "text": "move"}],
            }
            for font, animation, x, y in (("sans", "pop", 25, 25),
                                          ("condensed", "rise", 75, 50),
                                          ("mono", "fade", 25, 75)):
                with self.subTest(font=font, animation=animation):
                    output = root / f"{font}.mp4"
                    clip["caption_style"] = {**DEFAULT_CAPTION_STYLE, "font": font,
                        "font_size": 48, "x_pct": x, "y_pct": y,
                        "highlight_color": "#FF55CC", "uppercase": False,
                        "animation": animation, "animation_ms": 400}
                    _encode_vertical(source, output, clip, 720, 1280)
                    pixels = self._frame(output, .9)
                    colored = [(i // 3 % 720, i // 3 // 720)
                               for i in range(0, len(pixels), 3)
                               if pixels[i] > 180 and pixels[i + 2] > 130
                               and pixels[i + 1] < 140]
                    self.assertGreater(len(colored), 200)
                    self.assertAlmostEqual(sum(p[0] for p in colored) / len(colored), x * 7.2, delta=15)
                    self.assertAlmostEqual(sum(p[1] for p in colored) / len(colored), y * 12.8, delta=15)
                    early = self._frame(output, .25)
                    if animation == "fade":
                        self.assertLess(max(early[0::3]), max(pixels[0::3]) * .4)
                    else:
                        early_color = [(i // 3 % 720, i // 3 // 720)
                                       for i in range(0, len(early), 3)
                                       if early[i] > 180 and early[i + 2] > 130 and early[i + 1] < 140]
                        self.assertGreater(len(early_color), 100)
                        if animation == "rise":
                            self.assertGreater(sum(p[1] for p in early_color) / len(early_color) -
                                               sum(p[1] for p in colored) / len(colored), 12)
                        else:
                            self.assertGreater((max(p[0] for p in colored) - min(p[0] for p in colored)) -
                                               (max(p[0] for p in early_color) - min(p[0] for p in early_color)), 3)
                    self.assertLess(max(self._frame(output, 1.5)), 10)

            clip["caption_style"] = {**DEFAULT_CAPTION_STYLE, "enabled": False}
            output = root / "off.mp4"
            _encode_vertical(source, output, clip, 720, 1280)
            self.assertLess(max(self._frame(output, .9)), 10)

    @staticmethod
    def _frame(output, at):
        return subprocess.check_output([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", str(at), "-i", str(output),
            "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
        ])

    def test_real_encode_preserves_cut_audio_and_moves_highlight_with_words(self):
        with tempfile.TemporaryDirectory(prefix="caption-render-") as directory:
            root = Path(directory)
            source, output = root / "source.mp4", root / "captioned.mp4"
            subprocess.run([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "color=c=0x17202a:s=720x1280:r=30:d=6",
                "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=48000:duration=6",
                "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-shortest", str(source),
            ], check=True, capture_output=True)
            clip = {
                "in_ms": 1000, "out_ms": 5000,
                "crop": {"x": 0, "y": 0, "width": 1, "height": 1},
                "captions": [{"from_ms": 300, "to_ms": 2900, "text": "Hello world from SPAWN"}],
                "caption_words": [
                    {"from_ms": 300, "to_ms": 700, "text": "Hello"},
                    {"from_ms": 760, "to_ms": 1200, "text": "world"},
                    {"from_ms": 1300, "to_ms": 1700, "text": "from"},
                    {"from_ms": 2400, "to_ms": 2900, "text": "SPAWN"},
                ],
            }
            _encode_vertical(source, output, clip, 720, 1280)
            metadata = json.loads(subprocess.check_output([
                "ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(output),
            ]))
            video = next(stream for stream in metadata["streams"] if stream["codec_type"] == "video")
            self.assertEqual((video["width"], video["height"]), (720, 1280))
            self.assertTrue(any(stream["codec_type"] == "audio" for stream in metadata["streams"]))
            self.assertAlmostEqual(float(metadata["format"]["duration"]), 4, delta=.08)

            def green_pixels(at):
                pixels = subprocess.check_output([
                    "ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", str(at), "-i", str(output),
                    "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
                ])
                self.assertEqual(len(pixels), 720 * 1280 * 3)
                positions = []
                for offset in range(0, len(pixels), 3):
                    red, green, blue = pixels[offset:offset + 3]
                    if green > 180 and green > red * 1.5 and 70 < blue < 230:
                        positions.append(((offset // 3) % 720, (offset // 3) // 720))
                return positions

            for at in (.2, .72, 2.0, 3.2):
                with self.subTest(silent_time=at):
                    self.assertEqual(len(green_pixels(at)), 0)
            hello, world, spawn = (green_pixels(at) for at in (.5, .9, 2.5))
            for pixels in (hello, world, spawn):
                self.assertGreater(len(pixels), 600)
                self.assertGreater(min(x for x, _ in pixels), 40)
                self.assertLess(max(x for x, _ in pixels), 680)
                self.assertGreater(min(y for _, y in pixels), 600)
                self.assertLess(max(y for _, y in pixels), 840)
            hello_center = tuple(sum(point[axis] for point in hello) / len(hello) for axis in (0, 1))
            world_center = tuple(sum(point[axis] for point in world) / len(world) for axis in (0, 1))
            self.assertGreater(math.dist(hello_center, world_center), 100)


if __name__ == "__main__":
    unittest.main()
