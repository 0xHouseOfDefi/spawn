import json
import unittest

from spawn_clipper.policy import (
    MAX_DURATION_MS,
    MAX_SOURCE_BYTES,
    PolicyError,
    assert_direct_source_url,
    assert_public_addresses,
    classify_import_url,
    parse_import_request,
)

PUT = "https://account.r2.cloudflarestorage.com/bucket/creator/source-imports/v1/srcimport_abc?X-Amz-Signature=def"


def _import(**overrides):
    body = {
        "job_id": "srcimport_abc",
        "source_url": "https://www.youtube.com/watch?v=iG9CE55wbtY",
        "put_url": PUT,
        "max_bytes": MAX_SOURCE_BYTES,
        "max_duration_ms": MAX_DURATION_MS,
    }
    body.update(overrides)
    return json.dumps(body).encode()


class ImportPolicyTest(unittest.TestCase):
    def code(self, fn, *args):
        with self.assertRaises(PolicyError) as caught:
            fn(*args)
        return caught.exception.code

    def test_platform_links_use_only_their_named_extractors(self):
        cases = {
            "https://www.youtube.com/watch?v=abc": ("youtube", ("youtube",)),
            "https://youtu.be/abc": ("youtube", ("youtube",)),
            "https://www.twitch.tv/videos/123": ("twitch", ("twitch:vod", "twitch:clips")),
            "https://clips.twitch.tv/SomeClip": ("twitch", ("twitch:clips",)),
            "https://x.com/user/status/1": ("x", ("twitter",)),
            "https://twitter.com/user/status/1": ("x", ("twitter",)),
            "https://vimeo.com/123": ("vimeo", ("vimeo",)),
            "https://www.tiktok.com/@u/video/1": ("tiktok", ("tiktok",)),
            "https://vm.tiktok.com/ZM123/": ("tiktok", ("vm.tiktok", "tiktok")),
            "https://WWW.YOUTUBE.COM./watch?v=abc": ("youtube", ("youtube",)),
        }
        for url, (platform, extractors) in cases.items():
            self.assertEqual(classify_import_url(url), ("platform", platform, extractors), url)
        for kind, platform, extractors in [classify_import_url("https://cdn.example.com/talk.mp4")]:
            self.assertEqual((kind, platform, extractors), ("direct", "direct", ()))

    def test_ssrf_shapes_are_refused_before_any_fetch(self):
        invalid = [
            "http://www.youtube.com/watch?v=abc",
            "ftp://example.com/a.mp4",
            "https://user:pass@example.com/a.mp4",
            "https://example.com@127.0.0.1/a.mp4",
            "https://example.com:8443/a.mp4",
            "https://exa mple.com/a.mp4",
            "https://example.com/a.mp4\n",
            "https://" + "a" * 2050 + ".com/",
            "",
            None,
        ]
        for url in invalid:
            self.assertEqual(self.code(classify_import_url, url), "IMPORT_URL_INVALID", url)
        private = [
            "https://localhost/a.mp4",
            "https://127.0.0.1/a.mp4",
            "https://[::1]/a.mp4",
            "https://10.0.0.8/a.mp4",
            "https://169.254.169.254/latest/meta-data",
            "https://2130706433/a.mp4",
            "https://0x7f000001/a.mp4",
            "https://127.1/a.mp4",
            "https://8.8.8.8/a.mp4",
            "https://printer.local/a.mp4",
            "https://svc.internal/a.mp4",
            "https://metadata.google.internal/computeMetadata/v1/",
            "https://intranet/a.mp4",
            "https://foo.localhost/a.mp4",
            "https://-bad.example.com/a.mp4",
        ]
        for url in private:
            self.assertEqual(self.code(classify_import_url, url), "IMPORT_URL_PRIVATE", url)

    def test_resolved_addresses_must_all_be_global(self):
        assert_public_addresses(["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"])
        for addresses in (
            ["93.184.216.34", "10.1.2.3"],
            ["127.0.0.1"],
            ["169.254.169.254"],
            ["::1"],
            ["fd00::1"],
            ["::ffff:127.0.0.1"],
            ["100.64.0.1"],
            ["0.0.0.0"],
            ["224.0.0.1"],
            ["not-an-ip"],
        ):
            self.assertEqual(self.code(assert_public_addresses, addresses), "IMPORT_URL_PRIVATE", addresses)
        self.assertEqual(self.code(assert_public_addresses, []), "IMPORT_FETCH_FAILED")

    def test_import_request_is_exact_and_bounded(self):
        self.assertEqual(parse_import_request(_import())["job_id"], "srcimport_abc")
        bad = [
            _import(job_id="clipjob_abc"),
            _import(max_bytes=MAX_SOURCE_BYTES + 1),
            _import(max_bytes=0),
            _import(max_bytes=True),
            _import(max_duration_ms=MAX_DURATION_MS + 1),
            _import(max_duration_ms="1800000"),
            _import(extra="x"),
            b"[]",
            b"{",
        ]
        for raw in bad:
            self.assertEqual(self.code(parse_import_request, raw), "REQUEST_INVALID", raw)
        self.assertEqual(self.code(parse_import_request, _import(source_url="https://127.0.0.1/a.mp4")), "IMPORT_URL_PRIVATE")
        # The signed upload target must be a direct object URL, never a platform or plain HTTP.
        self.assertEqual(self.code(parse_import_request, _import(put_url="https://www.youtube.com/upload")), "URL_INGEST_DISABLED")
        self.assertEqual(self.code(parse_import_request, _import(put_url="http://r2.example/x")), "URL_INGEST_DISABLED")

    def test_gpu_jobs_still_refuse_platform_links(self):
        # URL ingest is only the import function. Signed-object fields keep the old block.
        for url in ("https://www.youtube.com/watch?v=abc", "https://vimeo.com/1", "https://x.com/a/status/1"):
            self.assertEqual(self.code(assert_direct_source_url, url), "URL_INGEST_DISABLED")


class ImporterHelpersTest(unittest.TestCase):
    def setUp(self):
        try:
            import httpx  # noqa: F401
        except ImportError:
            self.skipTest("httpx is installed in the Modal image, not required for policy tests")

    def test_bitrate_fits_the_byte_cap_or_refuses(self):
        from spawn_clipper.importer import video_bitrate_kbps

        rate = video_bitrate_kbps(MAX_SOURCE_BYTES, MAX_DURATION_MS, True)
        self.assertGreaterEqual(rate, 120)
        self.assertLessEqual((rate + 64) * 1000 / 8 * (MAX_DURATION_MS / 1000), MAX_SOURCE_BYTES)
        with self.assertRaises(PolicyError) as caught:
            video_bitrate_kbps(8 * 1024 * 1024, MAX_DURATION_MS, True)
        self.assertEqual(caught.exception.code, "IMPORT_TOO_LARGE")

    def test_live_playlists_and_overlong_videos_are_refused(self):
        from spawn_clipper.importer import _platform_error, check_platform_info

        check_platform_info({"duration": 1200, "live_status": "not_live"}, MAX_DURATION_MS)
        for info, code in (
            ({"_type": "playlist"}, "IMPORT_URL_UNSUPPORTED"),
            ({"is_live": True}, "IMPORT_LIVE_UNSUPPORTED"),
            ({"live_status": "is_upcoming"}, "IMPORT_LIVE_UNSUPPORTED"),
            ({"duration": 1801}, "IMPORT_TOO_LONG"),
        ):
            with self.assertRaises(PolicyError) as caught:
                check_platform_info(info, MAX_DURATION_MS)
            self.assertEqual(caught.exception.code, code)
        self.assertEqual(_platform_error("Sign in to confirm you're not a bot").code, "IMPORT_PLATFORM_REFUSED")
        self.assertEqual(_platform_error("Unsupported URL: https://x").code, "IMPORT_URL_UNSUPPORTED")
        self.assertEqual(_platform_error("This page has an image").code, "IMPORT_FETCH_FAILED")


if __name__ == "__main__":
    unittest.main()
