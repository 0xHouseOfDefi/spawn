"""Scene-aware framing using the pinned, local OpenShorts reframe engine.

The engine's MediaPipe detector and smoothed camera follow a face throughout a
shot. Its scene classifier preserves the whole frame for groups and face-less
shots. This is not audio diarization or a promise to identify an active speaker.
No layout LLM, upload, moment picker, publishing, or watermark is invoked here.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from spawn_clipper.policy import PolicyError, assert_core_checkout
from spawn_clipper.camera_path import smooth_scene_camera, frame_aligned_commands

FRAMING_MODES = frozenset(("auto", "contain", "manual"))


def _whole_frame(source: Path, output: Path) -> None:
    """Never discard a subject when tracking is unavailable."""
    subprocess.run([
        "ffmpeg", "-v", "error", "-y", "-i", str(source),
        "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease:force_divisible_by=2,"
        "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1",
        "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast",
        "-crf", "20", "-maxrate", "6M", "-bufsize", "12M", "-c:a", "aac",
        "-movflags", "+faststart", str(output),
    ], check=True, capture_output=True, timeout=180)


def _face_safe_camera(base):
    """Retain upstream jitter rejection but keep an accepted face inside crop.

    Its fixed 25% dead zone plus 3px/frame pan can leave a moving face clipped.
    This safety boundary moves only as far as required to preserve the detected
    face with headroom; unconfirmed detection jumps do not move the camera.
    """
    class FaceSafeCamera(base):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self.safe_zone_radius = self.crop_width * 0.10
            self._safe_face = None
            self._spawn_faces = []

        def begin_scene(self):
            super().begin_scene()
            self._safe_face = None

        def update_target(self, face_box):
            super().update_target(face_box)
            if face_box and abs(self.target_center_x - (face_box[0] + face_box[2] / 2)) < 1:
                self._safe_face = tuple(face_box)

        def get_crop_box(self, force_snap=False):
            x1, y1, x2, y2 = super().get_crop_box(force_snap=force_snap)
            if self._safe_face:
                fx, _fy, fw, _fh = self._safe_face
                pad = min(fw * .35, max(0, (self.crop_width - fw) / 2))
                left, right = fx - pad, fx + fw + pad
                if right - left <= self.crop_width:
                    x1 = min(max(x1, right - self.crop_width), left)
                else:
                    x1 = fx + fw / 2 - self.crop_width / 2
                x1 = int(min(max(0, x1), self.video_width - self.crop_width))
                x2 = x1 + self.crop_width
                self.current_center_x = x1 + self.crop_width / 2
            self._spawn_faces.append(self._safe_face)
            return x1, y1, x2, y2
    return FaceSafeCamera



def _smooth_analysis(analyze):
    """Wrap the pinned engine's offline analysis, never its provider routing."""
    def analysis(input_video, boundaries, strategies, fps, width, height, camera, tracker):
        camera._spawn_faces = []
        xs = analyze(input_video, boundaries, strategies, fps, width, height, camera, tracker)
        expected_frames = max((end for _start, end in boundaries), default=0)
        if expected_frames <= 0 or len(xs) != expected_frames:
            raise RuntimeError("Camera trajectory does not cover the complete clip")
        faces = iter(camera._spawn_faces)
        # GENERAL/static frames do not call get_crop_box. Restore that indexing
        # before smoothing; a future upstream contract mismatch fails closed.
        if sum(x is not None for x in xs) != len(camera._spawn_faces):
            raise RuntimeError("Camera evidence does not match trajectory")
        aligned = [next(faces) if x is not None else None for x in xs]
        result = list(xs)
        for start, end in boundaries:
            start, end = max(0, start), min(len(xs), end)
            if start >= end or any(x is None for x in xs[start:end]):
                continue
            result[start:end] = smooth_scene_camera(
                xs[start:end], aligned[start:end], fps, camera.crop_width, width)
        return result
    return analysis

def reframe_clip(source: Path, output: Path, core_root: str, mode: str = "auto") -> str:
    """Return framing actually used, so fallback is visible in job logs.

    The input is already cut to the reviewed range. Existing manual/legacy
    crops are handled by runner rather than passing them through this engine.
    """
    if mode not in ("auto", "contain"):
        raise PolicyError("REQUEST_INVALID")
    if mode == "contain":
        _whole_frame(source, output)
        return "whole_frame"
    assert_core_checkout(core_root)
    if core_root not in sys.path:
        sys.path.insert(0, core_root)
    # Set BEFORE imports and override cached module flags too. A rendering job
    # must never acquire a direct-provider path from deployment environment.
    for key in ("AUTO_LAYOUT", "SCREENCAST_LAYOUT", "SPLIT_LAYOUT", "SPEAKER_SIGNAL", "SPEAKER_CUT"):
        os.environ[key] = "0"
    os.environ["REFRAME_ENGINE"] = "v2"
    os.environ["GENERAL_CONTENT_HEIGHT_RATIO"] = "0"
    try:
        import main
        import reframe_v2
        import screencast_layout
        import split_layout
        import active_speaker
        import layout_picker
        # Upstream defaults GENERAL to a 42%-height foreground, cropping
        # ~24% of landscape width. Here no-face/group means retain ALL content.
        reframe_v2.GENERAL_CONTENT_HEIGHT_RATIO = 0.0
        screencast_layout.ENABLED = False
        split_layout.ENABLED = False
        active_speaker.ENABLED = False
        active_speaker.CUT_MODE = False
        layout_picker.ENABLED = False
        layout_picker.SHADOW = False
        # Call v2 directly: never fall back to the older center-crop frame loop.
        # It uses per-scene face tracking and full-width GENERAL layouts.
        # The pinned Ubuntu FFmpeg lacks -fps_mode used by upstream sparse
        # decoding. Use its full-frame detector pass rather than a failed
        # sparse subprocess followed by the same dense recovery on every job.
        sparse = reframe_v2.SPARSE_TRAJECTORY
        reframe_v2.SPARSE_TRAJECTORY = False
        camera = main.SmoothedCameraman
        analysis = reframe_v2._analyze_trajectory
        commands = reframe_v2.dedupe_sendcmd_lines
        main.SmoothedCameraman = _face_safe_camera(camera)
        reframe_v2._analyze_trajectory = _smooth_analysis(analysis)
        reframe_v2.dedupe_sendcmd_lines = frame_aligned_commands
        try:
            reframe_v2.render(str(source), str(output), 9 / 16, watermark=False)
        finally:
            reframe_v2.SPARSE_TRAJECTORY = sparse
            main.SmoothedCameraman = camera
            reframe_v2._analyze_trajectory = analysis
            reframe_v2.dedupe_sendcmd_lines = commands
        if not output.is_file() or output.stat().st_size == 0:
            raise RuntimeError("No reframed output")
        return "scene_aware_auto"
    except Exception as error:
        # Full-frame is an honest safe fallback; log the cause, not a false
        # successful tracking claim. Do not log signed source URLs or secrets.
        print(f"SPAWN framing fallback: {type(error).__name__}; preserving whole frame", flush=True)
        _whole_frame(source, output)
        return "whole_frame_fallback"
