"""Bounded framing regression checks; real tracking additionally needs GPU-image qualification."""
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from spawn_clipper.runner import _encode_vertical


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg required")
class FramingRenderTest(unittest.TestCase):
    def test_full_frame_preserves_both_edges_and_exact_range(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)
            source, out = p / "source.mp4", p / "out.mp4"
            subprocess.run([
                "ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i",
                "color=c=black:s=640x360:r=15:d=3,drawbox=x=0:y=0:w=80:h=360:color=red:t=fill,drawbox=x=560:y=0:w=80:h=360:color=blue:t=fill",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-c:v", "libx264",
                "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(source),
            ], check=True, capture_output=True)
            _encode_vertical(source, out, {"in_ms": 500, "out_ms": 2500,
                "framing": "contain", "captions": []}, 640, 360)
            metadata = json.loads(subprocess.check_output([
                "ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(out)]))
            self.assertEqual([s["codec_type"] for s in metadata["streams"]], ["video", "audio"])
            video = metadata["streams"][0]
            self.assertEqual((video["width"], video["height"]), (1080, 1920))
            self.assertAlmostEqual(float(metadata["format"]["duration"]), 2, delta=.15)
            pixels = subprocess.check_output(["ffmpeg", "-v", "error", "-ss", "1", "-i", str(out),
                "-frames:v", "1", "-pix_fmt", "rgb24", "-f", "rawvideo", "-"])
            def pixel(x, y):
                i = (y * 1080 + x) * 3
                return pixels[i:i+3]
            self.assertGreater(pixel(50, 960)[0], 150)
            self.assertGreater(pixel(1030, 960)[2], 150)
            self.assertLess(max(pixel(540, 50)), 10)
            self.assertFalse(out.with_suffix(".cut.mp4").exists())
            self.assertFalse(out.with_suffix(".framed.mp4").exists())

    def test_auto_reframes_cut_before_caption_overlay(self):
        # The GPU image check exercises real MediaPipe, scene cuts and motion.
        # Here ensure the app cannot silently omit the requested engine path.
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)
            def reframer(source, output, core, mode):
                self.assertEqual(mode, "auto")
                self.assertEqual(source.name, "out.cut.mp4")
                output.write_bytes(b"fixture")
                return "scene_face_tracking"
            with patch("spawn_clipper.runner.subprocess.run") as run, patch("spawn_clipper.framing.reframe_clip", side_effect=reframer) as reframe:
                _encode_vertical(p / "source", p / "out.mp4", {"in_ms": 8000,
                    "out_ms": 20000, "framing": "auto", "captions": []}, 1920, 1080)
                self.assertEqual(reframe.call_count, 1)
                cut_cmd, caption_cmd = [c.args[0] for c in run.call_args_list]
                self.assertEqual(cut_cmd[cut_cmd.index("-ss") + 1], "8.000")
                self.assertEqual(cut_cmd[cut_cmd.index("-t") + 1], "12.000")
                self.assertIn("out.framed.mp4", caption_cmd[caption_cmd.index("-i") + 1])
                self.assertIn("subtitles=", caption_cmd[caption_cmd.index("-vf") + 1])

class FramingContractTest(unittest.TestCase):
    def test_optional_mode_is_bounded_and_legacy_is_preserved(self):
        from spawn_clipper.policy import parse_render_request, OPENSHORTS_COMMIT, PolicyError
        payload = {"job_id": "render_clipjob_a", "source_get_url": "https://account.r2.cloudflarestorage.com/bucket/source",
            "source_sha256": "ab" * 32, "source_bytes": 2048, "duration_ms": 30000,
            "openshorts_commit": OPENSHORTS_COMMIT, "clips": [{"in_ms": 0, "out_ms": 8000,
                "aspect": "9:16", "put_url": "https://account.r2.cloudflarestorage.com/bucket/clip"}]}
        self.assertNotIn("framing", parse_render_request(json.dumps(payload).encode())["clips"][0])
        for mode in ("auto", "contain", "manual"):
            payload["clips"][0]["framing"] = mode
            self.assertEqual(parse_render_request(json.dumps(payload).encode())["clips"][0]["framing"], mode)
        for mode in (None, "speaker", "evil-filter", {}, []):
            payload["clips"][0]["framing"] = mode
            with self.assertRaises(PolicyError):
                parse_render_request(json.dumps(payload).encode())

    def test_auto_disables_direct_provider_flags_and_preserves_general_width(self):
        import types
        from spawn_clipper.framing import reframe_clip
        def render(_source, output, _aspect, **kwargs):
            self.assertFalse(modules["reframe_v2"].SPARSE_TRAJECTORY)
            Path(output).write_bytes(b"fixture")
        modules = {name: types.SimpleNamespace(ENABLED=True, SHADOW=True, CUT_MODE=True)
            for name in ("main", "screencast_layout", "split_layout", "active_speaker", "layout_picker")}
        modules["main"].SmoothedCameraman = object
        original_analysis = lambda *args: []
        modules["reframe_v2"] = types.SimpleNamespace(render=render, SPARSE_TRAJECTORY=True, GENERAL_CONTENT_HEIGHT_RATIO=.42, _analyze_trajectory=original_analysis, dedupe_sendcmd_lines=original_analysis)
        with tempfile.TemporaryDirectory() as d, patch.dict("sys.modules", modules), patch("spawn_clipper.framing.assert_core_checkout"):
            self.assertEqual(reframe_clip(Path(d)/"input", Path(d)/"output", d), "scene_aware_auto")
            self.assertTrue(modules["reframe_v2"].SPARSE_TRAJECTORY)
            self.assertEqual(modules["reframe_v2"].GENERAL_CONTENT_HEIGHT_RATIO, 0)
            for name in ("screencast_layout", "split_layout", "active_speaker", "layout_picker"):
                self.assertFalse(modules[name].ENABLED)
            self.assertFalse(modules["layout_picker"].SHADOW)
            self.assertIs(modules["reframe_v2"]._analyze_trajectory, original_analysis)
            self.assertIs(modules["reframe_v2"].dedupe_sendcmd_lines, original_analysis)
            self.assertIs(modules["main"].SmoothedCameraman, object)

    def test_camera_safety_preserves_accepted_face_and_ignores_unconfirmed_jump(self):
        from spawn_clipper.framing import _face_safe_camera
        class Camera:
            def __init__(self):
                self.crop_width, self.video_width = 600, 1920
                self.current_center_x, self.target_center_x = 700, 700
            def begin_scene(self):
                pass
            def update_target(self, box):
                # Stand-in for the pinned engine's outlier rejection.
                if box and abs(box[0] + box[2]/2 - self.target_center_x) < 200:
                    self.target_center_x = box[0] + box[2]/2
            def get_crop_box(self, force_snap=False):
                return 400, 0, 1000, 1080
        camera = _face_safe_camera(Camera)()
        camera.update_target((740, 100, 280, 280))
        x1, _, x2, _ = camera.get_crop_box()
        self.assertLessEqual(x1, 740)
        self.assertGreaterEqual(x2, 1020)
        first = (x1, x2)
        camera.update_target((1400, 100, 280, 280))
        self.assertEqual((camera.get_crop_box()[0], camera.get_crop_box()[2]), first)
        camera.begin_scene()
        self.assertIsNone(camera._safe_face)

class CompleteTrajectoryTest(unittest.TestCase):
    def test_partial_dense_decode_cannot_claim_tracking(self):
        from types import SimpleNamespace
        from spawn_clipper.framing import _smooth_analysis
        camera = SimpleNamespace(_spawn_faces=[], crop_width=100)
        partial = _smooth_analysis(lambda *args: [None] * 9)
        with self.assertRaisesRegex(RuntimeError, "complete clip"):
            partial("source", [(0, 10)], ["GENERAL"], 30, 640, 360, camera, None)

    def test_complete_static_trajectory_is_retained(self):
        from types import SimpleNamespace
        from spawn_clipper.framing import _smooth_analysis
        camera = SimpleNamespace(_spawn_faces=[], crop_width=100)
        complete = _smooth_analysis(lambda *args: [None] * 10)
        self.assertEqual(complete("source", [(0, 10)], ["GENERAL"], 30, 640, 360, camera, None), [None] * 10)

