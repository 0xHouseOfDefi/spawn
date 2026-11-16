"""Offline, shot-local camera paths. Pure Python; no inference or network calls.

A face detector emits measurements every few frames. Applying its safe crop
boundary immediately produces a visible staircase even though the face stays
inside the frame. Interpolate those accepted measurements before constraining
a short, symmetric camera filter. This removes detector cadence without a
causal filter's extra tracking lag. Never filter across a scene boundary.
"""
from __future__ import annotations

import math
from typing import Sequence

Box = tuple[float, float, float, float] | None


def _interpolate_boxes(boxes: Sequence[Box]) -> list[Box]:
    """Interpolate sample-and-held accepted boxes, not rejected detections.

    Keep missing-data runs missing. A new scene is supplied in a separate call.
    The final held measurement is held, not extrapolated beyond evidence.
    """
    result = list(boxes)
    start = 0
    while start < len(boxes):
        if boxes[start] is None:
            start += 1
            continue
        end = start + 1
        while end < len(boxes) and boxes[end] is not None:
            end += 1
        anchors = [start]
        anchors.extend(i for i in range(start + 1, end) if boxes[i] != boxes[i - 1])
        for left, right in zip(anchors, anchors[1:]):
            a, b = boxes[left], boxes[right]
            assert a is not None and b is not None
            for i in range(left + 1, right):
                t = (i - left) / (right - left)
                result[i] = tuple(x + (y - x) * t for x, y in zip(a, b))
        start = end
    return result


def smooth_scene_camera(
    xs: Sequence[int], boxes: Sequence[Box], fps: float,
    crop_width: int, video_width: int,
) -> list[int]:
    """Smooth accepted camera positions, retaining interpolated face margins.

    The 400 ms full window is deliberately short: remove detection cadence,
    not turn a brisk subject move into a long camera drift. Composition aims
    for a smoothed 35%-face-width lateral margin; the raw safety bound retains
    a 10% margin when the crop can fit it. Source coordinates stay bounded.
    """
    if len(xs) != len(boxes) or not xs or not math.isfinite(fps) or fps <= 0:
        return list(xs)
    if crop_width <= 0 or video_width < crop_width:
        return list(xs)
    radius = min(30, max(1, round(fps * 0.2)))
    measurements = _interpolate_boxes(boxes)
    # Detector box size/centre also jitters. A padded corridor built directly
    # from those samples would reintroduce the steps after filtering the path.
    # Smooth composition bounds, then enforce a tighter unsmoothed face bound.
    composed = []
    for i, box in enumerate(measurements):
        if box is None:
            composed.append(None)
            continue
        left, right = i, i + 1
        while left > max(0, i-radius) and measurements[left-1] is not None:
            left -= 1
        while right < min(len(xs), i+radius+1) and measurements[right] is not None:
            right += 1
        nearby = [(j, measurements[j]) for j in range(left, right)]
        weights = [radius + 1 - abs(i-j) for j, _ in nearby]
        composed.append(tuple(sum(b[k]*w for (_, b), w in zip(nearby, weights))/sum(weights)
                              for k in range(4)))
    max_x = video_width - crop_width
    result = []
    for i in range(len(xs)):
        total = weight = 0.0
        for j in range(max(0, i - radius), min(len(xs), i + radius + 1)):
            w = radius + 1 - abs(i - j)
            total += xs[j] * w
            weight += w
        x = total / weight
        box = composed[i]
        if box is not None:
            fx, _fy, fw, _fh = box
            if all(math.isfinite(v) for v in box) and fw > 0:
                pad = min(fw * .35, max(0, (crop_width - fw) / 2))
                left, right = fx - pad, fx + fw + pad
                if right - left <= crop_width:
                    x = min(max(x, right - crop_width), left)
                else:
                    # A face larger than the available crop cannot be kept
                    # whole by horizontal motion; retain the existing centre.
                    x = fx + fw / 2 - crop_width / 2
        raw = measurements[i]
        if raw is not None and all(math.isfinite(v) for v in raw) and raw[2] > 0:
            fx, _fy, fw, _fh = raw
            # Do not sacrifice the observed face to make a smooth camera path.
            # The larger composition margin above handles headroom; this hard
            # bound only catches unusually fast movement or detector changes.
            pad = min(fw * .10, max(0, (crop_width-fw)/2))
            left, right = fx-pad, fx+fw+pad
            if right-left <= crop_width:
                x = min(max(x, right-crop_width), left)
            else:
                x = fx+fw/2-crop_width/2
        result.append(round(min(max(0, x), max_x)))
    return result


def frame_aligned_commands(xs: Sequence[int], fps: float, target: str = "crop@c") -> list[str]:
    """Apply each change on its intended decoded frame, not one frame late.

    Rounding i/fps to four decimals can put a command after that frame's PTS
    (e.g. 0.0667 > 2/30). FFmpeg then applies it a frame late. Place changes
    halfway between the prior frame and the intended frame instead. This is
    safe for the engine's constant-rate per-scene crop stream and preserves
    de-duplication and the initial zero-time command.
    """
    if not math.isfinite(fps) or fps <= 0:
        raise ValueError("Invalid camera frame rate")
    lines, previous = [], None
    for i, x in enumerate(xs):
        if x != previous:
            timestamp = max(0.0, (i - .5) / fps)
            lines.append(f"{timestamp:.8f} {target} x {x};")
            previous = x
    return lines
