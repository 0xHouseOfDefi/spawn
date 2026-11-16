"""Fetch one owner-supplied public video link into a SPAWN-signed upload URL.

Runs only in the CPU import container. Each call uses its own scratch
directory that is deleted before it returns. The output is always one MP4
(H.264/AAC, faststart) no larger than ``max_bytes`` and no longer than
``max_duration_ms``. Nothing is published and no cookies or accounts are used.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import shutil
import socket
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urljoin, urlparse

import httpx

from spawn_clipper.policy import (
    MAX_IMPORT_DOWNLOAD_BYTES,
    PolicyError,
    assert_direct_source_url,
    assert_public_addresses,
    classify_import_url,
    refuse_publish_environment,
)

MAX_REDIRECTS = 5
AUDIO_KBPS = 64
MIN_VIDEO_KBPS = 120
# Leave room for MP4 container overhead when fitting a bitrate to the byte cap.
SIZE_HEADROOM = 0.9
_MP4_BRANDS = {b"isom", b"iso2", b"iso3", b"iso4", b"iso5", b"iso6", b"mp41", b"mp42", b"avc1", b"dash", b"M4V "}
# Prefer small H.264/AAC renditions so most talks fit without re-encoding.
YTDLP_FORMAT = (
    "bv*[height<=480][vcodec^=avc1]+ba[acodec^=mp4a]/"
    "b[height<=480][vcodec^=avc1]/"
    "bv*[height<=480]+ba/b[height<=480]/"
    "bv*[height<=720]+ba/b[height<=720]/"
    "wv*+wa/w"
)


def run_import(job: dict) -> dict:
    refuse_publish_environment()
    kind, _platform, extractors = classify_import_url(job["source_url"])
    assert_direct_source_url(job["put_url"])
    work = tempfile.mkdtemp(prefix=f"spawn-import-{job['job_id']}-")
    try:
        root = Path(work)
        if kind == "platform":
            fetched = _fetch_platform(job["source_url"], extractors, root, int(job["max_duration_ms"]))
        else:
            fetched = _fetch_direct(job["source_url"], root / "download")
        output = _fit(fetched, root, int(job["max_bytes"]), int(job["max_duration_ms"]))
        probe = _probe(output)
        duration_ms = _duration_ms(probe)
        size = output.stat().st_size
        if not 1 <= duration_ms <= int(job["max_duration_ms"]):
            raise PolicyError("IMPORT_TOO_LONG")
        if not 1 <= size <= int(job["max_bytes"]):
            raise PolicyError("IMPORT_TOO_LARGE")
        _assert_mp4_header(output)
        digest = _sha256(output)
        _put_file(job["put_url"], output, size)
        return {
            "sha256": digest,
            "bytes": size,
            "duration_ms": duration_ms,
            "mime_type": "video/mp4",
        }
    finally:
        shutil.rmtree(work, ignore_errors=True)


def resolve_public(host: str) -> list[str]:
    try:
        infos = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    except OSError as error:
        raise PolicyError("IMPORT_FETCH_FAILED") from error
    addresses = sorted({info[4][0] for info in infos})
    assert_public_addresses(addresses)
    return addresses


def _fetch_direct(url: str, dest: Path) -> Path:
    """Download a direct file. Every hop is re-checked and pinned to the address that was checked."""
    current = url
    for _hop in range(MAX_REDIRECTS + 1):
        classify_import_url(current)
        parsed = urlparse(current)
        host = parsed.hostname.lower().rstrip(".")
        address = resolve_public(host)[0]
        target = parsed._replace(netloc=f"[{address}]" if ":" in address else address).geturl()
        with httpx.Client(follow_redirects=False, timeout=httpx.Timeout(30.0, read=120.0), trust_env=False) as client:
            request = client.build_request(
                "GET",
                target,
                headers={"host": host, "user-agent": "spawn-source-import/1", "accept": "video/*,*/*;q=0.5"},
                extensions={"sni_hostname": host},
            )
            response = client.send(request, stream=True)
            try:
                if response.status_code in (301, 302, 303, 307, 308):
                    location = response.headers.get("location")
                    if not location:
                        raise PolicyError("IMPORT_FETCH_FAILED")
                    current = urljoin(current, location)
                    continue
                if response.status_code != 200:
                    raise PolicyError("IMPORT_FETCH_FAILED")
                declared = response.headers.get("content-length")
                if declared and declared.isdigit() and int(declared) > MAX_IMPORT_DOWNLOAD_BYTES:
                    raise PolicyError("IMPORT_TOO_LARGE")
                count = 0
                with dest.open("wb") as handle:
                    for chunk in response.iter_bytes():
                        count += len(chunk)
                        if count > MAX_IMPORT_DOWNLOAD_BYTES:
                            raise PolicyError("IMPORT_TOO_LARGE")
                        handle.write(chunk)
                if count == 0:
                    raise PolicyError("IMPORT_FORMAT_UNSUPPORTED")
                return dest
            except httpx.HTTPError as error:
                raise PolicyError("IMPORT_FETCH_FAILED") from error
            finally:
                response.close()
    raise PolicyError("IMPORT_FETCH_FAILED")


def _platform_error(message: str) -> PolicyError:
    text = message.lower()
    if any(
        marker in text
        for marker in (
            "sign in",
            "log in",
            "login",
            "confirm you",
            "not a bot",
            "private video",
            "members-only",
            "age-restricted",
            "confirm your age",
            "cookies",
            "429",
            "403",
            "geo",
            "not available in your country",
            "tls fingerprint",
        )
    ):
        return PolicyError("IMPORT_PLATFORM_REFUSED")
    if "unsupported url" in text:
        return PolicyError("IMPORT_URL_UNSUPPORTED")
    return PolicyError("IMPORT_FETCH_FAILED")


def check_platform_info(info: dict, max_duration_ms: int) -> None:
    if not isinstance(info, dict) or info.get("_type") in ("playlist", "multi_video", "url", "url_transparent"):
        raise PolicyError("IMPORT_URL_UNSUPPORTED")
    if info.get("is_live") or info.get("live_status") in ("is_live", "is_upcoming", "post_live"):
        raise PolicyError("IMPORT_LIVE_UNSUPPORTED")
    duration = info.get("duration")
    if isinstance(duration, (int, float)) and duration * 1000 > max_duration_ms:
        raise PolicyError("IMPORT_TOO_LONG")


def _fetch_platform(url: str, extractors: tuple[str, ...], root: Path, max_duration_ms: int) -> Path:
    import re

    import yt_dlp

    class _Quiet:
        def debug(self, _msg):
            pass

        def warning(self, _msg):
            pass

        def error(self, _msg):
            pass

    options = {
        "allowed_extractors": [re.escape(name) for name in extractors],
        "noplaylist": True,
        "playlist_items": "1",
        "format": YTDLP_FORMAT,
        "merge_output_format": "mp4",
        "outtmpl": {"default": str(root / "download.%(ext)s")},
        "paths": {"home": str(root), "temp": str(root)},
        "max_filesize": MAX_IMPORT_DOWNLOAD_BYTES,
        "noprogress": True,
        "quiet": True,
        "no_warnings": True,
        "logger": _Quiet(),
        "cachedir": False,
        "cookiefile": None,
        "external_downloader": {},
        "socket_timeout": 30,
        "retries": 2,
        "fragment_retries": 3,
        "concurrent_fragment_downloads": 4,
        "overwrites": True,
        "writesubtitles": False,
        "writethumbnail": False,
        "writeinfojson": False,
        "check_formats": False,
    }
    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            # Resolves short links with the same extractor list and picks formats. Nothing is downloaded yet.
            info = ydl.extract_info(url, download=False)
            check_platform_info(info, max_duration_ms)
            for chosen in info.get("requested_formats") or [info]:
                media = chosen.get("url")
                host = (urlparse(media).hostname or "") if isinstance(media, str) else ""
                if not host or urlparse(media).scheme != "https":
                    raise PolicyError("IMPORT_FORMAT_UNSUPPORTED")
                resolve_public(host.lower())
            ydl.process_info(info)
    except PolicyError:
        raise
    except yt_dlp.utils.DownloadError as error:
        raise _platform_error(str(error)) from error
    except Exception as error:  # yt-dlp raises many extractor-specific types
        raise _platform_error(str(error)) from error
    files = [path for path in root.iterdir() if path.name.startswith("download.") and path.is_file() and not path.name.endswith((".part", ".ytdl"))]
    if len(files) != 1:
        raise PolicyError("IMPORT_FETCH_FAILED")
    if files[0].stat().st_size > MAX_IMPORT_DOWNLOAD_BYTES:
        raise PolicyError("IMPORT_TOO_LARGE")
    return files[0]


def _probe(path: Path) -> dict:
    try:
        completed = subprocess.run(
            ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)],
            check=True,
            capture_output=True,
            timeout=120,
        )
        return json.loads(completed.stdout.decode("utf-8"))
    except (subprocess.SubprocessError, ValueError, UnicodeError) as error:
        raise PolicyError("IMPORT_FORMAT_UNSUPPORTED") from error


def _duration_ms(probe: dict) -> int:
    try:
        seconds = float((probe.get("format") or {}).get("duration"))
    except (TypeError, ValueError) as error:
        raise PolicyError("IMPORT_FORMAT_UNSUPPORTED") from error
    if not math.isfinite(seconds) or seconds <= 0:
        raise PolicyError("IMPORT_FORMAT_UNSUPPORTED")
    return int(round(seconds * 1000))


def _streams(probe: dict) -> tuple[dict | None, dict | None]:
    video = next((s for s in probe.get("streams") or [] if s.get("codec_type") == "video" and not (s.get("disposition") or {}).get("attached_pic")), None)
    audio = next((s for s in probe.get("streams") or [] if s.get("codec_type") == "audio"), None)
    return video, audio


def video_bitrate_kbps(max_bytes: int, duration_ms: int, has_audio: bool) -> int:
    total = math.floor(max_bytes * 8 * SIZE_HEADROOM / (duration_ms / 1000) / 1000)
    video = total - (AUDIO_KBPS if has_audio else 0)
    if video < MIN_VIDEO_KBPS:
        raise PolicyError("IMPORT_TOO_LARGE")
    return min(video, 2500)


def _ffmpeg(args: list[str]) -> None:
    try:
        subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", *args], check=True, capture_output=True, timeout=35 * 60)
    except subprocess.SubprocessError as error:
        raise PolicyError("IMPORT_FORMAT_UNSUPPORTED") from error


def _fit(source: Path, root: Path, max_bytes: int, max_duration_ms: int) -> Path:
    """Remux when the streams already fit; otherwise re-encode to a bitrate that fits the cap."""
    probe = _probe(source)
    duration_ms = _duration_ms(probe)
    if duration_ms > max_duration_ms:
        raise PolicyError("IMPORT_TOO_LONG")
    video, audio = _streams(probe)
    if not video:
        raise PolicyError("IMPORT_FORMAT_UNSUPPORTED")
    maps = ["-map", "0:v:0"] + (["-map", "0:a:0"] if audio else [])
    common = ["-map_metadata", "-1", "-dn", "-sn", "-movflags", "+faststart", "-f", "mp4"]
    copied = root / "copy.mp4"
    if (
        video.get("codec_name") == "h264"
        and (not audio or audio.get("codec_name") == "aac")
        and source.stat().st_size <= max_bytes
    ):
        _ffmpeg(["-i", str(source), *maps, "-c", "copy", *common, str(copied)])
        if copied.stat().st_size <= max_bytes:
            return copied
    rate = video_bitrate_kbps(max_bytes, duration_ms, bool(audio))
    height = 720 if rate >= 1500 else 480 if rate >= 450 else 360
    encoded = root / "encoded.mp4"
    for attempt in (rate, int(rate * 0.8)):
        if attempt < MIN_VIDEO_KBPS:
            break
        _ffmpeg(
            [
                "-i", str(source), *maps,
                "-vf", f"scale=-2:'min({height},ih)'",
                "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "main", "-pix_fmt", "yuv420p",
                "-b:v", f"{attempt}k", "-maxrate", f"{int(attempt * 1.2)}k", "-bufsize", f"{attempt * 2}k",
                *(["-c:a", "aac", "-b:a", f"{AUDIO_KBPS}k", "-ac", "2"] if audio else []),
                *common, str(encoded),
            ]
        )
        if encoded.stat().st_size <= max_bytes:
            return encoded
    raise PolicyError("IMPORT_TOO_LARGE")


def _assert_mp4_header(path: Path) -> None:
    with path.open("rb") as handle:
        head = handle.read(4096)
    size = int.from_bytes(head[0:4], "big") if len(head) >= 4 else 0
    if len(head) < 16 or head[4:8] != b"ftyp" or not 16 <= size <= 4096 or head[8:12] not in _MP4_BRANDS:
        raise PolicyError("IMPORT_FORMAT_UNSUPPORTED")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _put_file(url: str, path: Path, size: int) -> None:
    assert_direct_source_url(url)

    def body():
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                yield chunk

    try:
        response = httpx.put(
            url,
            content=body(),
            headers={"content-type": "video/mp4", "content-length": str(size)},
            follow_redirects=False,
            timeout=httpx.Timeout(30.0, write=600.0, read=120.0),
        )
    except httpx.HTTPError as error:
        raise PolicyError("IMPORT_UPLOAD_FAILED") from error
    if response.status_code not in (200, 201, 204):
        raise PolicyError("IMPORT_UPLOAD_FAILED")


if __name__ == "__main__":  # Local check: python -m spawn_clipper.importer URL OUTDIR
    import sys

    os.environ.setdefault("BILLING_ENABLED", "0")
    kind, _platform, extractors = classify_import_url(sys.argv[1])
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    fetched = _fetch_platform(sys.argv[1], extractors, out, 30 * 60 * 1000) if kind == "platform" else _fetch_direct(sys.argv[1], out / "download")
    fitted = _fit(fetched, out, 128 * 1024 * 1024, 30 * 60 * 1000)
    _assert_mp4_header(fitted)
    print(json.dumps({"path": str(fitted), "bytes": fitted.stat().st_size, "duration_ms": _duration_ms(_probe(fitted)), "sha256": _sha256(fitted)}))
